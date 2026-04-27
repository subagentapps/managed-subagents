// Tests for src/ship.ts. Mock-only; never hits real git/gh/SDK.

import { describe, expect, it } from "vitest";

import { ship } from "../src/ship.js";
import type { SdkMessage, SdkResultMessage } from "../src/dispatch/local.js";
import type { Task } from "../src/types.js";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "t",
    title: "x",
    prompt: "do the thing",
    disposition: "local",
    repo: "",
    branch: "main",
    automerge: false,
    deepReview: false,
    dependsOn: [],
    ...overrides,
  };
}

const successResult: SdkResultMessage = {
  type: "result",
  subtype: "success",
  result: "Edited README.md to fix typo",
  total_cost_usd: 0.42,
  session_id: "sess_test",
};

const noChangesResult: SdkResultMessage = {
  type: "result",
  subtype: "success",
  result: "NO_CHANGES: nothing matched the task description",
  total_cost_usd: 0.05,
  session_id: "sess_nc",
};

function mockSdk(messages: SdkMessage[]) {
  return {
    query: () =>
      (async function* () {
        for (const m of messages) yield m;
      })(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExec = any;

/** Build an exec mock that scripts responses per command. */
function mockExec(handlers: Array<(cmd: string, args: string[]) => { stdout?: string; stderr?: string } | Error>): {
  exec: AnyExec;
  calls: Array<{ cmd: string; args: string[] }>;
} {
  let i = 0;
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: AnyExec = async (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    const handler = handlers[i++];
    if (!handler) {
      // Default: success with empty stdout
      return { stdout: "", stderr: "" };
    }
    const out = handler(cmd, args);
    if (out instanceof Error) throw out;
    return { stdout: out.stdout ?? "", stderr: out.stderr ?? "" };
  };
  return { exec, calls };
}

describe("ship", () => {
  it("fails fast when working tree is dirty", async () => {
    const { exec } = mockExec([
      () => ({ stdout: " M somefile.ts\n" }), // git status --porcelain
    ]);
    const result = await ship(makeTask({ id: "dirty" }), {
      execFileOverride: exec,
      sdkOverride: mockSdk([successResult]),
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/Working tree is not clean/);
  });

  it("returns ready-for-merge with NO_CHANGES sentinel when subagent finds nothing to do", async () => {
    const { exec } = mockExec([
      () => ({ stdout: "" }),       // git status --porcelain — clean
      () => ({ stdout: "" }),       // git checkout main
      () => ({ stdout: "" }),       // git pull origin main
      () => ({ stdout: "" }),       // git checkout -b branch
      () => ({ stdout: "" }),       // git checkout main (cleanup)
      () => ({ stdout: "" }),       // git branch -D branch (cleanup)
    ]);
    const result = await ship(makeTask({ id: "no-op" }), {
      execFileOverride: exec,
      sdkOverride: mockSdk([noChangesResult]),
    });
    expect(result.status).toBe("ready-for-merge");
    expect(result.error).toMatch(/^NO_CHANGES:/);
    expect(result.prUrl).toBeUndefined();
  });

  it("succeeds end-to-end: branch + commit + push + draft PR", async () => {
    const { exec, calls } = mockExec([
      () => ({ stdout: "" }),       // git status --porcelain — clean
      () => ({ stdout: "" }),       // git checkout main
      () => ({ stdout: "" }),       // git pull origin main
      () => ({ stdout: "" }),       // git checkout -b branch
      () => ({ stdout: "1\n" }),    // git rev-list --count: 1 commit ahead
      () => ({ stdout: "" }),       // git push -u origin branch
      () => ({ stdout: "https://github.com/owner/repo/pull/42\n" }), // gh pr create
    ]);
    const result = await ship(makeTask({ id: "happy", title: "Fix typo" }), {
      execFileOverride: exec,
      sdkOverride: mockSdk([successResult]),
      repo: "owner/repo",
    });
    expect(result.status).toBe("ready-for-merge");
    expect(result.prUrl).toBe("https://github.com/owner/repo/pull/42");
    expect(result.prNumber).toBe(42);
    expect(result.costUsdEstimate).toBe(0.42);

    // Verify gh command shape
    const ghCall = calls.find((c) => c.cmd === "gh");
    expect(ghCall).toBeDefined();
    expect(ghCall!.args).toContain("--draft");
    expect(ghCall!.args).toContain("--title");
    expect(ghCall!.args).toContain("--repo");
    expect(ghCall!.args).toContain("owner/repo");
  });

  it("noRemote skips push + PR; returns ready-for-merge with no prUrl", async () => {
    const { exec, calls } = mockExec([
      () => ({ stdout: "" }),       // git status
      () => ({ stdout: "" }),       // git checkout main
      () => ({ stdout: "" }),       // git pull
      () => ({ stdout: "" }),       // git checkout -b
      () => ({ stdout: "1\n" }),    // git rev-list
    ]);
    const result = await ship(makeTask({ id: "dry" }), {
      execFileOverride: exec,
      sdkOverride: mockSdk([successResult]),
      noRemote: true,
    });
    expect(result.status).toBe("ready-for-merge");
    expect(result.prUrl).toBeUndefined();
    expect(calls.find((c) => c.cmd === "git" && c.args[0] === "push")).toBeUndefined();
    expect(calls.find((c) => c.cmd === "gh")).toBeUndefined();
  });

  it("returns failed when subagent makes no commits despite no NO_CHANGES sentinel", async () => {
    const { exec } = mockExec([
      () => ({ stdout: "" }),       // git status
      () => ({ stdout: "" }),       // git checkout main
      () => ({ stdout: "" }),       // git pull
      () => ({ stdout: "" }),       // git checkout -b
      () => ({ stdout: "0\n" }),    // git rev-list — 0 commits!
      () => ({ stdout: "" }),       // git checkout main (cleanup)
      () => ({ stdout: "" }),       // git branch -D (cleanup)
    ]);
    const result = await ship(makeTask({ id: "ghost" }), {
      execFileOverride: exec,
      sdkOverride: mockSdk([
        { ...successResult, result: "Did some thinking but didn't actually commit" },
      ]),
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/no NO_CHANGES sentinel but also no commits/);
  });

  it("returns failed on git push error", async () => {
    const { exec } = mockExec([
      () => ({ stdout: "" }),       // git status
      () => ({ stdout: "" }),       // git checkout main
      () => ({ stdout: "" }),       // git pull
      () => ({ stdout: "" }),       // git checkout -b
      () => ({ stdout: "1\n" }),    // git rev-list
      () => Object.assign(new Error("push rejected"), { stderr: "remote rejected" }),
    ]);
    const result = await ship(makeTask({ id: "bad-push" }), {
      execFileOverride: exec,
      sdkOverride: mockSdk([successResult]),
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/git push failed/);
  });

  it("returns failed on gh pr create error", async () => {
    const { exec } = mockExec([
      () => ({ stdout: "" }),       // git status
      () => ({ stdout: "" }),       // git checkout main
      () => ({ stdout: "" }),       // git pull
      () => ({ stdout: "" }),       // git checkout -b
      () => ({ stdout: "1\n" }),    // git rev-list
      () => ({ stdout: "" }),       // git push
      () => Object.assign(new Error("gh: not authed"), { stderr: "auth fail" }),
    ]);
    const result = await ship(makeTask({ id: "no-gh" }), {
      execFileOverride: exec,
      sdkOverride: mockSdk([successResult]),
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/gh pr create failed/);
  });

  it("respects budget cap", async () => {
    const { exec } = mockExec([
      () => ({ stdout: "" }),       // git status
      () => ({ stdout: "" }),       // git checkout main
      () => ({ stdout: "" }),       // git pull
      () => ({ stdout: "" }),       // git checkout -b
    ]);
    const result = await ship(makeTask({ id: "expensive" }), {
      execFileOverride: exec,
      maxBudgetUsd: 0.10,
      sdkOverride: mockSdk([{ ...successResult, total_cost_usd: 1.50 }]),
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/exceeded budget/);
  });
});
