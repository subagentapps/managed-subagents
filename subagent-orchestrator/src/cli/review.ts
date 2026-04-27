// `subagent-orchestrator review <pr>` — review a PR end-to-end.

import { review } from "../review.js";

export interface ReviewCommandOptions {
  repo?: string;
  noComment?: boolean;
  markReadyOnApprove?: boolean;
}

export async function runReview(
  prNumber: number,
  options: ReviewCommandOptions = {},
): Promise<void> {
  console.log(`[PR #${prNumber}] dispatching review...`);
  const result = await review(prNumber, options);

  const cost = result.costUsdEstimate != null ? `$${result.costUsdEstimate.toFixed(2)}` : "$?.??";
  const verdictIcon =
    result.verdict === "APPROVE" ? "✅" :
    result.verdict === "REQUEST_CHANGES" ? "❌" :
    "💬";

  console.log(`[PR #${prNumber}] ${verdictIcon} ${result.verdict} (${cost})`);
  console.log(`  summary: ${result.summary || "(no summary)"}`);
  if (result.commentUrl) console.log(`  comment: ${result.commentUrl}`);
  if (result.markedReady) console.log(`  marked ready ✓`);
  if (result.error) console.log(`  error: ${result.error}`);

  if (result.verdict === "REQUEST_CHANGES" || result.error) {
    process.exitCode = 1;
  }
}
