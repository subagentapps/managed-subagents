// `subagent-orchestrator babysit` — sweep open PRs: review, merge approvals.

import { babysit } from "../babysit.js";

export interface BabysitCommandOptions {
  repo?: string;
  authorFilter?: string;
  includeDrafts?: boolean;
  allowProtected?: boolean;
  noComment?: boolean;
  iterationBudgetUsd?: number;
  maxReviews?: number;
}

export async function runBabysit(options: BabysitCommandOptions = {}): Promise<void> {
  console.log(`[babysit] sweeping open PRs...`);
  const result = await babysit(options);

  console.log(`[babysit] scanned ${result.scanned} PR(s); spent $${result.totalReviewCostUsd.toFixed(2)}`);
  if (result.budgetExhausted) {
    console.log(`[babysit] ⚠ budget exhausted mid-iteration`);
  }

  for (const item of result.items) {
    const verdictIcon =
      item.verdict === "APPROVE" ? "✅" :
      item.verdict === "REQUEST_CHANGES" ? "❌" :
      item.verdict === "COMMENT" ? "💬" :
      "·";
    const mergeNote = item.merged ? " → merged" :
      item.mergeSkipped ? ` → skipped (${item.mergeSkipped})` : "";
    const cost = item.reviewCostUsd != null ? ` $${item.reviewCostUsd.toFixed(2)}` : "";
    console.log(`  PR #${item.prNumber} ${verdictIcon}${cost}${mergeNote}  — ${item.title}`);
    if (item.error) console.log(`    error: ${item.error}`);
  }

  const anyError = result.items.some((i) => i.error);
  if (anyError) process.exitCode = 1;
}
