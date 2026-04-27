// Tests for src/merge.ts. Mock-only.

import { describe, expect, it } from "vitest";

import { merge } from "../src/merge.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExec = any;

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

const readyMeta = (overrides: Partial<{ baseRefName: string; isDraft: boolean; state: string; mergeable: string }> = {}) =>
  JSON.stringify({
    number: 1,
    isDraft: false,
    state: "OPEN",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    baseRefName: "feat/foo",
    headRefName: "feat/bar",
    ...overrides,
  });

describe("merge", () => {
  it("merges a clean PR with default 'merge' method", async () => {
    const { exec, calls } = mockExec([
      () => ({ stdout: readyMeta() }),  // gh pr view
      () => ({ stdout: "" }),           // gh pr merge
      () => ({ stdout: "some-other-branch\n" }), // git rev-parse (not on base, skip pull)
    ]);

    const result = await merge(1, { execFileOverride: exec });

    expect(result.merged).toBe(true);
    expect(result.method).toBe("merge");
    expect(result.branchDeleted).toBe(true);
    expect(result.localSynced).toBe(false);
    const mergeCall = calls.find((c) => c.args[1] === "merge");
    expect(mergeCall?.args).toContain("--merge");
    expect(mergeCall?.args).toContain("--delete-branch");
  });

  it("blocks merge to main without allowProtected", async () => {
    const { exec, calls } = mockExec([
      () => ({ stdout: readyMeta({ baseRefName: "main" }) }),
    ]);

    const result = await merge(1, { execFileOverride: exec });

    expect(result.merged).toBe(false);
    expect(result.skipped).toBe("rail-blocked");
    expect(result.error).toMatch(/main/);
    // No merge call made
    expect(calls.find((c) => c.args[1] === "merge")).toBeUndefined();
  });

  it("allows merge to main with allowProtected: true", async () => {
    const { exec } = mockExec([
      () => ({ stdout: readyMeta({ baseRefName: "main" }) }),
      () => ({ stdout: "" }),  // gh pr merge
      () => ({ stdout: "feature-branch\n" }), // not on main locally
    ]);

    const result = await merge(1, { execFileOverride: exec, allowProtected: true });

    expect(result.merged).toBe(true);
    expect(result.baseBranch).toBe("main");
  });

  it("syncs local when current branch matches base", async () => {
    const { exec, calls } = mockExec([
      () => ({ stdout: readyMeta({ baseRefName: "main" }) }),
      () => ({ stdout: "" }),                // merge
      () => ({ stdout: "main\n" }),          // rev-parse: on main
      () => ({ stdout: "Already up to date." }), // git pull
    ]);

    const result = await merge(1, { execFileOverride: exec, allowProtected: true });

    expect(result.localSynced).toBe(true);
    const pullCall = calls.find((c) => c.cmd === "git" && c.args[0] === "pull");
    expect(pullCall).toBeDefined();
  });

  it("skips draft PRs", async () => {
    const { exec, calls } = mockExec([
      () => ({ stdout: readyMeta({ isDraft: true }) }),
    ]);

    const result = await merge(1, { execFileOverride: exec });

    expect(result.skipped).toBe("draft");
    expect(calls.find((c) => c.args[1] === "merge")).toBeUndefined();
  });

  it("skips already-merged PRs", async () => {
    const { exec } = mockExec([
      () => ({ stdout: readyMeta({ state: "MERGED" }) }),
    ]);
    const result = await merge(1, { execFileOverride: exec });
    expect(result.skipped).toBe("already-merged");
  });

  it("skips closed PRs", async () => {
    const { exec } = mockExec([
      () => ({ stdout: readyMeta({ state: "CLOSED" }) }),
    ]);
    const result = await merge(1, { execFileOverride: exec });
    expect(result.skipped).toBe("closed");
  });

  it("skips conflicting PRs", async () => {
    const { exec } = mockExec([
      () => ({ stdout: readyMeta({ mergeable: "CONFLICTING" }) }),
    ]);
    const result = await merge(1, { execFileOverride: exec });
    expect(result.skipped).toBe("not-mergeable");
  });

  it("respects --method squash", async () => {
    const { exec, calls } = mockExec([
      () => ({ stdout: readyMeta() }),
      () => ({ stdout: "" }),
      () => ({ stdout: "x\n" }),
    ]);
    const result = await merge(1, { execFileOverride: exec, method: "squash" });
    expect(result.merged).toBe(true);
    const mergeCall = calls.find((c) => c.args[1] === "merge");
    expect(mergeCall?.args).toContain("--squash");
  });

  it("respects --no-delete-branch", async () => {
    const { exec, calls } = mockExec([
      () => ({ stdout: readyMeta() }),
      () => ({ stdout: "" }),
      () => ({ stdout: "x\n" }),
    ]);
    const result = await merge(1, { execFileOverride: exec, deleteBranch: false });
    expect(result.branchDeleted).toBe(false);
    const mergeCall = calls.find((c) => c.args[1] === "merge");
    expect(mergeCall?.args).not.toContain("--delete-branch");
  });

  it("returns error when gh pr view fails", async () => {
    const { exec } = mockExec([
      () => Object.assign(new Error("gh: not authed"), { stderr: "auth fail" }),
    ]);
    const result = await merge(1, { execFileOverride: exec });
    expect(result.merged).toBe(false);
    expect(result.error).toMatch(/gh pr view failed/);
  });

  it("returns error when gh pr merge fails", async () => {
    const { exec } = mockExec([
      () => ({ stdout: readyMeta() }),
      () => Object.assign(new Error("merge conflict"), { stderr: "boom" }),
    ]);
    const result = await merge(1, { execFileOverride: exec });
    expect(result.merged).toBe(false);
    expect(result.error).toMatch(/gh pr merge failed/);
  });
});
