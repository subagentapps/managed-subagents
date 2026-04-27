// Tests for src/store/db.ts. Uses :memory: SQLite — no fs writes.

import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";

import { listRecent, openDb, queryDispatches, recordDispatch, updateDispatch } from "../../src/store/db.js";

describe("orchestrator db", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  it("creates the dispatch_log table on open", () => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dispatch_log'")
      .get();
    expect(row).toBeDefined();
  });

  it("recordDispatch inserts a row and returns its id", () => {
    const id = recordDispatch(db, {
      taskId: "t-1",
      disposition: "local",
      dispatchedAt: "2026-04-26T22:00:00Z",
    });
    expect(typeof id).toBe("number");

    const rows = listRecent(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.task_id).toBe("t-1");
    expect(rows[0]?.disposition).toBe("local");
    expect(rows[0]?.status).toBe("dispatched");
    expect(rows[0]?.ultrareview_used).toBe(0);
  });

  it("updateDispatch applies a partial patch", () => {
    const id = recordDispatch(db, { taskId: "t-2", disposition: "claude-mention" });
    updateDispatch(db, id, {
      status: "ready-for-merge",
      prUrl: "https://github.com/x/y/pull/123",
      prNumber: 123,
      costUsdEstimate: 0.42,
    });

    const row = listRecent(db)[0];
    expect(row?.status).toBe("ready-for-merge");
    expect(row?.pr_url).toBe("https://github.com/x/y/pull/123");
    expect(row?.pr_number).toBe(123);
    expect(row?.cost_usd_estimate).toBe(0.42);
  });

  it("updateDispatch with empty patch is a no-op", () => {
    const id = recordDispatch(db, { taskId: "t-3", disposition: "local" });
    expect(() => updateDispatch(db, id, {})).not.toThrow();
    const row = listRecent(db)[0];
    expect(row?.status).toBe("dispatched");
  });

  it("ultrareviewUsed boolean maps to 0/1 int", () => {
    const id = recordDispatch(db, { taskId: "t-4", disposition: "web" });
    updateDispatch(db, id, { ultrareviewUsed: true });
    expect(listRecent(db)[0]?.ultrareview_used).toBe(1);

    updateDispatch(db, id, { ultrareviewUsed: false });
    expect(listRecent(db)[0]?.ultrareview_used).toBe(0);
  });

  it("listRecent returns newest first", () => {
    recordDispatch(db, { taskId: "old", disposition: "local", dispatchedAt: "2026-04-01T00:00:00Z" });
    recordDispatch(db, { taskId: "new", disposition: "local", dispatchedAt: "2026-04-26T00:00:00Z" });
    const rows = listRecent(db);
    expect(rows[0]?.task_id).toBe("new");
    expect(rows[1]?.task_id).toBe("old");
  });

  it("listRecent respects limit", () => {
    for (let i = 0; i < 10; i++) {
      recordDispatch(db, { taskId: `t-${i}`, disposition: "local" });
    }
    expect(listRecent(db, 3)).toHaveLength(3);
  });

  it("CHECK constraint rejects invalid status", () => {
    const id = recordDispatch(db, { taskId: "t-bad", disposition: "local" });
    expect(() =>
      // @ts-expect-error: deliberately testing invalid value
      updateDispatch(db, id, { status: "bogus-status" }),
    ).toThrow();
  });
});

describe("queryDispatches", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    // Seed: 4 rows across statuses, dispositions, times, and PR-ness
    const a = recordDispatch(db, { taskId: "task-a", disposition: "local", dispatchedAt: "2026-04-25T10:00:00Z" });
    updateDispatch(db, a, { status: "merged", prUrl: "https://github.com/o/r/pull/1", prNumber: 1, ultrareviewUsed: false });
    const b = recordDispatch(db, { taskId: "task-b", disposition: "ultraplan", dispatchedAt: "2026-04-26T10:00:00Z" });
    updateDispatch(db, b, { status: "failed", ultrareviewUsed: false });
    const c = recordDispatch(db, { taskId: "task-a", disposition: "local", dispatchedAt: "2026-04-27T10:00:00Z" });
    updateDispatch(db, c, { status: "dispatched", ultrareviewUsed: false });
    const d = recordDispatch(db, { taskId: "task-c", disposition: "autofix", dispatchedAt: "2026-04-27T11:00:00Z" });
    updateDispatch(db, d, { status: "needs-human", prUrl: "https://github.com/o/r/pull/2", prNumber: 2, ultrareviewUsed: false });
  });

  it("returns all rows newest-first when no filters", () => {
    const rows = queryDispatches(db);
    expect(rows).toHaveLength(4);
    expect(rows[0]?.task_id).toBe("task-c");
    expect(rows[3]?.task_id).toBe("task-a");
  });

  it("filters by single status", () => {
    const rows = queryDispatches(db, { status: "failed" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.task_id).toBe("task-b");
  });

  it("filters by status array (OR semantics)", () => {
    const rows = queryDispatches(db, { status: ["failed", "needs-human"] });
    expect(rows.map((r) => r.task_id).sort()).toEqual(["task-b", "task-c"]);
  });

  it("filters by taskId", () => {
    const rows = queryDispatches(db, { taskId: "task-a" });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.task_id === "task-a")).toBe(true);
  });

  it("filters by disposition", () => {
    const rows = queryDispatches(db, { disposition: "local" });
    expect(rows).toHaveLength(2);
  });

  it("filters by since timestamp", () => {
    const rows = queryDispatches(db, { since: "2026-04-27T00:00:00Z" });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.dispatched_at >= "2026-04-27")).toBe(true);
  });

  it("filters by until timestamp", () => {
    const rows = queryDispatches(db, { until: "2026-04-26T23:59:59Z" });
    expect(rows).toHaveLength(2);
  });

  it("filters by hasPr=true", () => {
    const rows = queryDispatches(db, { hasPr: true });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.pr_number !== null)).toBe(true);
  });

  it("filters by hasPr=false", () => {
    const rows = queryDispatches(db, { hasPr: false });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.pr_number === null)).toBe(true);
  });

  it("respects limit", () => {
    const rows = queryDispatches(db, { limit: 2 });
    expect(rows).toHaveLength(2);
  });

  it("ANDs multiple filters together", () => {
    const rows = queryDispatches(db, {
      taskId: "task-a",
      since: "2026-04-26T00:00:00Z",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dispatched_at).toBe("2026-04-27T10:00:00Z");
  });

  it("returns empty when status array is empty", () => {
    const rows = queryDispatches(db, { status: [] });
    // Empty array → no status filter applied → all rows
    expect(rows).toHaveLength(4);
  });
});
