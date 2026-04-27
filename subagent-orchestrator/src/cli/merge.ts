// `subagent-orchestrator merge <pr>` — merge a reviewed PR.

import { merge, type MergeMethod } from "../merge.js";

export interface MergeCommandOptions {
  repo?: string;
  method?: MergeMethod;
  deleteBranch?: boolean;
  allowProtected?: boolean;
}

export async function runMerge(
  prNumber: number,
  options: MergeCommandOptions = {},
): Promise<void> {
  console.log(`[PR #${prNumber}] merging...`);
  const result = await merge(prNumber, options);

  if (result.merged) {
    console.log(`[PR #${prNumber}] ✅ merged ${result.headBranch} → ${result.baseBranch} (${result.method})`);
    if (result.branchDeleted) console.log(`  branch deleted ✓`);
    if (result.localSynced) console.log(`  local ${result.baseBranch} synced ✓`);
    return;
  }

  if (result.skipped) {
    const icon = result.skipped === "rail-blocked" ? "🛑" : "⏸";
    console.log(`[PR #${prNumber}] ${icon} skipped: ${result.skipped}${result.error ? " — " + result.error : ""}`);
    if (result.skipped === "rail-blocked") {
      console.log(`  hint: pass --allow-protected to bypass (you're merging into '${result.baseBranch}')`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`[PR #${prNumber}] ❌ failed: ${result.error ?? "unknown"}`);
  process.exitCode = 1;
}
