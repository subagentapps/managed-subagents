// merge.ts — gate + perform `gh pr merge` for a reviewed PR.
//
// Closes the orchestrator loop alongside ship.ts and review.ts:
//   ship → opens draft PR → review → posts verdict → merge → lands on base
//
// Hard rails (rails.ts) block merging into main/master/production/release by default.
// Caller must pass `allowProtected: true` to bypass — this is an explicit per-call
// opt-in, not a config toggle. Concurrency / circuit-breaker rails are owned by
// the orchestrator main loop, not this primitive.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { assertCanAutoMerge, RailViolation } from "./rails.js";

const execFileAsync = promisify(execFile);

export type MergeMethod = "merge" | "squash" | "rebase";

export class MergeError extends Error {
  constructor(message: string, public readonly stderr?: string) {
    super(message);
    this.name = "MergeError";
  }
}

export interface MergeOptions {
  cwd?: string;
  /** GitHub repo "owner/name". If unset, gh uses the cwd's repo. */
  repo?: string;
  /** Merge strategy. Default 'merge' (per project CLAUDE.md — keep granular history). */
  method?: MergeMethod;
  /** Delete branch after merge. Default true. */
  deleteBranch?: boolean;
  /** Bypass the protected-branch rail. Required to merge into main/master/etc. */
  allowProtected?: boolean;
  /** Skip the readiness pre-flight (draft / mergeable / verdict). For testing. */
  skipPreflight?: boolean;
  /** After merging, run `git pull` on the local cwd to sync the base branch. Default true. */
  syncLocal?: boolean;
  execFileOverride?: typeof execFileAsync;
}

export interface MergeResult {
  prNumber: number;
  merged: boolean;
  baseBranch: string;
  headBranch: string;
  method: MergeMethod;
  branchDeleted: boolean;
  localSynced: boolean;
  error?: string;
  skipped?: "draft" | "not-mergeable" | "rail-blocked" | "already-merged" | "closed";
}

interface PrMeta {
  number: number;
  isDraft: boolean;
  state: "OPEN" | "CLOSED" | "MERGED";
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus: string;
  baseRefName: string;
  headRefName: string;
}

/**
 * Merge a PR end-to-end.
 *
 * Flow:
 *   1. Fetch PR meta via `gh pr view`
 *   2. Pre-flight: not draft, not closed/merged, mergeable
 *   3. Rail check: base branch not in BLOCKED_AUTO_MERGE_BRANCHES (unless allowProtected)
 *   4. `gh pr merge --<method> [--delete-branch]`
 *   5. If syncLocal + base matches local branch: `git pull --ff-only`
 */
export async function merge(
  prNumber: number,
  options: MergeOptions = {},
): Promise<MergeResult> {
  const exec = options.execFileOverride ?? execFileAsync;
  const cwd = options.cwd ?? process.cwd();
  const method: MergeMethod = options.method ?? "merge";
  const deleteBranch = options.deleteBranch ?? true;
  const syncLocal = options.syncLocal ?? true;

  // 1. Fetch PR meta
  let meta: PrMeta;
  try {
    const args = [
      "pr", "view", String(prNumber),
      "--json", "number,isDraft,state,mergeable,mergeStateStatus,baseRefName,headRefName",
    ];
    if (options.repo) args.push("--repo", options.repo);
    const { stdout } = await exec("gh", args, { cwd });
    meta = JSON.parse(stdout) as PrMeta;
  } catch (err) {
    return failedMerge(prNumber, "gh pr view failed", err);
  }

  const baseResult = (skipped: MergeResult["skipped"], errMsg?: string): MergeResult => ({
    prNumber,
    merged: false,
    baseBranch: meta.baseRefName,
    headBranch: meta.headRefName,
    method,
    branchDeleted: false,
    localSynced: false,
    skipped,
    ...(errMsg ? { error: errMsg } : {}),
  });

  // 2. Pre-flight
  if (!options.skipPreflight) {
    if (meta.state === "MERGED") return baseResult("already-merged");
    if (meta.state === "CLOSED") return baseResult("closed");
    if (meta.isDraft) return baseResult("draft", "PR is still a draft; mark ready first");
    if (meta.mergeable === "CONFLICTING") {
      return baseResult("not-mergeable", "PR has merge conflicts");
    }
  }

  // 3. Rail check (unless caller opted in)
  if (!options.allowProtected) {
    try {
      assertCanAutoMerge(meta.baseRefName);
    } catch (err) {
      if (err instanceof RailViolation) {
        return baseResult("rail-blocked", err.message);
      }
      throw err;
    }
  }

  // 4. Merge
  try {
    const args = ["pr", "merge", String(prNumber), `--${method}`];
    if (deleteBranch) args.push("--delete-branch");
    if (options.repo) args.push("--repo", options.repo);
    await exec("gh", args, { cwd });
  } catch (err) {
    return failedMerge(prNumber, "gh pr merge failed", err, meta);
  }

  // 5. Sync local if base matches the checked-out branch
  let localSynced = false;
  if (syncLocal) {
    try {
      const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
      const currentBranch = stdout.trim();
      if (currentBranch === meta.baseRefName) {
        await exec("git", ["pull", "--ff-only", "origin", meta.baseRefName], { cwd });
        localSynced = true;
      }
    } catch {
      // best-effort; merge already succeeded
    }
  }

  return {
    prNumber,
    merged: true,
    baseBranch: meta.baseRefName,
    headBranch: meta.headRefName,
    method,
    branchDeleted: deleteBranch,
    localSynced,
  };
}

function failedMerge(
  prNumber: number,
  prefix: string,
  err: unknown,
  meta?: PrMeta,
): MergeResult {
  const e = err as { message?: string; stderr?: string };
  const errMsg = `${prefix}${e?.message ? ": " + e.message : ""}${e?.stderr ? "\n" + e.stderr : ""}`;
  return {
    prNumber,
    merged: false,
    baseBranch: meta?.baseRefName ?? "",
    headBranch: meta?.headRefName ?? "",
    method: "merge",
    branchDeleted: false,
    localSynced: false,
    error: errMsg,
  };
}
