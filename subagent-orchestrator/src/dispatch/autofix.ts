// dispatch/autofix.ts — kick off /autofix-pr via the Agent SDK.
// M6 piece. Spawns a Claude Code on the web session that watches the
// PR's CI + reviews and pushes fixes until green. See:
// code.claude.com/docs/en/commands.md (search /autofix-pr) and
// subagent-commands/whats-new/2026wk13/claude-code-week13.md.

import type { Task, TaskResult } from "../types.js";
import type { SdkQueryFn, SdkResultMessage } from "./local.js";

export interface DispatchAutofixOptions {
  cwd?: string;
  /** PR number to autofix; required */
  prNumber: number;
  /** Optional refinement prompt for the autofix (default: address all CI failures + review comments) */
  refinement?: string;
  sdkOverride?: { query: SdkQueryFn };
  /** Cap kickoff cost; default $2 */
  maxBudgetUsd?: number;
}

const DEFAULT_MAX_BUDGET_USD = 2;

/**
 * Dispatch an autofix kickoff. The web session watches the PR
 * indefinitely; this function returns once the kickoff completes.
 */
export async function dispatchAutofix(
  task: Task,
  options: DispatchAutofixOptions,
): Promise<TaskResult> {
  const sdkQuery = options.sdkOverride?.query ?? (await loadRealSdkQuery());
  const maxBudgetUsd = options.maxBudgetUsd ?? DEFAULT_MAX_BUDGET_USD;
  const cwd = options.cwd ?? process.cwd();

  // /autofix-pr launches the web session for the PR derived from the
  // current branch. To target a specific PR we either need to be
  // checked out on its branch OR include a refinement that names the PR.
  // For programmatic use we always pass refinement explicitly.
  const refinement =
    options.refinement ??
    `address all CI failures and review comments on PR #${options.prNumber}`;
  const prompt = `/autofix-pr ${refinement}`;

  let lastResult: SdkResultMessage | null = null;

  try {
    for await (const message of sdkQuery({
      prompt,
      options: {
        allowedTools: ["Bash", "Read", "Glob", "Grep"],
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
            error: `Autofix kickoff exceeded budget: $${cost.toFixed(2)} > $${maxBudgetUsd}`,
          };
        }
      }
    }
  } catch (err) {
    return {
      taskId: task.id,
      status: "failed",
      ultrareviewUsed: false,
      error: `SDK error during autofix: ${(err as Error).message}`,
    };
  }

  if (!lastResult || lastResult.subtype !== "success") {
    return {
      taskId: task.id,
      status: "failed",
      ultrareviewUsed: false,
      costUsdEstimate: lastResult?.total_cost_usd,
      error: lastResult ? `Autofix kickoff: ${lastResult.subtype}` : "no result message",
    };
  }

  return {
    taskId: task.id,
    status: "dispatched",
    prNumber: options.prNumber,
    ultrareviewUsed: false,
    costUsdEstimate: lastResult.total_cost_usd,
  };
}

async function loadRealSdkQuery(): Promise<SdkQueryFn> {
  const mod = await import("@anthropic-ai/claude-agent-sdk");
  return mod.query as unknown as SdkQueryFn;
}
