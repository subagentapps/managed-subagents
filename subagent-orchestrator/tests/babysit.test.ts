// Tests for src/babysit.ts. Mock-only.

import { describe, expect, it, vi } from "vitest";

import { babysit } from "../src/babysit.js";
import type { MergeResult } from "../src/merge.js";
import type { ReviewResult } from "../src/review.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExec = any;

function listExec(prs: Array<{ number: number; title: string; isDraft: boolean; baseRefName: string; author: { login: string } }>): AnyExec {
  return async () => ({ stdout: JSON.stringify(prs), stderr: "" });
}

const approve = (n: number, cost = 0.3): ReviewResult => ({
  prNumber: n, verdict: "APPROVE", summary: "ok", body: "VERDICT: APPROVE", costUsdEstimate: cost,
});
const requestChanges = (n: number): ReviewResult => ({
  prNumber: n, verdict: "REQUEST_CHANGES", summary: "x", body: "VERDICT: REQUEST_CHANGES", costUsdEstimate: 0.5,
});
const merged = (n: number): MergeResult => ({
  prNumber: n, merged: true, baseBranch: "feat/x", headBranch: "feat/y",
  method: "merge", branchDeleted: true, localSynced: false,
});
const railBlocked = (n: number): MergeResult => ({
  prNumber: n, merged: false, baseBranch: "main", headBranch: "feat/y",
  method: "merge", branchDeleted: false, localSynced: false, skipped: "rail-blocked",
});

describe("babysit", () => {
  it("reviews + merges an APPROVE PR", async () => {
    const reviewMock = vi.fn().mockResolvedValue(approve(1));
    const mergeMock = vi.fn().mockResolvedValue(merged(1));

    const result = await babysit({
      execFileOverride: listExec([{ number: 1, title: "x", isDraft: false, baseRefName: "feat/y", author: { login: "u" } }]),
      reviewOverride: reviewMock,
      mergeOverride: mergeMock,
    });

    expect(result.scanned).toBe(1);
    expect(result.items[0]).toMatchObject({ verdict: "APPROVE", merged: true });
    expect(reviewMock).toHaveBeenCalledOnce();
    expect(mergeMock).toHaveBeenCalledOnce();
  });

  it("does NOT merge REQUEST_CHANGES PRs", async () => {
    const reviewMock = vi.fn().mockResolvedValue(requestChanges(2));
    const mergeMock = vi.fn();

    const result = await babysit({
      execFileOverride: listExec([{ number: 2, title: "x", isDraft: false, baseRefName: "feat/y", author: { login: "u" } }]),
      reviewOverride: reviewMock,
      mergeOverride: mergeMock,
    });

    expect(result.items[0]?.verdict).toBe("REQUEST_CHANGES");
    expect(result.items[0]?.merged).toBe(false);
    expect(mergeMock).not.toHaveBeenCalled();
  });

  it("skips drafts by default", async () => {
    const reviewMock = vi.fn().mockResolvedValue(approve(3));

    const result = await babysit({
      execFileOverride: listExec([
        { number: 3, title: "draft", isDraft: true, baseRefName: "main", author: { login: "u" } },
      ]),
      reviewOverride: reviewMock,
      mergeOverride: vi.fn(),
    });

    expect(result.scanned).toBe(0);
    expect(reviewMock).not.toHaveBeenCalled();
  });

  it("includes drafts when includeDrafts=true", async () => {
    const reviewMock = vi.fn().mockResolvedValue(approve(4));

    const result = await babysit({
      execFileOverride: listExec([
        { number: 4, title: "draft", isDraft: true, baseRefName: "feat/y", author: { login: "u" } },
      ]),
      reviewOverride: reviewMock,
      mergeOverride: vi.fn().mockResolvedValue(merged(4)),
      includeDrafts: true,
    });

    expect(result.scanned).toBe(1);
  });

  it("filters by author substring", async () => {
    const reviewMock = vi.fn().mockResolvedValue(approve(5));

    const result = await babysit({
      execFileOverride: listExec([
        { number: 5, title: "mine", isDraft: false, baseRefName: "feat/y", author: { login: "alice-bot" } },
        { number: 6, title: "other", isDraft: false, baseRefName: "feat/y", author: { login: "bob" } },
      ]),
      reviewOverride: reviewMock,
      mergeOverride: vi.fn().mockResolvedValue(merged(5)),
      authorFilter: "alice",
    });

    expect(result.scanned).toBe(1);
    expect(result.items[0]?.prNumber).toBe(5);
  });

  it("stops mid-iteration when budget exhausted", async () => {
    const reviewMock = vi.fn()
      .mockResolvedValueOnce(approve(1, 3.0))
      .mockResolvedValueOnce(approve(2, 0.1));

    const result = await babysit({
      execFileOverride: listExec([
        { number: 1, title: "a", isDraft: false, baseRefName: "feat/y", author: { login: "u" } },
        { number: 2, title: "b", isDraft: false, baseRefName: "feat/y", author: { login: "u" } },
      ]),
      reviewOverride: reviewMock,
      mergeOverride: vi.fn().mockResolvedValue(merged(1)),
      iterationBudgetUsd: 2.0,
    });

    expect(result.budgetExhausted).toBe(true);
    expect(reviewMock).toHaveBeenCalledOnce();
    expect(result.items).toHaveLength(1);
  });

  it("respects merge skipped status (e.g. rail-blocked)", async () => {
    const reviewMock = vi.fn().mockResolvedValue(approve(7));
    const mergeMock = vi.fn().mockResolvedValue(railBlocked(7));

    const result = await babysit({
      execFileOverride: listExec([
        { number: 7, title: "to main", isDraft: false, baseRefName: "main", author: { login: "u" } },
      ]),
      reviewOverride: reviewMock,
      mergeOverride: mergeMock,
    });

    expect(result.items[0]?.merged).toBe(false);
    expect(result.items[0]?.mergeSkipped).toBe("rail-blocked");
  });

  it("caps reviews per iteration with maxReviews", async () => {
    const reviewMock = vi.fn().mockResolvedValue(approve(1));

    const result = await babysit({
      execFileOverride: listExec(
        Array.from({ length: 10 }, (_, i) => ({
          number: i + 1, title: "x", isDraft: false, baseRefName: "feat/y", author: { login: "u" },
        })),
      ),
      reviewOverride: reviewMock,
      mergeOverride: vi.fn().mockResolvedValue(merged(1)),
      maxReviews: 3,
    });

    expect(result.scanned).toBe(3);
    expect(reviewMock).toHaveBeenCalledTimes(3);
  });

  it("requireChecksPass: skips a PR with pending non-skipped checks", async () => {
    const reviewMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      number: 1, state: "OPEN", isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN",
      checks: [
        { name: "claude-review", status: "COMPLETED", conclusion: "FAILURE" },  // ignored by default
        { name: "ci/build",      status: "IN_PROGRESS", conclusion: "" },        // pending
      ],
      reviewCount: 0, commentCount: 0,
    });

    const result = await babysit({
      execFileOverride: listExec([{ number: 1, title: "x", isDraft: false, baseRefName: "feat/y", author: { login: "u" } }]),
      reviewOverride: reviewMock,
      mergeOverride: vi.fn(),
      fetchPrStatusOverride: fetchMock,
      requireChecksPass: true,
    });

    expect(result.items[0]?.preReviewSkip).toBe("checks-pending");
    expect(reviewMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("requireChecksPass: skips a PR with failing non-skipped checks", async () => {
    const reviewMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      number: 1, state: "OPEN", isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN",
      checks: [
        { name: "ci/test", status: "COMPLETED", conclusion: "FAILURE" },
      ],
      reviewCount: 0, commentCount: 0,
    });

    const result = await babysit({
      execFileOverride: listExec([{ number: 1, title: "x", isDraft: false, baseRefName: "feat/y", author: { login: "u" } }]),
      reviewOverride: reviewMock,
      mergeOverride: vi.fn(),
      fetchPrStatusOverride: fetchMock,
      requireChecksPass: true,
    });

    expect(result.items[0]?.preReviewSkip).toBe("checks-failing");
    expect(reviewMock).not.toHaveBeenCalled();
  });

  it("requireChecksPass: ignores claude-review failure (default skip pattern)", async () => {
    const reviewMock = vi.fn().mockResolvedValue(approve(1));
    const mergeMock = vi.fn().mockResolvedValue(merged(1));
    const fetchMock = vi.fn().mockResolvedValue({
      number: 1, state: "OPEN", isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN",
      checks: [
        { name: "claude-review", status: "COMPLETED", conclusion: "FAILURE" },
      ],
      reviewCount: 0, commentCount: 0,
    });

    const result = await babysit({
      execFileOverride: listExec([{ number: 1, title: "x", isDraft: false, baseRefName: "feat/y", author: { login: "u" } }]),
      reviewOverride: reviewMock,
      mergeOverride: mergeMock,
      fetchPrStatusOverride: fetchMock,
      requireChecksPass: true,
    });

    expect(result.items[0]?.merged).toBe(true);
    expect(reviewMock).toHaveBeenCalledOnce();
  });

  it("requireChecksPass: proceeds when all meaningful checks succeed", async () => {
    const reviewMock = vi.fn().mockResolvedValue(approve(1));
    const fetchMock = vi.fn().mockResolvedValue({
      number: 1, state: "OPEN", isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN",
      checks: [
        { name: "ci/test",  status: "COMPLETED", conclusion: "SUCCESS" },
        { name: "ci/build", status: "COMPLETED", conclusion: "SUCCESS" },
      ],
      reviewCount: 0, commentCount: 0,
    });

    const result = await babysit({
      execFileOverride: listExec([{ number: 1, title: "x", isDraft: false, baseRefName: "feat/y", author: { login: "u" } }]),
      reviewOverride: reviewMock,
      mergeOverride: vi.fn().mockResolvedValue(merged(1)),
      fetchPrStatusOverride: fetchMock,
      requireChecksPass: true,
    });

    expect(result.items[0]?.preReviewSkip).toBeUndefined();
    expect(reviewMock).toHaveBeenCalledOnce();
  });

  it("requireChecksPass: records fetch failure and skips review", async () => {
    const reviewMock = vi.fn();
    const fetchMock = vi.fn().mockRejectedValue(new Error("gh down"));

    const result = await babysit({
      execFileOverride: listExec([{ number: 1, title: "x", isDraft: false, baseRefName: "feat/y", author: { login: "u" } }]),
      reviewOverride: reviewMock,
      mergeOverride: vi.fn(),
      fetchPrStatusOverride: fetchMock,
      requireChecksPass: true,
    });

    expect(result.items[0]?.preReviewSkip).toBe("checks-fetch-failed");
    expect(result.items[0]?.error).toMatch(/gh down/);
    expect(reviewMock).not.toHaveBeenCalled();
  });

  it("custom checkSkipPattern overrides default", async () => {
    const reviewMock = vi.fn().mockResolvedValue(approve(1));
    const fetchMock = vi.fn().mockResolvedValue({
      number: 1, state: "OPEN", isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN",
      checks: [
        { name: "flaky-integration", status: "COMPLETED", conclusion: "FAILURE" },
      ],
      reviewCount: 0, commentCount: 0,
    });

    const result = await babysit({
      execFileOverride: listExec([{ number: 1, title: "x", isDraft: false, baseRefName: "feat/y", author: { login: "u" } }]),
      reviewOverride: reviewMock,
      mergeOverride: vi.fn().mockResolvedValue(merged(1)),
      fetchPrStatusOverride: fetchMock,
      requireChecksPass: true,
      checkSkipPattern: /flaky-integration/i,
    });

    expect(result.items[0]?.preReviewSkip).toBeUndefined();
    expect(reviewMock).toHaveBeenCalledOnce();
  });

  it("requireChecksPass=false (default) reviews everything regardless of CI", async () => {
    const reviewMock = vi.fn().mockResolvedValue(approve(1));
    const fetchMock = vi.fn();

    await babysit({
      execFileOverride: listExec([{ number: 1, title: "x", isDraft: false, baseRefName: "feat/y", author: { login: "u" } }]),
      reviewOverride: reviewMock,
      mergeOverride: vi.fn().mockResolvedValue(merged(1)),
      fetchPrStatusOverride: fetchMock,
      // requireChecksPass not set
    });

    expect(reviewMock).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records review failures without aborting the sweep", async () => {
    const reviewMock = vi.fn()
      .mockRejectedValueOnce(new Error("review boom"))
      .mockResolvedValueOnce(approve(2));

    const result = await babysit({
      execFileOverride: listExec([
        { number: 1, title: "a", isDraft: false, baseRefName: "feat/y", author: { login: "u" } },
        { number: 2, title: "b", isDraft: false, baseRefName: "feat/y", author: { login: "u" } },
      ]),
      reviewOverride: reviewMock,
      mergeOverride: vi.fn().mockResolvedValue(merged(2)),
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.error).toMatch(/review boom/);
    expect(result.items[1]?.merged).toBe(true);
  });
});
