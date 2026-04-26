// Tests for src/rails.ts (M8).

import { describe, expect, it } from "vitest";

import {
  RAIL_DEFAULTS,
  RailViolation,
  assertCanAutoMerge,
  assertConcurrencyOk,
  assertUltrareviewBudgetOk,
  isCircuitOpen,
} from "../src/rails.js";
import type { TaskResult } from "../src/types.js";

describe("assertCanAutoMerge", () => {
  it("throws RailViolation for protected branches", () => {
    for (const branch of RAIL_DEFAULTS.BLOCKED_AUTO_MERGE_BRANCHES) {
      expect(() => assertCanAutoMerge(branch)).toThrow(RailViolation);
    }
  });

  it("allows non-protected branches", () => {
    expect(() => assertCanAutoMerge("feat/x")).not.toThrow();
    expect(() => assertCanAutoMerge("fix/auth")).not.toThrow();
    expect(() => assertCanAutoMerge("docs/readme")).not.toThrow();
  });

  it("RailViolation has rail name", () => {
    try {
      assertCanAutoMerge("main");
    } catch (err) {
      expect((err as RailViolation).rail).toBe("auto-merge-blocked-branch");
    }
  });
});

describe("assertConcurrencyOk", () => {
  it("allows under the cap", () => {
    expect(() => assertConcurrencyOk(0)).not.toThrow();
    expect(() => assertConcurrencyOk(2)).not.toThrow();
  });

  it("throws at the cap", () => {
    expect(() => assertConcurrencyOk(3)).toThrow(RailViolation);
  });

  it("throws above the cap", () => {
    expect(() => assertConcurrencyOk(99)).toThrow(RailViolation);
  });

  it("respects custom cap override", () => {
    expect(() => assertConcurrencyOk(0, 1)).not.toThrow();
    expect(() => assertConcurrencyOk(1, 1)).toThrow(RailViolation);
  });
});

describe("isCircuitOpen", () => {
  const fail: TaskResult = { taskId: "t", status: "failed", ultrareviewUsed: false };
  const ok: TaskResult = { taskId: "t", status: "ready-for-merge", ultrareviewUsed: false };

  it("returns false when fewer than threshold results", () => {
    expect(isCircuitOpen([fail, fail])).toBe(false);
  });

  it("returns false when threshold-window contains any non-failure", () => {
    // Length-5 array; last 5 IS the whole thing. Both have one ok → not open.
    expect(isCircuitOpen([fail, fail, fail, fail, ok])).toBe(false);
    expect(isCircuitOpen([ok, fail, fail, fail, fail])).toBe(false);
  });

  it("looks at the last N only when array exceeds threshold", () => {
    // Length 6; last-5 window is [fail, fail, fail, fail, fail] → open.
    expect(isCircuitOpen([ok, fail, fail, fail, fail, fail])).toBe(true);
  });

  it("returns true on N consecutive failures (default threshold=5)", () => {
    expect(isCircuitOpen([fail, fail, fail, fail, fail])).toBe(true);
  });

  it("returns true on >N consecutive failures", () => {
    expect(isCircuitOpen([ok, fail, fail, fail, fail, fail])).toBe(true);
  });

  it("respects custom threshold", () => {
    expect(isCircuitOpen([fail, fail], 2)).toBe(true);
    expect(isCircuitOpen([fail], 2)).toBe(false);
  });
});

describe("assertUltrareviewBudgetOk", () => {
  it("allows when free runs remaining", () => {
    expect(() =>
      assertUltrareviewBudgetOk({ freeRunsRemaining: 3, paidOptIn: false }),
    ).not.toThrow();
    expect(() =>
      assertUltrareviewBudgetOk({ freeRunsRemaining: 1, paidOptIn: false }),
    ).not.toThrow();
  });

  it("allows when paidOptIn=true even with no free runs", () => {
    expect(() =>
      assertUltrareviewBudgetOk({ freeRunsRemaining: 0, paidOptIn: true }),
    ).not.toThrow();
  });

  it("throws RailViolation when no free runs and no opt-in", () => {
    expect(() =>
      assertUltrareviewBudgetOk({ freeRunsRemaining: 0, paidOptIn: false }),
    ).toThrow(RailViolation);
  });
});
