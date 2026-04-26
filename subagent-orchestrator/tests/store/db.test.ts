// Tests for src/store/db.ts. Uses :memory: SQLite — no fs writes.

import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";

import { listRecent, openDb, recordDispatch, updateDispatch } from "../../src/store/db.js";

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
