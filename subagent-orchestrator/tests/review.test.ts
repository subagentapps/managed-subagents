// Tests for src/review.ts. Mock-only.

import { describe, expect, it } from "vitest";

import { review } from "../src/review.js";
import type { SdkMessage, SdkResultMessage } from "../src/dispatch/local.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExec = any;

function mockSdk(messages: SdkMessage[]) {
  return {
    query: () =>
      (async function* () {
        for (const m of messages) yield m;
      })(),
  };
}

function mockExec(handlers: Array<(cmd: string, args: string[]) => { stdout?: string; stderr?: string } | Error>): {
  exec: AnyExec;
  calls: Array<{ cmd: string; args: string[] }>;
} {
  let i = 0;
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: AnyExec = async (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    const handler = handlers[i++];
    if (!handler) return { stdout: "", stderr: "" };
    const out = handler(cmd, args);
    if (out instanceof Error) throw out;
    return { stdout: out.stdout ?? "", stderr: out.stderr ?? "" };
  };
  return { exec, calls };
}

const approveResult: SdkResultMessage = {
  type: "result",
  subtype: "success",
  result: `VERDICT: APPROVE

## Summary

PR cleanly adds a small docs change. No findings.

## Findings

(no findings)
`,
  total_cost_usd: 0.30,
  session_id: "rev_a",
};

const requestChangesResult: SdkResultMessage = {
  type: "result",
  subtype: "success",
  result: `VERDICT: REQUEST_CHANGES

## Summary

PR introduces a SQL injection vulnerability in src/db.ts:42.

## Findings

### Critical
- [src/db.ts:42] Raw user input concatenated into SQL — use parameterized query

### Medium
- [src/db.ts:18] Missing JSDoc on exported function
`,
  total_cost_usd: 0.55,
  session_id: "rev_rc",
};

const sampleDiff = `diff --git a/file.ts b/file.ts
+const x = 1;`;

describe("review", () => {
  it("returns APPROVE verdict and posts comment by default", async () => {
    const { exec, calls } = mockExec([
      () => ({ stdout: sampleDiff }),                                // gh pr diff
      () => ({ stdout: '{"title":"Add feature","isDraft":false}' }), // gh pr view
      () => ({ stdout: "https://github.com/o/r/pull/1#comment" }),   // gh pr comment
    ]);

    const result = await review(1, {
      execFileOverride: exec,
      sdkOverride: mockSdk([approveResult]),
    });

    expect(result.verdict).toBe("APPROVE");
    expect(result.summary).toContain("PR cleanly adds");
    expect(result.commentUrl).toMatch(/comment$/);
    expect(result.costUsdEstimate).toBe(0.30);

    // Verify the comment was posted
    const commentCall = calls.find((c) => c.cmd === "gh" && c.args[0] === "pr" && c.args[1] === "comment");
    expect(commentCall).toBeDefined();
  });

  it("returns REQUEST_CHANGES on critical finding", async () => {
    const { exec } = mockExec([
      () => ({ stdout: sampleDiff }),
      () => ({ stdout: '{"title":"x","isDraft":false}' }),
      () => ({ stdout: "" }),
    ]);

    const result = await review(99, {
      execFileOverride: exec,
      sdkOverride: mockSdk([requestChangesResult]),
    });

    expect(result.verdict).toBe("REQUEST_CHANGES");
    expect(result.summary).toMatch(/SQL injection/);
  });

  it("noComment skips PR comment posting", async () => {
    const { exec, calls } = mockExec([
      () => ({ stdout: sampleDiff }),
      () => ({ stdout: '{"title":"x","isDraft":false}' }),
    ]);

    const result = await review(1, {
      execFileOverride: exec,
      sdkOverride: mockSdk([approveResult]),
      noComment: true,
    });

    expect(result.verdict).toBe("APPROVE");
    expect(result.commentUrl).toBeUndefined();
    expect(calls.find((c) => c.cmd === "gh" && c.args[1] === "comment")).toBeUndefined();
  });

  it("marks draft PR ready when verdict=APPROVE + markReadyOnApprove", async () => {
    const { exec, calls } = mockExec([
      () => ({ stdout: sampleDiff }),
      () => ({ stdout: '{"title":"x","isDraft":true}' }),  // isDraft TRUE
      () => ({ stdout: "" }),                                // pr comment
      () => ({ stdout: "" }),                                // pr ready
    ]);

    const result = await review(1, {
      execFileOverride: exec,
      sdkOverride: mockSdk([approveResult]),
      markReadyOnApprove: true,
    });

    expect(result.verdict).toBe("APPROVE");
    expect(result.markedReady).toBe(true);
    const readyCall = calls.find((c) => c.cmd === "gh" && c.args[0] === "pr" && c.args[1] === "ready");
    expect(readyCall).toBeDefined();
  });

  it("does NOT mark ready when PR is already non-draft", async () => {
    const { exec, calls } = mockExec([
      () => ({ stdout: sampleDiff }),
      () => ({ stdout: '{"title":"x","isDraft":false}' }), // isDraft FALSE
      () => ({ stdout: "" }),                                // pr comment
    ]);

    const result = await review(1, {
      execFileOverride: exec,
      sdkOverride: mockSdk([approveResult]),
      markReadyOnApprove: true,
    });

    expect(result.markedReady).toBeUndefined();
    expect(calls.find((c) => c.cmd === "gh" && c.args[1] === "ready")).toBeUndefined();
  });

  it("does NOT mark ready when verdict is not APPROVE", async () => {
    const { exec } = mockExec([
      () => ({ stdout: sampleDiff }),
      () => ({ stdout: '{"title":"x","isDraft":true}' }),
      () => ({ stdout: "" }),
    ]);

    const result = await review(1, {
      execFileOverride: exec,
      sdkOverride: mockSdk([requestChangesResult]),
      markReadyOnApprove: true,
    });

    expect(result.verdict).toBe("REQUEST_CHANGES");
    expect(result.markedReady).toBeUndefined();
  });

  it("returns COMMENT verdict when diff is empty", async () => {
    const { exec } = mockExec([
      () => ({ stdout: "" }),  // empty diff
    ]);

    const result = await review(1, {
      execFileOverride: exec,
      sdkOverride: mockSdk([approveResult]),
    });

    expect(result.verdict).toBe("COMMENT");
    expect(result.error).toBe("empty-diff");
  });

  it("returns failed-style result when gh diff fails", async () => {
    const { exec } = mockExec([
      () => Object.assign(new Error("gh: not authed"), { stderr: "auth fail" }),
    ]);

    const result = await review(1, {
      execFileOverride: exec,
      sdkOverride: mockSdk([approveResult]),
    });

    expect(result.error).toMatch(/gh pr diff failed/);
  });

  it("respects budget cap", async () => {
    const { exec } = mockExec([
      () => ({ stdout: sampleDiff }),
      () => ({ stdout: '{"title":"x","isDraft":false}' }),
    ]);

    const result = await review(1, {
      execFileOverride: exec,
      sdkOverride: mockSdk([{ ...approveResult, total_cost_usd: 5.0 }]),
      maxBudgetUsd: 0.50,
    });

    expect(result.error).toMatch(/budget-exceeded/);
  });

  it("defaults to COMMENT verdict when no VERDICT line in output", async () => {
    const { exec } = mockExec([
      () => ({ stdout: sampleDiff }),
      () => ({ stdout: '{"title":"x","isDraft":false}' }),
      () => ({ stdout: "" }),
    ]);

    const malformedResult: SdkResultMessage = {
      type: "result",
      subtype: "success",
      result: "I forgot to emit a VERDICT line. Sorry!",
      total_cost_usd: 0.10,
      session_id: "bad",
    };

    const result = await review(1, {
      execFileOverride: exec,
      sdkOverride: mockSdk([malformedResult]),
    });

    expect(result.verdict).toBe("COMMENT");
  });

  it("parses verdict from markdown-bold + emoji variant (real subagent output)", async () => {
    const { exec } = mockExec([
      () => ({ stdout: sampleDiff }),
      () => ({ stdout: '{"title":"x","isDraft":false}' }),
      () => ({ stdout: "" }),
    ]);

    // This is the actual format the orchestrator-reviewer produced in a live test.
    // Earlier regex required a bare ^VERDICT: line; live subagents wrap it.
    const liveStyleResult: SdkResultMessage = {
      type: "result",
      subtype: "success",
      result: `## 💬 subagent-orchestrator review

The subagent completed.

---

**Reviewer verdict: ✅ APPROVE**

## Summary

PR looks fine.
`,
      total_cost_usd: 0.66,
      session_id: "live-style",
    };

    const result = await review(1, {
      execFileOverride: exec,
      sdkOverride: mockSdk([liveStyleResult]),
    });

    expect(result.verdict).toBe("APPROVE");
  });

  it("parses 'Verdict:' (lowercase) variant", async () => {
    const { exec } = mockExec([
      () => ({ stdout: sampleDiff }),
      () => ({ stdout: '{"title":"x","isDraft":false}' }),
      () => ({ stdout: "" }),
    ]);

    const lowerResult: SdkResultMessage = {
      type: "result",
      subtype: "success",
      result: `Verdict: REQUEST_CHANGES

## Summary

Found a critical issue.`,
      total_cost_usd: 0.30,
      session_id: "lower",
    };

    const result = await review(1, {
      execFileOverride: exec,
      sdkOverride: mockSdk([lowerResult]),
    });

    expect(result.verdict).toBe("REQUEST_CHANGES");
  });
});
