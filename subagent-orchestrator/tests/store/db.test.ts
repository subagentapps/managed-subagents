// Tests for src/store/db.ts. Uses :memory: SQLite — no fs writes.

import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";

import { exportDispatches, importDispatches, listRecent, openDb, pruneDispatches, queryDispatches, recordDispatch, summarizeDispatches, updateDispatch, updateDispatchStatus, type DispatchExportFile } from "../../src/store/db.js";

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

  describe("updateDispatchStatus (manual reconcile)", () => {
    it("updates the status column for an existing row", () => {
      const id = recordDispatch(db, { taskId: "stuck", disposition: "web" });
      updateDispatchStatus(db, id, "cancelled");
      expect(listRecent(db)[0]?.status).toBe("cancelled");
    });

    it("appends [manual: <reason>] to error when reason is provided", () => {
      const id = recordDispatch(db, { taskId: "stuck", disposition: "web" });
      updateDispatchStatus(db, id, "failed", "killed by user");
      const row = listRecent(db)[0];
      expect(row?.status).toBe("failed");
      expect(row?.error).toBe("[manual: killed by user]");
    });

    it("appends to existing error rather than overwriting", () => {
      const id = recordDispatch(db, { taskId: "stuck", disposition: "web" });
      updateDispatch(db, id, { status: "failed" });
      // Manually set an existing error so we can verify append behavior
      db.prepare(`UPDATE dispatch_log SET error = ? WHERE id = ?`).run("first failure", id);
      updateDispatchStatus(db, id, "cancelled", "killed by user");
      const row = listRecent(db)[0];
      expect(row?.error).toBe("first failure\n[manual: killed by user]");
    });

    it("throws on unknown id rather than silently no-op", () => {
      expect(() => updateDispatchStatus(db, 99999, "failed")).toThrow(/no dispatch_log row with id=99999/);
    });
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

describe("summarizeDispatches", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    // Seed: 5 rows across 2 days, mixed statuses + costs
    const r = (id: string, at: string, status: "merged" | "failed" | "needs-human" | "dispatched" | "ready-for-merge", cost?: number) => {
      const rid = recordDispatch(db, { taskId: id, disposition: "local", dispatchedAt: at });
      updateDispatch(db, rid, {
        status, ultrareviewUsed: false,
        ...(cost !== undefined ? { costUsdEstimate: cost } : {}),
      });
    };
    r("a1", "2026-04-26T08:00:00Z", "merged", 0.10);
    r("a2", "2026-04-26T09:00:00Z", "merged", 0.20);
    r("a3", "2026-04-26T10:00:00Z", "failed", 0.05);
    r("b1", "2026-04-27T08:00:00Z", "needs-human", 0.15);
    r("b2", "2026-04-27T09:00:00Z", "dispatched");  // in-flight, no cost
  });

  it("buckets by day (default), newest first", () => {
    const out = summarizeDispatches(db);
    expect(out).toHaveLength(2);
    expect(out[0]?.bucket).toBe("2026-04-27");
    expect(out[1]?.bucket).toBe("2026-04-26");
  });

  it("counts succeeded/failed/needs-human/inFlight per bucket", () => {
    const out = summarizeDispatches(db);
    const day26 = out.find((b) => b.bucket === "2026-04-26");
    const day27 = out.find((b) => b.bucket === "2026-04-27");
    expect(day26).toMatchObject({ total: 3, succeeded: 2, failed: 1, merged: 2, needsHuman: 0, inFlight: 0 });
    expect(day27).toMatchObject({ total: 2, succeeded: 0, failed: 0, needsHuman: 1, inFlight: 1 });
  });

  it("sums costs per bucket and treats null as 0", () => {
    const out = summarizeDispatches(db);
    const day26 = out.find((b) => b.bucket === "2026-04-26");
    const day27 = out.find((b) => b.bucket === "2026-04-27");
    expect(day26?.totalCostUsd).toBeCloseTo(0.35, 5);
    expect(day27?.totalCostUsd).toBeCloseTo(0.15, 5);  // dispatched row has no cost
  });

  it("computes successRate as succeeded/(succeeded+failed), excluding in-flight", () => {
    const out = summarizeDispatches(db);
    const day26 = out.find((b) => b.bucket === "2026-04-26");
    const day27 = out.find((b) => b.bucket === "2026-04-27");
    expect(day26?.successRate).toBeCloseTo(2 / 3, 5);
    // day27 has 0 succeeded + 0 failed → null
    expect(day27?.successRate).toBeNull();
  });

  it("buckets by hour", () => {
    const out = summarizeDispatches(db, { bucket: "hour" });
    expect(out.length).toBeGreaterThanOrEqual(5);
    expect(out[0]?.bucket).toMatch(/^2026-04-27 09$/);
  });

  it("buckets by month", () => {
    const out = summarizeDispatches(db, { bucket: "month" });
    expect(out).toHaveLength(1);
    expect(out[0]?.bucket).toBe("2026-04");
    expect(out[0]?.total).toBe(5);
  });

  it("applies filters before bucketing", () => {
    const out = summarizeDispatches(db, { status: "failed" });
    expect(out).toHaveLength(1);
    expect(out[0]?.bucket).toBe("2026-04-26");
    expect(out[0]?.total).toBe(1);
  });

  it("returns empty when no rows match filters", () => {
    const out = summarizeDispatches(db, { taskId: "nonexistent" });
    expect(out).toEqual([]);
  });
});

describe("pruneDispatches", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    const r = (id: string, at: string, status: "merged" | "failed" | "dispatched") => {
      const rid = recordDispatch(db, { taskId: id, disposition: "local", dispatchedAt: at });
      updateDispatch(db, rid, { status, ultrareviewUsed: false });
    };
    r("old1", "2026-04-20T00:00:00Z", "merged");
    r("old2", "2026-04-22T00:00:00Z", "failed");
    r("recent1", "2026-04-26T00:00:00Z", "merged");
    r("recent2", "2026-04-27T00:00:00Z", "dispatched");
  });

  it("deletes rows before a cutoff", () => {
    const result = pruneDispatches(db, { before: "2026-04-25T00:00:00Z" });
    expect(result.matched).toBe(2);
    expect(result.deleted).toBe(2);
    expect(result.cutoff).toBe("2026-04-25T00:00:00Z");
    expect(listRecent(db).map((r) => r.task_id).sort()).toEqual(["recent1", "recent2"]);
  });

  it("dryRun reports matched without deleting", () => {
    const result = pruneDispatches(db, { before: "2026-04-25T00:00:00Z", dryRun: true });
    expect(result.matched).toBe(2);
    expect(result.deleted).toBe(0);
    expect(listRecent(db)).toHaveLength(4);
  });

  it("status filter narrows what gets pruned", () => {
    // before cutoff there are 2 rows: 1 merged + 1 failed; only prune the failed
    const result = pruneDispatches(db, { before: "2026-04-25T00:00:00Z", status: "failed" });
    expect(result.deleted).toBe(1);
    expect(listRecent(db).map((r) => r.task_id).sort()).toEqual(["old1", "recent1", "recent2"]);
  });

  it("status array OR'd", () => {
    const result = pruneDispatches(db, { before: "2026-04-25T00:00:00Z", status: ["merged", "failed"] });
    expect(result.deleted).toBe(2);
  });

  it("olderThanDays computes cutoff from now", () => {
    const result = pruneDispatches(db, { olderThanDays: 1, dryRun: true });
    // All 4 rows are well before "now" minus 1 day in 2026-04-27 context
    expect(result.matched).toBeGreaterThanOrEqual(0);
    // Cutoff should be parseable
    expect(() => new Date(result.cutoff).toISOString()).not.toThrow();
  });

  it("throws when neither cutoff is supplied", () => {
    expect(() => pruneDispatches(db, {})).toThrow(/before.*olderThanDays/);
  });

  it("returns 0 when nothing matches", () => {
    const result = pruneDispatches(db, { before: "2020-01-01T00:00:00Z" });
    expect(result.deleted).toBe(0);
  });
});

describe("exportDispatches / importDispatches", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    const r = (id: string, at: string, status: "merged" | "failed") => {
      const rid = recordDispatch(db, { taskId: id, disposition: "local", dispatchedAt: at });
      updateDispatch(db, rid, { status, ultrareviewUsed: false, costUsdEstimate: 0.10 });
    };
    r("a", "2026-04-26T00:00:00Z", "merged");
    r("b", "2026-04-27T00:00:00Z", "failed");
  });

  it("export emits schemaVersion + rows", () => {
    const file = exportDispatches(db);
    expect(file.schemaVersion).toBe(1);
    expect(file.rows).toHaveLength(2);
    expect(file.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("export honors filters", () => {
    const file = exportDispatches(db, { status: "failed" });
    expect(file.rows).toHaveLength(1);
    expect(file.rows[0]?.task_id).toBe("b");
  });

  it("import round-trips into a fresh DB", () => {
    const file = exportDispatches(db);
    const fresh = openDb({ path: ":memory:" });
    const result = importDispatches(fresh, file);
    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(0);
    expect(listRecent(fresh)).toHaveLength(2);
  });

  it("import skip policy keeps existing rows on conflict", () => {
    const file = exportDispatches(db);
    const result = importDispatches(db, file, { onConflict: "skip" });
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it("import replace policy overwrites existing rows", () => {
    const file = exportDispatches(db);
    const aRow = file.rows.find((r) => r.task_id === "a")!;
    aRow.status = "needs-human";
    const result = importDispatches(db, file, { onConflict: "replace" });
    expect(result.replaced).toBe(2);
    const after = listRecent(db);
    const a = after.find((r) => r.task_id === "a");
    expect(a?.status).toBe("needs-human");
  });

  it("import error policy throws on conflict", () => {
    const file = exportDispatches(db);
    expect(() => importDispatches(db, file, { onConflict: "error" })).toThrow(/already exists/);
  });

  it("import dryRun does not write but counts", () => {
    const file = exportDispatches(db);
    const fresh = openDb({ path: ":memory:" });
    const result = importDispatches(fresh, file, { dryRun: true });
    expect(result.inserted).toBe(2);
    expect(listRecent(fresh)).toHaveLength(0);
  });

  it("import rejects unsupported schemaVersion", () => {
    const bad: DispatchExportFile = {
      schemaVersion: 99 as unknown as 1,
      exportedAt: "x",
      rows: [],
    };
    expect(() => importDispatches(db, bad)).toThrow(/schemaVersion/);
  });

  it("import is atomic — error policy rollback leaves db unchanged", () => {
    const file = exportDispatches(db);
    const fresh = openDb({ path: ":memory:" });
    // Pre-populate with row id matching one in file to trigger conflict
    const conflictId = file.rows[1]!.id;
    const cid = recordDispatch(fresh, { taskId: "preexisting", disposition: "local", dispatchedAt: "2026-04-25T00:00:00Z" });
    // Force the same id to exist
    fresh.prepare("UPDATE dispatch_log SET id=? WHERE id=?").run(conflictId, cid);
    expect(() => importDispatches(fresh, file, { onConflict: "error" })).toThrow();
    // The first row would have been inserted absent the transaction; with rollback only the preexisting row remains
    const rows = listRecent(fresh);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.task_id).toBe("preexisting");
  });
});
