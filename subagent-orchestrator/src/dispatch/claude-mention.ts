// dispatch/claude-mention.ts — fire a task via @claude-mention on a GitHub PR or issue.
// M5 piece. Uses gh CLI to create a comment containing the task prompt and @claude.
// The repo's claude.yml workflow picks it up and runs.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Task, TaskResult } from "../types.js";

const execFileAsync = promisify(execFile);

export interface DispatchClaudeMentionOptions {
  /** Where to post the comment: "pr" requires prNumber; "issue" requires issueNumber */
  target: { kind: "pr"; prNumber: number } | { kind: "issue"; issueNumber: number };
  /** repo "owner/name"; if omitted, gh uses cwd's repo */
  repo?: string;
  /** gh path; defaults to "gh" on PATH */
  ghPath?: string;
  /** Inject for testing */
  execFileOverride?: typeof execFileAsync;
  /** Skip the actual gh call; useful for dry runs */
  dryRun?: boolean;
}

export class ClaudeMentionDispatchError extends Error {
  constructor(message: string, public readonly stderr?: string) {
    super(message);
    this.name = "ClaudeMentionDispatchError";
  }
}

/**
 * Compose the comment body with a @claude mention and the task prompt.
 *
 * Format:
 *   @claude please:
 *
 *   <task.prompt>
 *
 *   <!-- orchestrator: task=<id> dispatched=<iso> -->
 */
export function composeMentionBody(task: Task, dispatchedAt: string): string {
  return [
    "@claude please:",
    "",
    task.prompt,
    "",
    `<!-- orchestrator: task=${task.id} dispatched=${dispatchedAt} -->`,
  ].join("\n");
}

/**
 * Dispatch a task by posting a @claude-mention comment via `gh`.
 *
 * Returns TaskResult with status="dispatched" — the orchestrator's
 * watch layer (M4) tracks the workflow run and updates status from
 * there.
 */
export async function dispatchClaudeMention(
  task: Task,
  options: DispatchClaudeMentionOptions,
): Promise<TaskResult> {
  const exec = options.execFileOverride ?? execFileAsync;
  const ghPath = options.ghPath ?? "gh";
  const dispatchedAt = new Date().toISOString();
  const body = composeMentionBody(task, dispatchedAt);

  const args: string[] =
    options.target.kind === "pr"
      ? ["pr", "comment", String(options.target.prNumber), "--body", body]
      : ["issue", "comment", String(options.target.issueNumber), "--body", body];

  if (options.repo) {
    args.push("--repo", options.repo);
  }

  if (options.dryRun) {
    return {
      taskId: task.id,
      status: "dispatched",
      ultrareviewUsed: false,
    };
  }

  try {
    await exec(ghPath, args);
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    return {
      taskId: task.id,
      status: "failed",
      ultrareviewUsed: false,
      error: `gh comment failed: ${e.message ?? "unknown"}`,
    };
  }

  return {
    taskId: task.id,
    status: "dispatched",
    ultrareviewUsed: false,
  };
}
