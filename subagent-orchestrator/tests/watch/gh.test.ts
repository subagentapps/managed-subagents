// Tests for src/watch/gh.ts. Mock-only — no real gh shellouts.

import { describe, expect, it } from "vitest";

import {
  GhCliError,
  fetchPrStatus,
  hasFailingChecks,
  isReadyForMerge,
  type PrStatus,
} from "../../src/watch/gh.js";

const sampleJson = JSON.stringify({
  number: 42,
  state: "OPEN",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  statusCheckRollup: [
    { name: "claude-review", status: "COMPLETED", conclusion: "SUCCESS" },
    { name: "ci", status: "COMPLETED", conclusion: "SUCCESS" },
  ],
  reviews: [{ state: "APPROVED" }],
  comments: [],
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExec = any;

const mockExec = (stdout: string): AnyExec =>
  async () => ({ stdout, stderr: "" });

describe("fetchPrStatus", () => {
  it("parses the gh pr view JSON output", async () => {
    const status = await fetchPrStatus(42, {
      execFileOverride: mockExec(sampleJson),
    });
    expect(status.number).toBe(42);
    expect(status.state).toBe("OPEN");
    expect(status.checks).toHaveLength(2);
    expect(status.checks[0]?.conclusion).toBe("SUCCESS");
    expect(status.reviewCount).toBe(1);
    expect(status.commentCount).toBe(0);
  });

  it("wraps non-JSON output in GhCliError", async () => {
    await expect(
      fetchPrStatus(42, { execFileOverride: mockExec("not json") }),
    ).rejects.toThrow(GhCliError);
  });

  it("wraps gh execution errors in GhCliError", async () => {
    const failingExec: AnyExec = async () => {
      throw Object.assign(new Error("gh: command not found"), {
        stderr: "no gh on PATH",
      });
    };
    await expect(
      fetchPrStatus(42, { execFileOverride: failingExec }),
    ).rejects.toThrow(GhCliError);
  });
});

describe("isReadyForMerge", () => {
  const baseClean: PrStatus = {
    number: 1,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    checks: [{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }],
    reviewCount: 0,
    commentCount: 0,
  };

  it("returns true on clean OPEN MERGEABLE PR with all checks succeeded", () => {
    expect(isReadyForMerge(baseClean)).toBe(true);
  });

  it("returns false on draft", () => {
    expect(isReadyForMerge({ ...baseClean, isDraft: true })).toBe(false);
  });

  it("returns false on conflicts", () => {
    expect(isReadyForMerge({ ...baseClean, mergeable: "CONFLICTING" })).toBe(false);
  });

  it("returns false when a check is in progress", () => {
    expect(
      isReadyForMerge({
        ...baseClean,
        checks: [{ name: "ci", status: "IN_PROGRESS", conclusion: "" }],
      }),
    ).toBe(false);
  });

  it("returns false when a check failed", () => {
    expect(
      isReadyForMerge({
        ...baseClean,
        checks: [{ name: "ci", status: "COMPLETED", conclusion: "FAILURE" }],
      }),
    ).toBe(false);
  });
});

describe("hasFailingChecks", () => {
  it("identifies completed failures", () => {
    expect(
      hasFailingChecks({
        number: 1,
        state: "OPEN",
        isDraft: false,
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
        checks: [{ name: "x", status: "COMPLETED", conclusion: "FAILURE" }],
        reviewCount: 0,
        commentCount: 0,
      }),
    ).toBe(true);
  });

  it("ignores in-progress checks", () => {
    expect(
      hasFailingChecks({
        number: 1,
        state: "OPEN",
        isDraft: false,
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
        checks: [{ name: "x", status: "IN_PROGRESS", conclusion: "" }],
        reviewCount: 0,
        commentCount: 0,
      }),
    ).toBe(false);
  });
});
