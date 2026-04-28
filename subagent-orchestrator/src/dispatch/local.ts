// dispatch/local.ts — invoke the Claude Agent SDK in-process for a Task.
//
// M3 implementation. Mock-friendly via SdkOverride; tests do not call
// the real SDK. See ../../docs/M3-dispatch-local.md for the spec.

import type { Task, TaskResult } from "../types.js";

/**
 * Subset of the Claude Agent SDK's `query()` we depend on.
 *
 * Defined here as a structural type so we can mock without importing
 * the SDK in tests (which would require it to be on the path even when
 * tests don't actually call the network).
 */
export type SdkQueryFn = (input: SdkQueryInput) => AsyncIterable<SdkMessage>;

export interface SdkQueryInput {
  prompt: string;
  options: SdkAgentOptions;
}

export interface SdkAgentOptions {
  allowedTools?: string[];
  permissionMode?: "default" | "acceptEdits" | "plan" | "auto" | "dontAsk" | "bypassPermissions";
  cwd?: string;
  maxTurns?: number;
  abortSignal?: AbortSignal;
}

export type SdkMessage =
  | { type: "system" | "user" | "assistant"; [key: string]: unknown }
  | SdkResultMessage;

export interface SdkResultMessage {
  type: "result";
  subtype:
    | "success"
    | "error_max_turns"
    | "error_max_budget_usd"
    | "error_other"
    | string;
  result?: string;
  total_cost_usd?: number;
  session_id?: string;
}

export interface DispatchLocalOptions {
  cwd?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  /** Inject for testing; defaults to require('@anthropic-ai/claude-agent-sdk').query */
  sdkOverride?: { query: SdkQueryFn };
}

const DEFAULT_MAX_TURNS = 30;
const DEFAULT_MAX_BUDGET_USD = 5;

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep", "Bash"];
const EDIT_TOOLS = ["Read", "Glob", "Grep", "Bash", "Edit", "Write"];

const READ_ONLY_RE =
  /\b(read-only|investigate|explore|search|grep|find|inspect|describe|summarize|run\s+tests?|run\s+lint|run\s+format|typecheck)\b/i;

// Edit-intent verbs override READ_ONLY_RE: a prompt containing these is
// asking the SDK to mutate files, even if it also mentions verification
// steps like `typecheck` or `run tests` that READ_ONLY_RE matches. Without
// this override the SDK ran in plan mode and silently produced no changes
// while still reporting `ready-for-merge` (burned ~$2.21 across two
// production sessions before this was caught).
const EDIT_INTENT_RE =
  /\b(write|modify|create|fix|add|implement|replace|edit|append|insert|delete|remove|refactor|rename|update|bump|migrate)\b/i;

export class DispatchError extends Error {
  constructor(message: string, public readonly partial?: Partial<TaskResult>) {
    super(message);
    this.name = "DispatchError";
  }
}

/**
 * Resolve a permission mode + allowedTools from a Task's text shape.
 * Exposed for testing; the heuristics intentionally match classify.ts.
 */
export function resolvePermissionShape(task: Task): {
  permissionMode: NonNullable<SdkAgentOptions["permissionMode"]>;
  allowedTools: string[];
} {
  const haystack = `${task.title}\n${task.prompt}`;
  if (EDIT_INTENT_RE.test(haystack)) {
    return { permissionMode: "acceptEdits", allowedTools: EDIT_TOOLS };
  }
  if (READ_ONLY_RE.test(haystack)) {
    return { permissionMode: "plan", allowedTools: READ_ONLY_TOOLS };
  }
  return { permissionMode: "acceptEdits", allowedTools: EDIT_TOOLS };
}

/**
 * Dispatch one Task by spawning a Claude Agent SDK query in-process.
 * Mock-friendly via options.sdkOverride.
 */
export async function dispatchLocal(
  task: Task,
  options: DispatchLocalOptions = {},
): Promise<TaskResult> {
  const sdkQuery = options.sdkOverride?.query ?? (await loadRealSdkQuery());
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const maxBudgetUsd = options.maxBudgetUsd ?? DEFAULT_MAX_BUDGET_USD;
  const cwd = options.cwd ?? process.cwd();

  const { permissionMode, allowedTools } = resolvePermissionShape(task);

  let lastResult: SdkResultMessage | null = null;
  let sawEditToolUse = false;
  const abortController = new AbortController();

  try {
    for await (const message of sdkQuery({
      prompt: task.prompt,
      options: {
        allowedTools,
        permissionMode,
        cwd,
        maxTurns,
        abortSignal: abortController.signal,
      },
    })) {
      if (message.type === "assistant" && !sawEditToolUse) {
        sawEditToolUse = messageHasEditToolUse(message);
      }
      if (message.type === "result") {
        lastResult = message;
        const cost = message.total_cost_usd ?? 0;
        if (cost > maxBudgetUsd) {
          abortController.abort();
          return {
            taskId: task.id,
            status: "failed",
            ultrareviewUsed: false,
            costUsdEstimate: cost,
            error: `Budget exceeded: $${cost.toFixed(2)} > $${maxBudgetUsd.toFixed(2)} cap`,
          };
        }
      }
    }
  } catch (err) {
    return {
      taskId: task.id,
      status: "failed",
      ultrareviewUsed: false,
      error: `SDK error: ${(err as Error).message}`,
    };
  }

  if (!lastResult) {
    return {
      taskId: task.id,
      status: "failed",
      ultrareviewUsed: false,
      error: "SDK returned no result message",
    };
  }

  if (lastResult.subtype !== "success") {
    return {
      taskId: task.id,
      status: "failed",
      ultrareviewUsed: false,
      costUsdEstimate: lastResult.total_cost_usd,
      error: `SDK result subtype: ${lastResult.subtype}`,
    };
  }

  // Plan-mode no-op guard: if the heuristic routed this task into plan mode
  // but no Edit/Write/MultiEdit tool_use was observed, the SDK could not have
  // mutated the working tree — yet we'd otherwise return ready-for-merge.
  // Production rows #20 and #21 in dispatch_log silently no-op'd this way.
  // Genuine read-only tasks won't hit this branch in practice because the
  // edit-intent override sends them to acceptEdits; if a true read-only task
  // does land in plan mode, callers can short-circuit before dispatch.
  if (permissionMode === "plan" && !sawEditToolUse) {
    return {
      taskId: task.id,
      status: "failed",
      ultrareviewUsed: false,
      costUsdEstimate: lastResult.total_cost_usd,
      error:
        "plan-mode produced no edits — heuristic likely classified this as read-only by mistake",
    };
  }

  return {
    taskId: task.id,
    status: "ready-for-merge",
    ultrareviewUsed: false,
    costUsdEstimate: lastResult.total_cost_usd,
  };
}

/**
 * Inspect an SDK assistant message for any tool_use block whose name is
 * Edit, Write, or MultiEdit. The SDK shape is `{ message: { content: [...] } }`
 * with each content block tagged by `type`. We defensively narrow because
 * the structural type here uses `[key: string]: unknown`.
 */
function messageHasEditToolUse(message: { [key: string]: unknown }): boolean {
  const inner = (message["message"] as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(inner)) return false;
  for (const block of inner) {
    if (
      block !== null &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "tool_use"
    ) {
      const name = (block as { name?: unknown }).name;
      if (typeof name === "string" && /^(Edit|Write|MultiEdit)$/.test(name)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Lazy-load the real SDK only if no override is provided. Avoids
 * pulling the SDK during typecheck / tests when we mock it.
 */
async function loadRealSdkQuery(): Promise<SdkQueryFn> {
  const mod = await import("@anthropic-ai/claude-agent-sdk");
  return mod.query as unknown as SdkQueryFn;
}
