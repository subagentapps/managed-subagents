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

  it("returns failed for un-wired disposition (web)", async () => {
    const out = await orchestrateOne(
      makeTask({
        id: "feature",
        title: "Implement SSO",
        prompt: "in the cloud, new feature",
      }),
      { db },
    );
    expect(out.classification.disposition).toBe("web");
    expect(out.result.status).toBe("failed");
    expect(out.result.error).toMatch(/not yet wired/);
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
