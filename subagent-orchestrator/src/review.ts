// review.ts — fetch PR diff, dispatch the reviewer subagent, parse verdict, post a PR comment.
//
// Pairs with src/ship.ts. Together they close the loop: ship dispatches a task →
// PR opens → review evaluates → reports back as a PR comment with a verdict.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { SdkQueryFn, SdkResultMessage } from "./dispatch/local.js";

const execFileAsync = promisify(execFile);

export type ReviewVerdict = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export class ReviewError extends Error {
  constructor(message: string, public readonly stderr?: string) {
    super(message);
    this.name = "ReviewError";
  }
}

export interface ReviewOptions {
  cwd?: string;
  /** GitHub repo "owner/name". If unset, gh uses the cwd's repo. */
  repo?: string;
  /** Don't post the PR comment; just return the result (useful for dry-run). */
  noComment?: boolean;
  /** Auto-mark draft PR as ready when verdict is APPROVE. Default false. */
  markReadyOnApprove?: boolean;
  /** Cap kickoff cost; default $3. */
  maxBudgetUsd?: number;
  /** Inject for testing. */
  sdkOverride?: { query: SdkQueryFn };
  execFileOverride?: typeof execFileAsync;
}

export interface ReviewResult {
  prNumber: number;
  verdict: ReviewVerdict;
  summary: string;
  body: string;
  costUsdEstimate?: number;
  commentUrl?: string;
  markedReady?: boolean;
  error?: string;
}

const DEFAULT_MAX_BUDGET_USD = 3;
const VERDICT_RE = /^VERDICT:\s*(APPROVE|REQUEST_CHANGES|COMMENT)\b/m;

/**
 * Review a PR end-to-end.
 *
 * Flow:
 *   1. Fetch diff via `gh pr diff <prNumber>`
 *   2. Fetch PR meta (title, isDraft) via `gh pr view`
 *   3. Dispatch the orchestrator-reviewer subagent
 *   4. Parse VERDICT line from output
 *   5. Post review body as a PR comment (unless noComment)
 *   6. If markReadyOnApprove + verdict=APPROVE + isDraft=true → `gh pr ready`
 */
export async function review(
  prNumber: number,
  options: ReviewOptions = {},
): Promise<ReviewResult> {
  const exec = options.execFileOverride ?? execFileAsync;
  const cwd = options.cwd ?? process.cwd();
  const maxBudgetUsd = options.maxBudgetUsd ?? DEFAULT_MAX_BUDGET_USD;

  // 1. Fetch diff
  let diff: string;
  try {
    const args = ["pr", "diff", String(prNumber)];
    if (options.repo) args.push("--repo", options.repo);
    const { stdout } = await exec("gh", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    diff = stdout;
  } catch (err) {
    return failedReview(prNumber, "gh pr diff failed", err);
  }

  if (diff.trim().length === 0) {
    return {
      prNumber,
      verdict: "COMMENT",
      summary: "PR has no diff (empty changes).",
      body: "PR contains no diff content. Skipping review.",
      error: "empty-diff",
    };
  }

  // 2. Fetch PR meta
  let prMeta: { title: string; isDraft: boolean };
  try {
    const args = ["pr", "view", String(prNumber), "--json", "title,isDraft"];
    if (options.repo) args.push("--repo", options.repo);
    const { stdout } = await exec("gh", args, { cwd });
    prMeta = JSON.parse(stdout) as { title: string; isDraft: boolean };
  } catch (err) {
    return failedReview(prNumber, "gh pr view failed", err);
  }

  // 3. Dispatch the reviewer subagent
  const sdkQuery = options.sdkOverride?.query ?? (await loadRealSdkQuery());
  const reviewPrompt = composeReviewPrompt(prNumber, prMeta.title, diff);

  let lastResult: SdkResultMessage | null = null;
  let resultText = "";

  try {
    for await (const message of sdkQuery({
      prompt: reviewPrompt,
      options: {
        cwd,
        maxTurns: 30,
        // Allow Agent (to spawn the reviewer) and read-only tools at top level.
        allowedTools: ["Agent", "Read", "Glob", "Grep"],
        permissionMode: "plan",
      },
    })) {
      if (message.type === "result") {
        lastResult = message;
        resultText = message.result ?? "";
        const cost = message.total_cost_usd ?? 0;
        if (cost > maxBudgetUsd) {
          return {
            prNumber,
            verdict: "COMMENT",
            summary: "Review exceeded budget cap; partial result discarded.",
            body: `Review aborted: cost ${cost.toFixed(2)} > $${maxBudgetUsd} cap.`,
            costUsdEstimate: cost,
            error: `budget-exceeded`,
          };
        }
      }
    }
  } catch (err) {
    return failedReview(prNumber, "SDK error during review", err);
  }

  if (!lastResult || lastResult.subtype !== "success") {
    return failedReview(
      prNumber,
      lastResult ? `review subtype ${lastResult.subtype}` : "no result",
      undefined,
      lastResult?.total_cost_usd,
    );
  }

  // 4. Parse VERDICT
  const verdictMatch = resultText.match(VERDICT_RE);
  const verdict: ReviewVerdict = (verdictMatch?.[1] as ReviewVerdict) ?? "COMMENT";
  const summary = extractSummary(resultText);

  const result: ReviewResult = {
    prNumber,
    verdict,
    summary,
    body: resultText,
    costUsdEstimate: lastResult.total_cost_usd,
  };

  // 5. Post comment unless noComment
  if (!options.noComment) {
    const commentBody = formatPrComment(verdict, resultText, lastResult);
    try {
      const args = ["pr", "comment", String(prNumber), "--body", commentBody];
      if (options.repo) args.push("--repo", options.repo);
      const { stdout } = await exec("gh", args, { cwd });
      result.commentUrl = stdout.trim();
    } catch (err) {
      const e = err as { message?: string };
      result.error = `gh pr comment failed: ${e.message ?? "unknown"}`;
      // continue — review itself succeeded; just couldn't post
    }
  }

  // 6. Mark ready if requested + APPROVE + draft
  if (
    options.markReadyOnApprove &&
    verdict === "APPROVE" &&
    prMeta.isDraft
  ) {
    try {
      const args = ["pr", "ready", String(prNumber)];
      if (options.repo) args.push("--repo", options.repo);
      await exec("gh", args, { cwd });
      result.markedReady = true;
    } catch (err) {
      const e = err as { message?: string };
      // append to error rather than overwrite
      result.error = (result.error ? result.error + "; " : "") +
        `gh pr ready failed: ${e.message ?? "unknown"}`;
    }
  }

  return result;
}

function composeReviewPrompt(prNumber: number, prTitle: string, diff: string): string {
  // Cap diff at 100K chars to avoid blowing context on huge PRs.
  // The reviewer can still ask for specific files via Read.
  const truncatedDiff = diff.length > 100_000
    ? diff.slice(0, 100_000) + "\n\n... [diff truncated at 100KB; use Read to inspect full files] ..."
    : diff;

  return `Use the orchestrator-reviewer subagent to review PR #${prNumber} ("${prTitle}").

The PR diff follows. Read it carefully, cross-reference with files in the working directory using Read/Glob/Grep when needed, and emit your verdict in the exact format specified in your instructions.

\`\`\`diff
${truncatedDiff}
\`\`\`
`;
}

function extractSummary(resultText: string): string {
  const match = resultText.match(/## Summary\s*\n+([\s\S]+?)(?=\n##|\n```|$)/);
  return (match?.[1] ?? "").trim().slice(0, 500);
}

function formatPrComment(
  verdict: ReviewVerdict,
  body: string,
  result: SdkResultMessage,
): string {
  const cost = result.total_cost_usd?.toFixed(2) ?? "?";
  const session = result.session_id ?? "(no id)";
  const verdictEmoji =
    verdict === "APPROVE" ? "✅" :
    verdict === "REQUEST_CHANGES" ? "❌" :
    "💬";

  return [
    `## ${verdictEmoji} subagent-orchestrator review`,
    "",
    body,
    "",
    "---",
    `_Cost: $${cost} · Session: \`${session}\`_`,
  ].join("\n");
}

function failedReview(
  prNumber: number,
  prefix: string,
  err: unknown,
  cost?: number,
): ReviewResult {
  const e = err as { message?: string; stderr?: string };
  const errMsg = `${prefix}${e?.message ? ": " + e.message : ""}${e?.stderr ? "\n" + e.stderr : ""}`;
  return {
    prNumber,
    verdict: "COMMENT",
    summary: `Review failed before completion: ${errMsg.slice(0, 200)}`,
    body: errMsg,
    ...(cost !== undefined ? { costUsdEstimate: cost } : {}),
    error: errMsg,
  };
}

async function loadRealSdkQuery(): Promise<SdkQueryFn> {
  const mod = await import("@anthropic-ai/claude-agent-sdk");
  return mod.query as unknown as SdkQueryFn;
}
