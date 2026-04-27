// babysit.ts — autonomous loop driver: review every open ready PR, merge approvable ones.
//
// Composes the three primitives (ship/review/merge) into the directive's
// "ship → review → merge in an efficient system." Intended for CLI invocation
// (`subagent-orchestrator babysit`) and from a /loop or /schedule wrapper.
//
// Per-iteration:
//   1. List open PRs (skip drafts unless --include-drafts)
//   2. For each: review() → record verdict + cost
//   3. If verdict=APPROVE AND base not protected (or --allow-protected): merge()
//   4. Aggregate budget cap stops further reviews mid-iteration
//
// Hard rails (rails.ts) are honored by the merge primitive itself; babysit
// just respects what merge returns.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { merge, type MergeResult } from "./merge.js";
import { review, type ReviewResult } from "./review.js";
import { fetchPrStatus, type PrStatus } from "./watch/gh.js";

const execFileAsync = promisify(execFile);

export interface BabysitOptions {
  cwd?: string;
  /** GitHub repo "owner/name". If unset, gh uses the cwd's repo. */
  repo?: string;
  /** Only review PRs whose author matches (substring). Useful for self-flow. */
  authorFilter?: string;
  /** Include draft PRs in the sweep. Default false. */
  includeDrafts?: boolean;
  /** Pass to merge() — bypass protected-branch rail per call. */
  allowProtected?: boolean;
  /** Don't post review comments — review() noComment. Default false. */
  noComment?: boolean;
  /** Stop the iteration when total spend exceeds this. Default $5. */
  iterationBudgetUsd?: number;
  /** Cap reviews per iteration. Default 5. */
  maxReviews?: number;
  execFileOverride?: typeof execFileAsync;
  /** Inject for testing — replaces the actual review() call. */
  reviewOverride?: typeof review;
  /** Inject for testing — replaces the actual merge() call. */
  mergeOverride?: typeof merge;
  /**
   * If true, fetch PR status before reviewing and skip PRs whose non-skipped
   * checks haven't all succeeded. Default false (review everything).
   */
  requireChecksPass?: boolean;
  /**
   * Regex matching check names to ignore when evaluating CI state. Defaults
   * to /claude-review/i because the auto-review check routinely fails on
   * usage cap; orchestrator decisions shouldn't gate on it.
   */
  checkSkipPattern?: RegExp;
  /** Inject for testing — replaces fetchPrStatus(). */
  fetchPrStatusOverride?: typeof fetchPrStatus;
}

export interface BabysitItem {
  prNumber: number;
  title: string;
  baseBranch: string;
  isDraft: boolean;
  reviewed: boolean;
  merged: boolean;
  verdict?: ReviewResult["verdict"];
  reviewCostUsd?: number;
  mergeSkipped?: MergeResult["skipped"];
  /** Set when the PR was skipped before review (e.g. checks pending/failing) */
  preReviewSkip?: "checks-pending" | "checks-failing" | "checks-fetch-failed";
  error?: string;
}

export interface BabysitResult {
  iteration: number;
  scanned: number;
  items: BabysitItem[];
  totalReviewCostUsd: number;
  budgetExhausted: boolean;
}

const DEFAULT_BUDGET = 5;
const DEFAULT_MAX_REVIEWS = 5;

export async function babysit(options: BabysitOptions = {}): Promise<BabysitResult> {
  const exec = options.execFileOverride ?? execFileAsync;
  const cwd = options.cwd ?? process.cwd();
  const budget = options.iterationBudgetUsd ?? DEFAULT_BUDGET;
  const maxReviews = options.maxReviews ?? DEFAULT_MAX_REVIEWS;
  const reviewFn = options.reviewOverride ?? review;
  const mergeFn = options.mergeOverride ?? merge;
  const fetchPrStatusFn = options.fetchPrStatusOverride ?? fetchPrStatus;
  const skipPattern = options.checkSkipPattern ?? /claude-review/i;

  // 1. List open PRs
  const args = [
    "pr", "list", "--state", "open",
    "--json", "number,title,isDraft,baseRefName,author",
    "--limit", String(maxReviews * 2),
  ];
  if (options.repo) args.push("--repo", options.repo);

  let prs: Array<{ number: number; title: string; isDraft: boolean; baseRefName: string; author: { login: string } }>;
  try {
    const { stdout } = await exec("gh", args, { cwd });
    prs = JSON.parse(stdout);
  } catch (err) {
    const e = err as { message?: string };
    return {
      iteration: 1,
      scanned: 0,
      items: [],
      totalReviewCostUsd: 0,
      budgetExhausted: false,
      ...({ error: `gh pr list failed: ${e.message ?? "unknown"}` } as Partial<BabysitResult>),
    };
  }

  const filtered = prs.filter((pr) => {
    if (!options.includeDrafts && pr.isDraft) return false;
    if (options.authorFilter && !pr.author.login.includes(options.authorFilter)) return false;
    return true;
  }).slice(0, maxReviews);

  const items: BabysitItem[] = [];
  let totalCost = 0;
  let budgetExhausted = false;

  for (const pr of filtered) {
    if (totalCost >= budget) {
      budgetExhausted = true;
      break;
    }

    const item: BabysitItem = {
      prNumber: pr.number,
      title: pr.title,
      baseBranch: pr.baseRefName,
      isDraft: pr.isDraft,
      reviewed: false,
      merged: false,
    };

    // 1.5. Optional CI gate — skip PRs whose meaningful checks haven't passed
    if (options.requireChecksPass) {
      let status: PrStatus;
      try {
        status = await fetchPrStatusFn(pr.number, {
          ...(options.repo ? { repo: options.repo } : {}),
        });
      } catch (err) {
        const e = err as { message?: string };
        item.preReviewSkip = "checks-fetch-failed";
        item.error = `fetchPrStatus failed: ${e.message ?? "unknown"}`;
        items.push(item);
        continue;
      }
      const meaningfulChecks = status.checks.filter((c) => !skipPattern.test(c.name));
      const anyPending = meaningfulChecks.some(
        (c) => c.status !== "COMPLETED",
      );
      const anyFailed = meaningfulChecks.some(
        (c) => c.status === "COMPLETED" && c.conclusion !== "SUCCESS" && c.conclusion !== "SKIPPED" && c.conclusion !== "NEUTRAL",
      );
      if (anyPending) {
        item.preReviewSkip = "checks-pending";
        items.push(item);
        continue;
      }
      if (anyFailed) {
        item.preReviewSkip = "checks-failing";
        items.push(item);
        continue;
      }
    }

    // 2. Review
    let reviewResult: ReviewResult;
    try {
      reviewResult = await reviewFn(pr.number, {
        cwd,
        repo: options.repo,
        noComment: options.noComment,
      });
      item.reviewed = true;
      item.verdict = reviewResult.verdict;
      item.reviewCostUsd = reviewResult.costUsdEstimate;
      totalCost += reviewResult.costUsdEstimate ?? 0;
    } catch (err) {
      const e = err as { message?: string };
      item.error = `review failed: ${e.message ?? "unknown"}`;
      items.push(item);
      continue;
    }

    // 3. Merge if approved
    if (reviewResult.verdict === "APPROVE") {
      try {
        const mergeResult = await mergeFn(pr.number, {
          cwd,
          repo: options.repo,
          allowProtected: options.allowProtected,
        });
        item.merged = mergeResult.merged;
        item.mergeSkipped = mergeResult.skipped;
        if (!mergeResult.merged && mergeResult.error) {
          item.error = mergeResult.error;
        }
      } catch (err) {
        const e = err as { message?: string };
        item.error = `merge failed: ${e.message ?? "unknown"}`;
      }
    }

    items.push(item);
  }

  return {
    iteration: 1,
    scanned: filtered.length,
    items,
    totalReviewCostUsd: totalCost,
    budgetExhausted,
  };
}
