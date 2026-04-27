// ship.ts — end-to-end: dispatch a Task → commit on a fresh branch → push → open draft PR.
//
// Uses the documented primitives (per subagent-commands/sub-agents.md and
// the W13 SDK runbook):
//   - File-based subagent definition at .claude/agents/orchestrator-shipper.md
//   - @anthropic-ai/claude-agent-sdk's query() with the subagent invoked via prompt
//   - Bash tool inside the subagent for git ops; gh CLI shellouts in this wrapper for PR ops
//
// What this DOES (and does NOT) do:
//   - DOES: branch from main, dispatch the shipper subagent with edit perms,
//           detect commits made, push the branch, open a draft PR with `gh`
//   - DOES NOT: auto-merge (M8 rails block this), watch CI (separate flow), review

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { SdkQueryFn, SdkResultMessage } from "./dispatch/local.js";
import type { Task, TaskResult } from "./types.js";

const execFileAsync = promisify(execFile);

export class ShipError extends Error {
  constructor(message: string, public readonly stderr?: string) {
    super(message);
    this.name = "ShipError";
  }
}

export interface ShipOptions {
  cwd?: string;
  /** Base branch to fork from. Default 'main'. */
  baseBranch?: string;
  /** Branch name override. Default `feat/orch-<task.id>-<timestamp>`. */
  branchName?: string;
  /** GitHub repo "owner/name". If unset, gh uses the cwd's repo. */
  repo?: string;
  /** Inject for testing. */
  sdkOverride?: { query: SdkQueryFn };
  execFileOverride?: typeof execFileAsync;
  /** Cap kickoff cost; default $5. */
  maxBudgetUsd?: number;
  /** If true, don't push or open a PR — useful for dry-run testing. */
  noRemote?: boolean;
}

const DEFAULT_MAX_BUDGET_USD = 5;

/**
 * Take a Task all the way to a real draft PR on this repo.
 *
 * Flow:
 *   1. Verify clean working tree
 *   2. Create fresh branch from base
 *   3. Dispatch the shipper subagent with the task prompt
 *   4. Detect whether any commits were made
 *   5. If yes: push + open draft PR via gh
 *   6. Return TaskResult with prUrl + prNumber populated
 */
export async function ship(
  task: Task,
  options: ShipOptions = {},
): Promise<TaskResult> {
  const exec = options.execFileOverride ?? execFileAsync;
  const cwd = options.cwd ?? process.cwd();
  const base = options.baseBranch ?? "main";
  const maxBudgetUsd = options.maxBudgetUsd ?? DEFAULT_MAX_BUDGET_USD;
  const ts = new Date().toISOString().replace(/[:T.]/g, "").slice(0, 14);
  const branch = options.branchName ?? `feat/orch-${task.id}-${ts}`;

  // 1. Verify clean working tree on the base branch.
  try {
    const { stdout: status } = await exec("git", ["status", "--porcelain"], { cwd });
    if (status.trim().length > 0) {
      return {
        taskId: task.id,
        status: "failed",
        ultrareviewUsed: false,
        error: `Working tree is not clean on ${base}. Commit or stash before ship.`,
      };
    }
  } catch (err) {
    return failedResult(task.id, "git status failed", err);
  }

  // 2. Pull base + create fresh branch.
  try {
    await exec("git", ["checkout", base], { cwd });
    await exec("git", ["pull", "origin", base], { cwd });
    await exec("git", ["checkout", "-b", branch], { cwd });
  } catch (err) {
    return failedResult(task.id, `branch creation failed`, err);
  }

  // 3. Dispatch the shipper subagent. It has Read/Edit/Write/Bash tools and
  //    permissionMode: acceptEdits per the .claude/agents/orchestrator-shipper.md
  //    frontmatter, so it can make file changes + commit autonomously.
  const sdkQuery = options.sdkOverride?.query ?? (await loadRealSdkQuery());
  let lastResult: SdkResultMessage | null = null;
  let resultText = "";

  try {
    for await (const message of sdkQuery({
      prompt: `Use the orchestrator-shipper subagent to complete this task:\n\n${task.prompt}\n\nWhen done, commit your changes locally on the current branch (${branch}) but do not push or open a PR.`,
      options: {
        cwd,
        maxTurns: 30,
        // The subagent's own tool list is enforced by its frontmatter.
        // Top-level allowedTools just needs to permit the Agent tool to spawn it.
        allowedTools: ["Agent", "Read", "Edit", "Write", "Bash", "Glob", "Grep"],
        permissionMode: "acceptEdits",
      },
    })) {
      if (message.type === "result") {
        lastResult = message;
        resultText = message.result ?? "";
        const cost = message.total_cost_usd ?? 0;
        if (cost > maxBudgetUsd) {
          return {
            taskId: task.id,
            status: "failed",
            ultrareviewUsed: false,
            costUsdEstimate: cost,
            error: `Ship dispatch exceeded budget: $${cost.toFixed(2)} > $${maxBudgetUsd}`,
          };
        }
      }
    }
  } catch (err) {
    return failedResult(task.id, "SDK error during ship dispatch", err);
  }

  if (!lastResult || lastResult.subtype !== "success") {
    return {
      taskId: task.id,
      status: "failed",
      ultrareviewUsed: false,
      costUsdEstimate: lastResult?.total_cost_usd,
      error: lastResult ? `ship subtype: ${lastResult.subtype}` : "no result",
    };
  }

  // 4. Detect whether the subagent actually committed anything.
  if (resultText.startsWith("NO_CHANGES:")) {
    // Subagent intentionally made no changes. Clean up the branch.
    await safeExec(exec, "git", ["checkout", base], cwd);
    await safeExec(exec, "git", ["branch", "-D", branch], cwd);
    return {
      taskId: task.id,
      status: "ready-for-merge",
      ultrareviewUsed: false,
      costUsdEstimate: lastResult.total_cost_usd,
      error: resultText, // not really an error; carries the NO_CHANGES message for visibility
    };
  }

  let commitsAhead = 0;
  try {
    const { stdout } = await exec(
      "git",
      ["rev-list", "--count", `${base}..${branch}`],
      { cwd },
    );
    commitsAhead = parseInt(stdout.trim(), 10);
  } catch (err) {
    return failedResult(task.id, "git rev-list failed", err);
  }

  if (commitsAhead === 0) {
    // Subagent didn't commit anything despite not saying NO_CHANGES.
    await safeExec(exec, "git", ["checkout", base], cwd);
    await safeExec(exec, "git", ["branch", "-D", branch], cwd);
    return {
      taskId: task.id,
      status: "failed",
      ultrareviewUsed: false,
      costUsdEstimate: lastResult.total_cost_usd,
      error: "Shipper exited with no NO_CHANGES sentinel but also no commits made",
    };
  }

  // 5. Push + open draft PR (unless noRemote).
  if (options.noRemote) {
    return {
      taskId: task.id,
      status: "ready-for-merge",
      ultrareviewUsed: false,
      costUsdEstimate: lastResult.total_cost_usd,
    };
  }

  try {
    await exec("git", ["push", "-u", "origin", branch], { cwd });
  } catch (err) {
    return failedResult(task.id, "git push failed", err);
  }

  const prTitle = task.title;
  const prBody = composePrBody(task, resultText, branch, commitsAhead, lastResult);
  const ghArgs = [
    "pr",
    "create",
    "--draft",
    "--title",
    prTitle,
    "--body",
    prBody,
    "--base",
    base,
    "--head",
    branch,
  ];
  if (options.repo) ghArgs.push("--repo", options.repo);

  let prUrl: string;
  try {
    const { stdout } = await exec("gh", ghArgs, { cwd });
    prUrl = stdout.trim();
  } catch (err) {
    return failedResult(task.id, "gh pr create failed", err);
  }

  const prNumber = extractPrNumber(prUrl);

  return {
    taskId: task.id,
    status: "ready-for-merge",
    ultrareviewUsed: false,
    costUsdEstimate: lastResult.total_cost_usd,
    prUrl,
    ...(prNumber !== null ? { prNumber } : {}),
  };
}

function composePrBody(
  task: Task,
  resultText: string,
  branch: string,
  commitsAhead: number,
  result: SdkResultMessage,
): string {
  const cost = result.total_cost_usd?.toFixed(2) ?? "?";
  const session = result.session_id ?? "(no session id)";
  return [
    `## Orchestrator-shipped task`,
    "",
    `**Task ID:** \`${task.id}\``,
    `**Branch:** \`${branch}\` (${commitsAhead} commit${commitsAhead === 1 ? "" : "s"} ahead of base)`,
    `**Cost:** $${cost} · **Session:** \`${session}\``,
    "",
    "### Original task prompt",
    "",
    "```",
    task.prompt,
    "```",
    "",
    "### Subagent result",
    "",
    resultText.slice(0, 3000) + (resultText.length > 3000 ? "\n\n...(truncated)" : ""),
    "",
    "---",
    "",
    "_Opened by `subagent-orchestrator ship`. Draft until human review confirms._",
  ].join("\n");
}

function extractPrNumber(prUrl: string): number | null {
  const m = prUrl.match(/\/pull\/(\d+)/);
  return m?.[1] ? parseInt(m[1], 10) : null;
}

function failedResult(taskId: string, prefix: string, err: unknown): TaskResult {
  const e = err as { message?: string; stderr?: string };
  return {
    taskId,
    status: "failed",
    ultrareviewUsed: false,
    error: `${prefix}: ${e.message ?? "unknown"}${e.stderr ? `\n${e.stderr}` : ""}`,
  };
}

async function safeExec(
  exec: typeof execFileAsync,
  cmd: string,
  args: string[],
  cwd: string,
): Promise<void> {
  try {
    await exec(cmd, args, { cwd });
  } catch {
    // best-effort cleanup; swallow
  }
}

async function loadRealSdkQuery(): Promise<SdkQueryFn> {
  const mod = await import("@anthropic-ai/claude-agent-sdk");
  return mod.query as unknown as SdkQueryFn;
}
