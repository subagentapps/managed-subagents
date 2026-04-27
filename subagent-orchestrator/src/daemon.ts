// daemon.ts — long-running driver around babysit().
//
// Runs babysit on a fixed interval until SIGINT/SIGTERM or maxIterations.
// Keeps a per-day spend total and breaks when crossed. Honors a circuit
// breaker: if N consecutive iterations have ANY error, sleep for backoff.

import { babysit, type BabysitOptions, type BabysitResult } from "./babysit.js";

export interface DaemonOptions extends BabysitOptions {
  /** Seconds between iterations. Default 600 (10min). */
  intervalSeconds?: number;
  /** Stop after this many iterations. 0 = forever. Default 0. */
  maxIterations?: number;
  /** Absolute spend cap; daemon exits when crossed. Default $50. */
  dailyBudgetUsd?: number;
  /** Consecutive failed iterations before opening circuit. Default 3. */
  circuitThreshold?: number;
  /** Sleep multiplier when circuit open. Default 4x intervalSeconds. */
  circuitBackoffMultiplier?: number;
  /** Inject for testing — replaces babysit(). */
  babysitOverride?: typeof babysit;
  /** Inject for testing — replaces setTimeout. */
  sleepOverride?: (ms: number) => Promise<void>;
  /** Inject for testing — abort signal to break the loop early. */
  abortSignal?: AbortSignal;
  /** Optional per-iteration callback (logging hook). */
  onIteration?: (iter: number, result: BabysitResult) => void;
}

export interface DaemonResult {
  iterations: number;
  totalSpendUsd: number;
  totalScanned: number;
  totalMerged: number;
  exitReason: "max-iterations" | "budget-exhausted" | "aborted" | "circuit-open-fatal";
}

const DEFAULT_INTERVAL_SECONDS = 600;
const DEFAULT_DAILY_BUDGET = 50;
const DEFAULT_CIRCUIT_THRESHOLD = 3;
const DEFAULT_CIRCUIT_MULT = 4;

export async function daemon(options: DaemonOptions = {}): Promise<DaemonResult> {
  const interval = (options.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS) * 1000;
  const maxIter = options.maxIterations ?? 0;
  const dailyBudget = options.dailyBudgetUsd ?? DEFAULT_DAILY_BUDGET;
  const circuitThreshold = options.circuitThreshold ?? DEFAULT_CIRCUIT_THRESHOLD;
  const backoffMult = options.circuitBackoffMultiplier ?? DEFAULT_CIRCUIT_MULT;
  const babysitFn = options.babysitOverride ?? babysit;
  const sleep = options.sleepOverride ?? defaultSleep;

  let iterations = 0;
  let totalSpend = 0;
  let totalScanned = 0;
  let totalMerged = 0;
  let consecutiveFailures = 0;

  while (true) {
    if (options.abortSignal?.aborted) {
      return makeResult(iterations, totalSpend, totalScanned, totalMerged, "aborted");
    }
    if (maxIter > 0 && iterations >= maxIter) {
      return makeResult(iterations, totalSpend, totalScanned, totalMerged, "max-iterations");
    }
    if (totalSpend >= dailyBudget) {
      return makeResult(iterations, totalSpend, totalScanned, totalMerged, "budget-exhausted");
    }

    iterations += 1;
    const result = await babysitFn(options);
    totalSpend += result.totalReviewCostUsd;
    totalScanned += result.scanned;
    totalMerged += result.items.filter((i) => i.merged).length;

    const hadError = result.items.some((i) => i.error);
    consecutiveFailures = hadError ? consecutiveFailures + 1 : 0;

    options.onIteration?.(iterations, result);

    if (consecutiveFailures >= circuitThreshold) {
      // Circuit open: fatal — operator should investigate
      return makeResult(iterations, totalSpend, totalScanned, totalMerged, "circuit-open-fatal");
    }

    // Sleep — backoff if scanned 0 PRs this iter (queue idle)
    const sleepMs = result.scanned === 0 ? interval * backoffMult : interval;
    await sleep(sleepMs);
  }
}

function makeResult(
  iterations: number,
  totalSpendUsd: number,
  totalScanned: number,
  totalMerged: number,
  exitReason: DaemonResult["exitReason"],
): DaemonResult {
  return { iterations, totalSpendUsd, totalScanned, totalMerged, exitReason };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
