// Tests for src/daemon.ts. Mock-only.

import { describe, expect, it, vi } from "vitest";

import { daemon } from "../src/daemon.js";
import type { BabysitItem, BabysitResult } from "../src/babysit.js";

const item = (overrides: Partial<BabysitItem> = {}): BabysitItem => ({
  prNumber: 1,
  title: "x",
  baseBranch: "feat/y",
  isDraft: false,
  reviewed: true,
  merged: false,
  ...overrides,
});

const result = (overrides: Partial<BabysitResult> = {}): BabysitResult => ({
  iteration: 1,
  scanned: 0,
  items: [],
  totalReviewCostUsd: 0,
  budgetExhausted: false,
  ...overrides,
});

const noSleep = async (): Promise<void> => {};

describe("daemon", () => {
  it("runs maxIterations then exits with max-iterations", async () => {
    const babysitMock = vi.fn().mockResolvedValue(result({ scanned: 1, items: [item({ merged: true })], totalReviewCostUsd: 0.3 }));

    const r = await daemon({
      maxIterations: 3,
      babysitOverride: babysitMock,
      sleepOverride: noSleep,
    });

    expect(r.exitReason).toBe("max-iterations");
    expect(r.iterations).toBe(3);
    expect(r.totalMerged).toBe(3);
    expect(r.totalSpendUsd).toBeCloseTo(0.9, 5);
    expect(babysitMock).toHaveBeenCalledTimes(3);
  });

  it("exits when daily budget exhausted", async () => {
    const babysitMock = vi.fn()
      .mockResolvedValueOnce(result({ scanned: 1, totalReviewCostUsd: 30 }))
      .mockResolvedValueOnce(result({ scanned: 1, totalReviewCostUsd: 25 }));

    const r = await daemon({
      dailyBudgetUsd: 50,
      babysitOverride: babysitMock,
      sleepOverride: noSleep,
    });

    expect(r.exitReason).toBe("budget-exhausted");
    // After iter 1 spend=30 < 50, runs iter 2; after iter 2 spend=55 >= 50, exits
    expect(r.iterations).toBe(2);
  });

  it("exits when abortSignal fires", async () => {
    const ac = new AbortController();
    const babysitMock = vi.fn().mockImplementation(async () => {
      ac.abort();
      return result({ scanned: 0 });
    });

    const r = await daemon({
      maxIterations: 100,
      babysitOverride: babysitMock,
      sleepOverride: noSleep,
      abortSignal: ac.signal,
    });

    expect(r.exitReason).toBe("aborted");
    expect(r.iterations).toBe(1);
  });

  it("opens circuit after N consecutive failures", async () => {
    const failed = result({ scanned: 1, items: [item({ error: "boom" })] });
    const babysitMock = vi.fn().mockResolvedValue(failed);

    const r = await daemon({
      circuitThreshold: 2,
      maxIterations: 10,
      babysitOverride: babysitMock,
      sleepOverride: noSleep,
    });

    expect(r.exitReason).toBe("circuit-open-fatal");
    expect(r.iterations).toBe(2);
  });

  it("resets circuit on a successful iteration", async () => {
    const okay = result({ scanned: 1, items: [item({ merged: true })] });
    const failed = result({ scanned: 1, items: [item({ error: "boom" })] });

    const babysitMock = vi.fn()
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(okay)
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(okay);

    const r = await daemon({
      circuitThreshold: 2,
      maxIterations: 4,
      babysitOverride: babysitMock,
      sleepOverride: noSleep,
    });

    // Failures never accumulated to 2-in-a-row, so circuit stayed closed
    expect(r.exitReason).toBe("max-iterations");
    expect(r.iterations).toBe(4);
  });

  it("uses backoff sleep when scanned=0 (idle queue)", async () => {
    const babysitMock = vi.fn().mockResolvedValue(result({ scanned: 0 }));
    const sleepCalls: number[] = [];
    const sleep = async (ms: number) => {
      sleepCalls.push(ms);
    };

    await daemon({
      maxIterations: 2,
      intervalSeconds: 10,
      circuitBackoffMultiplier: 5,
      babysitOverride: babysitMock,
      sleepOverride: sleep,
    });

    // Both iterations had scanned=0 so each slept 10s * 5 = 50000ms
    expect(sleepCalls).toEqual([50000, 50000]);
  });

  it("uses normal interval when scanned>0", async () => {
    const babysitMock = vi.fn().mockResolvedValue(result({ scanned: 2, items: [item(), item()] }));
    const sleepCalls: number[] = [];
    const sleep = async (ms: number) => {
      sleepCalls.push(ms);
    };

    await daemon({
      maxIterations: 1,
      intervalSeconds: 5,
      babysitOverride: babysitMock,
      sleepOverride: sleep,
    });

    expect(sleepCalls).toEqual([5000]);
  });

  it("calls onIteration hook each cycle", async () => {
    const babysitMock = vi.fn().mockResolvedValue(result({ scanned: 1, items: [item()] }));
    const onIteration = vi.fn();

    await daemon({
      maxIterations: 2,
      babysitOverride: babysitMock,
      sleepOverride: noSleep,
      onIteration,
    });

    expect(onIteration).toHaveBeenCalledTimes(2);
    expect(onIteration).toHaveBeenCalledWith(1, expect.objectContaining({ scanned: 1 }));
    expect(onIteration).toHaveBeenCalledWith(2, expect.objectContaining({ scanned: 1 }));
  });
});
