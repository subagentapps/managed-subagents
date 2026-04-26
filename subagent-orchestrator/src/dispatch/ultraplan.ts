// dispatch/ultraplan.ts — kick off /ultraplan via the Agent SDK.
// M6 piece. Ultraplan launches a web session in plan mode that drafts a
// plan in the cloud while the terminal stays free. See:
// code.claude.com/docs/en/ultraplan.md and our research notes at
// subagent-commands/ultraplan-and-ultrareview.md.

import type { Task, TaskResult } from "../types.js";
import type { SdkQueryFn, SdkMessage, SdkResultMessage } from "./local.js";

export interface DispatchUltraplanOptions {
  cwd?: string;
  /** Inject for testing; defaults to require('@anthropic-ai/claude-agent-sdk').query */
  sdkOverride?: { query: SdkQueryFn };
  /** Bound the kickoff cost; default $2 (the kickoff is light — drafting happens in the web session). */
  maxBudgetUsd?: number;
}

const DEFAULT_MAX_BUDGET_USD = 2;

/**
 * Dispatch a task by invoking /ultraplan. Returns when the kickoff
 * completes — the actual plan drafts in the web session and lands as
 * a notification handled separately by the orchestrator's watch layer.
 */
export async function dispatchUltraplan(
  task: Task,
  options: DispatchUltraplanOptions = {},
): Promise<TaskResult> {
  const sdkQuery = options.sdkOverride?.query ?? (await loadRealSdkQuery());
  const maxBudgetUsd = options.maxBudgetUsd ?? DEFAULT_MAX_BUDGET_USD;
  const cwd = options.cwd ?? process.cwd();

  // The /ultraplan command takes a free-form description as args.
  const prompt = `/ultraplan ${task.prompt}`;

  let lastResult: SdkResultMessage | null = null;

  try {
    for await (const message of sdkQuery({
      prompt,
      options: {
        // Ultraplan drafts in the cloud; locally we only need to confirm
        // the command launched. Keep tool surface minimal.
        allowedTools: ["Read", "Glob", "Grep"],
        permissionMode: "acceptEdits",
        cwd,
        maxTurns: 10,
      },
    })) {
      if (message.type === "result") {
        lastResult = message;
        const cost = message.total_cost_usd ?? 0;
        if (cost > maxBudgetUsd) {
          return {
            taskId: task.id,
            status: "failed",
            ultrareviewUsed: false,
            costUsdEstimate: cost,
            error: `Ultraplan kickoff exceeded budget: $${cost.toFixed(2)} > $${maxBudgetUsd}`,
          };
        }
      }
    }
  } catch (err) {
    return {
      taskId: task.id,
      status: "failed",
      ultrareviewUsed: false,
      error: `SDK error during ultraplan: ${(err as Error).message}`,
    };
  }

  if (!lastResult || lastResult.subtype !== "success") {
    return {
      taskId: task.id,
      status: "failed",
      ultrareviewUsed: false,
      costUsdEstimate: lastResult?.total_cost_usd,
      error: lastResult ? `Ultraplan kickoff: ${lastResult.subtype}` : "no result message",
    };
  }

  // The kickoff succeeded; the web session is now drafting. Status is
  // "dispatched" rather than "ready-for-merge" — the caller monitors
  // via /tasks for the eventual ready signal.
  return {
    taskId: task.id,
    status: "dispatched",
    ultrareviewUsed: false,
    costUsdEstimate: lastResult.total_cost_usd,
  };
}

async function loadRealSdkQuery(): Promise<SdkQueryFn> {
  const mod = await import("@anthropic-ai/claude-agent-sdk");
  return mod.query as unknown as SdkQueryFn;
}

// re-export SdkMessage so tests can satisfy the type
export type { SdkMessage };
