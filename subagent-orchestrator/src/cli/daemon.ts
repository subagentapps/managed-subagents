// `subagent-orchestrator daemon` — long-running babysit driver.

import { daemon } from "../daemon.js";
import type { BabysitResult } from "../babysit.js";

export interface DaemonCommandOptions {
  repo?: string;
  authorFilter?: string;
  includeDrafts?: boolean;
  allowProtected?: boolean;
  noComment?: boolean;
  iterationBudgetUsd?: number;
  maxReviews?: number;
  intervalSeconds?: number;
  maxIterations?: number;
  dailyBudgetUsd?: number;
}

export async function runDaemon(options: DaemonCommandOptions = {}): Promise<void> {
  console.log(`[daemon] starting; interval=${options.intervalSeconds ?? 600}s budget=$${options.dailyBudgetUsd ?? 50}`);

  const ac = new AbortController();
  const stop = (sig: string) => {
    console.log(`[daemon] caught ${sig}; will exit after current iteration`);
    ac.abort();
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  const onIteration = (iter: number, result: BabysitResult): void => {
    const merged = result.items.filter((i) => i.merged).length;
    console.log(
      `[daemon] iter=${iter} scanned=${result.scanned} merged=${merged} cost=$${result.totalReviewCostUsd.toFixed(2)}`,
    );
  };

  const result = await daemon({
    ...options,
    abortSignal: ac.signal,
    onIteration,
  });

  console.log(
    `[daemon] exit reason=${result.exitReason} iterations=${result.iterations} ` +
    `scanned=${result.totalScanned} merged=${result.totalMerged} spent=$${result.totalSpendUsd.toFixed(2)}`,
  );
  if (result.exitReason === "circuit-open-fatal") process.exitCode = 1;
}
