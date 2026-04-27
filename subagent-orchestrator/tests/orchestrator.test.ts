// Tests for src/orchestrator.ts. Pure orchestration; mocked dispatchers.

import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";

import { openDb } from "../src/store/db.js";
import { orchestrateAll, orchestrateOne } from "../src/orchestrator.js";
import type { Task, TaskResult } from "../src/types.js";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "t",
    title: "x",
    prompt: "y",
    disposition: "auto",
    repo: "owner/repo",
    branch: "main",
    automerge: false,
    deepReview: false,
    dependsOn: [],
    ...overrides,
  };
}

const successResult = (taskId: string): TaskResult => ({
  taskId,
  status: "ready-for-merge",
  ultrareviewUsed: false,
  costUsdEstimate: 0.05,
});

describe("orchestrateOne", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  it("classifies, dispatches local, persists telemetry", async () => {
    const out = await orchestrateOne(
      makeTask({
        id: "investigate",
        title: "Investigate slow query",
        prompt: "read-only inspection",
      }),
      {
        db,
        dispatchOverrides: {
          local: async (task) => successResult(task.id),
        },
      },
    );

    expect(out.classification.disposition).toBe("local");
    expect(out.result.status).toBe("ready-for-merge");
    expect(out.dispatchLogId).toBeGreaterThan(0);

    const row = db
      .prepare("SELECT * FROM dispatch_log WHERE id = ?")
      .get(out.dispatchLogId) as { status: string; cost_usd_estimate: number };
    expect(row.status).toBe("ready-for-merge");
    expect(row.cost_usd_estimate).toBe(0.05);
  });

  it("respects explicit disposition override", async () => {
    let calledLocal = false;
    const out = await orchestrateOne(
      makeTask({ id: "explicit", disposition: "local" }),
      {
        db,
        dispatchOverrides: {
          local: async (task) => {
            calledLocal = true;
            return successResult(task.id);
          },
        },
      },
    );

    expect(calledLocal).toBe(true);
    expect(out.classification.disposition).toBe("local");
    expect(out.result.status).toBe("ready-for-merge");
  });

  it("dispatches web disposition via ship override", async () => {
    let shipCalled = false;
    const out = await orchestrateOne(
      makeTask({
        id: "feature",
        title: "Implement SSO",
        prompt: "in the cloud, new feature",
      }),
      {
        db,
        dispatchOverrides: {
          web: async (task) => {
            shipCalled = true;
            return { taskId: task.id, status: "dispatched", ultrareviewUsed: false, prNumber: 99 };
          },
        },
      },
    );
    expect(out.classification.disposition).toBe("web");
    expect(shipCalled).toBe(true);
    expect(out.result.status).toBe("dispatched");
    expect(out.result.prNumber).toBe(99);
  });

  it("dispatches ultraplan via override", async () => {
    let called = false;
    const out = await orchestrateOne(
      makeTask({ id: "plan", disposition: "ultraplan" }),
      {
        db,
        dispatchOverrides: {
          ultraplan: async (task) => {
            called = true;
            return { taskId: task.id, status: "dispatched", ultrareviewUsed: false };
          },
        },
      },
    );
    expect(called).toBe(true);
    expect(out.result.status).toBe("dispatched");
  });

  it("dispatches autofix when prompt has PR target", async () => {
    let receivedPr: number | null = null;
    const out = await orchestrateOne(
      makeTask({
        id: "fix",
        disposition: "autofix",
        prompt: "fix CI on PR #123",
      }),
      {
        db,
        dispatchOverrides: {
          autofix: async (task, opts) => {
            receivedPr = opts.prNumber;
            return { taskId: task.id, status: "dispatched", ultrareviewUsed: false };
          },
        },
      },
    );
    expect(receivedPr).toBe(123);
    expect(out.result.status).toBe("dispatched");
  });

  it("fails autofix without PR target", async () => {
    const out = await orchestrateOne(
      makeTask({
        id: "fix-no-target",
        disposition: "autofix",
        prompt: "fix the build",
      }),
      { db },
    );
    expect(out.result.status).toBe("failed");
    expect(out.result.error).toMatch(/PR target/);
  });

  it("fails autofix when target is an issue (not a PR)", async () => {
    const out = await orchestrateOne(
      makeTask({
        id: "fix-issue",
        disposition: "autofix",
        prompt: "look at issue #5",
      }),
      { db },
    );
    expect(out.result.status).toBe("failed");
    expect(out.result.error).toMatch(/PR target/);
  });

  it("returns failed for claude-mention without explicit target", async () => {
    const out = await orchestrateOne(
      makeTask({
        id: "mention",
        title: "Comment on the PR",
        prompt: "@claude please look at this",
      }),
      { db },
    );
    expect(out.classification.disposition).toBe("claude-mention");
    expect(out.result.status).toBe("failed");
    expect(out.result.error).toMatch(/explicit target/);
  });

  it("dispatches claude-mention when prompt has 'PR #N'", async () => {
    let calledTarget: { kind: string; prNumber?: number; issueNumber?: number } | null = null;
    const out = await orchestrateOne(
      makeTask({
        id: "mention-pr",
        title: "Review request",
        prompt: "@claude please review PR #42 for security issues",
      }),
      {
        db,
        dispatchOverrides: {
          "claude-mention": async (task, opts) => {
            calledTarget = opts.target;
            return { taskId: task.id, status: "dispatched", ultrareviewUsed: false };
          },
        },
      },
    );
    expect(out.classification.disposition).toBe("claude-mention");
    expect(out.result.status).toBe("dispatched");
    expect(calledTarget).toEqual({ kind: "pr", prNumber: 42 });
  });

  it("dispatches claude-mention when prompt has 'issue #N'", async () => {
    let calledTarget: { kind: string; prNumber?: number; issueNumber?: number } | null = null;
    const out = await orchestrateOne(
      makeTask({
        id: "mention-issue",
        title: "Triage issue",
        prompt: "@claude please look at issue #99 and respond",
      }),
      {
        db,
        dispatchOverrides: {
          "claude-mention": async (task, opts) => {
            calledTarget = opts.target;
            return { taskId: task.id, status: "dispatched", ultrareviewUsed: false };
          },
        },
      },
    );
    expect(out.result.status).toBe("dispatched");
    expect(calledTarget).toEqual({ kind: "issue", issueNumber: 99 });
  });

  it("catches dispatcher exceptions and records failed", async () => {
    const out = await orchestrateOne(
      makeTask({ id: "throw", disposition: "local" }),
      {
        db,
        dispatchOverrides: {
          local: async () => {
            throw new Error("disk full");
          },
        },
      },
    );
    expect(out.result.status).toBe("failed");
    expect(out.result.error).toMatch(/Orchestrator caught: disk full/);
  });
});

describe("orchestrateAll", () => {
  it("runs tasks sequentially and returns results in order", async () => {
    const db = openDb({ path: ":memory:" });
    const tasks = [
      makeTask({ id: "a", disposition: "local" }),
      makeTask({ id: "b", disposition: "local" }),
      makeTask({ id: "c", disposition: "local" }),
    ];
    const out = await orchestrateAll(tasks, {
      db,
      dispatchOverrides: {
        local: async (task) => successResult(task.id),
      },
    });
    expect(out.map((r) => r.task.id)).toEqual(["a", "b", "c"]);
    expect(out.every((r) => r.result.status === "ready-for-merge")).toBe(true);
  });
});
