// Tests for src/dispatch/claude-mention.ts. Mock-only; no real gh calls.

import { describe, expect, it } from "vitest";

import {
  composeMentionBody,
  dispatchClaudeMention,
} from "../../src/dispatch/claude-mention.js";
import type { Task } from "../../src/types.js";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "t",
    title: "x",
    prompt: "do the thing",
    disposition: "claude-mention",
    repo: "owner/repo",
    branch: "main",
    automerge: false,
    deepReview: false,
    dependsOn: [],
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExec = any;

describe("composeMentionBody", () => {
  it("formats with @claude prefix, prompt body, and HTML comment trailer", () => {
    const body = composeMentionBody(
      makeTask({ id: "t-99", prompt: "fix bug" }),
      "2026-04-26T22:00:00Z",
    );
    expect(body).toContain("@claude please:");
    expect(body).toContain("fix bug");
    expect(body).toContain("orchestrator: task=t-99 dispatched=2026-04-26T22:00:00Z");
  });
});

describe("dispatchClaudeMention", () => {
  it("returns dispatched on successful gh call", async () => {
    let called: { args: string[] } | null = null;
    const fakeExec: AnyExec = async (_path: string, args: string[]) => {
      called = { args };
      return { stdout: "https://github.com/x/y/issues/1#issuecomment-1", stderr: "" };
    };

    const result = await dispatchClaudeMention(makeTask({ id: "ok" }), {
      target: { kind: "pr", prNumber: 42 },
      repo: "owner/repo",
      execFileOverride: fakeExec,
    });

    expect(result.taskId).toBe("ok");
    expect(result.status).toBe("dispatched");
    expect(called).not.toBeNull();
    expect(called!.args).toContain("--repo");
    expect(called!.args).toContain("owner/repo");
    expect(called!.args[0]).toBe("pr");
    expect(called!.args[2]).toBe("42");
  });

  it("supports issue target", async () => {
    let called: { args: string[] } | null = null;
    const fakeExec: AnyExec = async (_p: string, a: string[]) => {
      called = { args: a };
      return { stdout: "", stderr: "" };
    };

    await dispatchClaudeMention(makeTask({ id: "issue" }), {
      target: { kind: "issue", issueNumber: 7 },
      execFileOverride: fakeExec,
    });

    expect(called!.args[0]).toBe("issue");
    expect(called!.args[2]).toBe("7");
  });

  it("returns failed when gh exits non-zero", async () => {
    const failingExec: AnyExec = async () => {
      throw Object.assign(new Error("gh: not authed"), { stderr: "no auth" });
    };

    const result = await dispatchClaudeMention(makeTask({ id: "no-auth" }), {
      target: { kind: "pr", prNumber: 1 },
      execFileOverride: failingExec,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/gh comment failed: gh: not authed/);
  });

  it("dryRun returns dispatched without calling gh", async () => {
    let called = false;
    const fakeExec: AnyExec = async () => {
      called = true;
      return { stdout: "", stderr: "" };
    };

    const result = await dispatchClaudeMention(makeTask({ id: "dry" }), {
      target: { kind: "pr", prNumber: 1 },
      execFileOverride: fakeExec,
      dryRun: true,
    });

    expect(result.status).toBe("dispatched");
    expect(called).toBe(false);
  });
});
