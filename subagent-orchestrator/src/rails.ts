// rails.ts — M8 hard rails for the orchestrator.
//
// Per CLAUDE_CLI_MAX_PLAN_AGENT_AS_AUTONOMOUS_WEB_PR_ORCHESTRATOR_PLAN.md §5:
// - Never auto-merge to main / master
// - Cap concurrent dispatches
// - Open circuit breaker on N consecutive failures
// - Refuse /ultrareview when free runs exhausted (unless explicit opt-in)
//
// All rails are hardcoded — config can loosen them, never disable them.

import type { TaskResult } from "./types.js";

export const RAIL_DEFAULTS = {
  /** Branches that auto-merge is hard-blocked for, no override possible */
  BLOCKED_AUTO_MERGE_BRANCHES: ["main", "master", "production", "release"],
  /** Hard cap on concurrent dispatches — orchestrator must not exceed */
  MAX_CONCURRENT_DISPATCHES: 3,
  /** Consecutive failure count that trips the circuit breaker */
  CIRCUIT_BREAKER_THRESHOLD: 5,
  /** Free /ultrareview runs allotted by Anthropic Pro/Max plan */
  ULTRAREVIEW_FREE_RUNS: 3,
} as const;

export class RailViolation extends Error {
  constructor(
    public readonly rail: string,
    message: string,
  ) {
    super(message);
    this.name = "RailViolation";
  }
}

/**
 * Throws RailViolation if the merge target violates the hard block-list.
 * Caller catches and converts to a failed TaskResult; does NOT proceed.
 */
export function assertCanAutoMerge(targetBranch: string): void {
  const blocked: readonly string[] = RAIL_DEFAULTS.BLOCKED_AUTO_MERGE_BRANCHES;
  if (blocked.includes(targetBranch)) {
    throw new RailViolation(
      "auto-merge-blocked-branch",
      `Auto-merge to '${targetBranch}' is hard-blocked. Allowed only for non-protected branches.`,
    );
  }
}

/**
 * Throws if currently-running dispatches >= cap.
 * Caller checks before dispatchOne(); orchestrator's main loop owns the count.
 */
export function assertConcurrencyOk(currentRunning: number, cap?: number): void {
  const limit = cap ?? RAIL_DEFAULTS.MAX_CONCURRENT_DISPATCHES;
  if (currentRunning >= limit) {
    throw new RailViolation(
      "concurrency-cap-exceeded",
      `Concurrency cap reached: ${currentRunning} >= ${limit}. Wait for a dispatch to complete.`,
    );
  }
}

/**
 * Circuit breaker: returns true if N most-recent results are all failures.
 * Orchestrator should pause + open a manual-review issue when this returns true.
 */
export function isCircuitOpen(
  recentResults: TaskResult[],
  threshold?: number,
): boolean {
  const n = threshold ?? RAIL_DEFAULTS.CIRCUIT_BREAKER_THRESHOLD;
  if (recentResults.length < n) return false;
  const window = recentResults.slice(-n);
  return window.every((r) => r.status === "failed");
}

/**
 * Refuse /ultrareview if no free runs left AND no explicit paid opt-in.
 * `--paid-ultrareview` flag must be set to bypass.
 */
export function assertUltrareviewBudgetOk(args: {
  freeRunsRemaining: number;
  paidOptIn: boolean;
}): void {
  if (args.freeRunsRemaining > 0) return;
  if (args.paidOptIn) return;
  throw new RailViolation(
    "ultrareview-budget",
    `No /ultrareview free runs remaining (${RAIL_DEFAULTS.ULTRAREVIEW_FREE_RUNS} per Pro/Max account, expires May 5 2026). Pass --paid-ultrareview to bill against extra usage.`,
  );
}
