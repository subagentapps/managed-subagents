// store/db.ts — SQLite telemetry for the orchestrator. M7 piece.
//
// Schema is the dispatch_log table from PROJECT_PLAN.md §7. Default
// path is ~/.claude/orchestrator.db; override for tests with `:memory:`.

import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";

import type { TaskResult } from "../types.js";

export const DISPATCH_LOG_DDL = `
CREATE TABLE IF NOT EXISTS dispatch_log (
  id INTEGER PRIMARY KEY,
  task_id TEXT NOT NULL,
  disposition TEXT NOT NULL,
  dispatched_at TEXT NOT NULL,
  pr_url TEXT,
  pr_number INTEGER,
  pr_merged_at TEXT,
  review_finding_count INTEGER,
  ultrareview_used INTEGER NOT NULL DEFAULT 0,
  cost_usd_estimate REAL,
  status TEXT NOT NULL CHECK (status IN ('dispatched','reviewing','ready-for-merge','needs-human','failed','merged'))
);

CREATE INDEX IF NOT EXISTS idx_dispatch_log_status ON dispatch_log(status, dispatched_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_log_task ON dispatch_log(task_id, dispatched_at DESC);
`;

export interface DispatchLogRow {
  id: number;
  task_id: string;
  disposition: string;
  dispatched_at: string;
  pr_url: string | null;
  pr_number: number | null;
  pr_merged_at: string | null;
  review_finding_count: number | null;
  ultrareview_used: 0 | 1;
  cost_usd_estimate: number | null;
  status: TaskResult["status"];
}

export interface OpenDbOptions {
  /** SQLite path; default `~/.claude/orchestrator.db`. Use `:memory:` for tests. */
  path?: string;
  /** Open read-only */
  readonly?: boolean;
}

/** Open or create the orchestrator DB and ensure the schema exists. */
export function openDb(options: OpenDbOptions = {}): Database.Database {
  const path = options.path ?? join(homedir(), ".claude", "orchestrator.db");
  const db = new Database(path, { readonly: options.readonly ?? false });
  db.pragma("journal_mode = WAL");
  db.exec(DISPATCH_LOG_DDL);
  return db;
}

/** Insert a row when a dispatch begins. Returns the new row id. */
export function recordDispatch(
  db: Database.Database,
  args: {
    taskId: string;
    disposition: string;
    dispatchedAt?: string; // ISO 8601; defaults to now
  },
): number {
  const stmt = db.prepare(
    `INSERT INTO dispatch_log (task_id, disposition, dispatched_at, ultrareview_used, status)
     VALUES (?, ?, ?, 0, 'dispatched')`,
  );
  const at = args.dispatchedAt ?? new Date().toISOString();
  const info = stmt.run(args.taskId, args.disposition, at);
  return info.lastInsertRowid as number;
}

/** Update a dispatch row when its outcome lands. */
export function updateDispatch(
  db: Database.Database,
  id: number,
  patch: Partial<{
    status: TaskResult["status"];
    prUrl: string | null;
    prNumber: number | null;
    prMergedAt: string | null;
    reviewFindingCount: number | null;
    ultrareviewUsed: boolean;
    costUsdEstimate: number | null;
  }>,
): void {
  const sets: string[] = [];
  const vals: Array<string | number | null> = [];

  if (patch.status !== undefined) {
    sets.push("status = ?");
    vals.push(patch.status);
  }
  if (patch.prUrl !== undefined) {
    sets.push("pr_url = ?");
    vals.push(patch.prUrl);
  }
  if (patch.prNumber !== undefined) {
    sets.push("pr_number = ?");
    vals.push(patch.prNumber);
  }
  if (patch.prMergedAt !== undefined) {
    sets.push("pr_merged_at = ?");
    vals.push(patch.prMergedAt);
  }
  if (patch.reviewFindingCount !== undefined) {
    sets.push("review_finding_count = ?");
    vals.push(patch.reviewFindingCount);
  }
  if (patch.ultrareviewUsed !== undefined) {
    sets.push("ultrareview_used = ?");
    vals.push(patch.ultrareviewUsed ? 1 : 0);
  }
  if (patch.costUsdEstimate !== undefined) {
    sets.push("cost_usd_estimate = ?");
    vals.push(patch.costUsdEstimate);
  }

  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE dispatch_log SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

/** Read recent rows, newest first. */
export function listRecent(db: Database.Database, limit = 50): DispatchLogRow[] {
  return db
    .prepare(`SELECT * FROM dispatch_log ORDER BY dispatched_at DESC LIMIT ?`)
    .all(limit) as DispatchLogRow[];
}

export interface QueryDispatchesFilters {
  /** One or more status values to include (OR'd) */
  status?: TaskResult["status"] | Array<TaskResult["status"]>;
  /** Filter by task_id (exact match) */
  taskId?: string;
  /** Filter by disposition (exact match) */
  disposition?: string;
  /** Only rows dispatched at or after this ISO 8601 timestamp */
  since?: string;
  /** Only rows dispatched at or before this ISO 8601 timestamp */
  until?: string;
  /** Filter rows that have a non-null PR number */
  hasPr?: boolean;
  /** Default 100 */
  limit?: number;
}

/**
 * Filter dispatch_log rows. All filters are AND'd; status accepts an array
 * which is OR'd internally. Returns newest-first.
 */
export function queryDispatches(
  db: Database.Database,
  filters: QueryDispatchesFilters = {},
): DispatchLogRow[] {
  const where: string[] = [];
  const vals: unknown[] = [];

  if (filters.status !== undefined) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    if (statuses.length > 0) {
      where.push(`status IN (${statuses.map(() => "?").join(", ")})`);
      vals.push(...statuses);
    }
  }
  if (filters.taskId !== undefined) {
    where.push(`task_id = ?`);
    vals.push(filters.taskId);
  }
  if (filters.disposition !== undefined) {
    where.push(`disposition = ?`);
    vals.push(filters.disposition);
  }
  if (filters.since !== undefined) {
    where.push(`dispatched_at >= ?`);
    vals.push(filters.since);
  }
  if (filters.until !== undefined) {
    where.push(`dispatched_at <= ?`);
    vals.push(filters.until);
  }
  if (filters.hasPr === true) {
    where.push(`pr_number IS NOT NULL`);
  } else if (filters.hasPr === false) {
    where.push(`pr_number IS NULL`);
  }

  const limit = filters.limit ?? 100;
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `SELECT * FROM dispatch_log ${whereClause} ORDER BY dispatched_at DESC LIMIT ?`;
  vals.push(limit);

  return db.prepare(sql).all(...vals) as DispatchLogRow[];
}

export interface DispatchSummaryBucket {
  /** Bucket key — date 'YYYY-MM-DD' for daily, 'YYYY-MM-DD HH' for hourly, etc. */
  bucket: string;
  total: number;
  succeeded: number;
  failed: number;
  needsHuman: number;
  merged: number;
  inFlight: number;
  totalCostUsd: number;
  /** total / (succeeded + failed) — null when no terminal rows */
  successRate: number | null;
}

export interface SummarizeDispatchesOptions extends QueryDispatchesFilters {
  /** Aggregation granularity. Default 'day'. */
  bucket?: "day" | "hour" | "month";
}

/**
 * Aggregate dispatch_log rows by time bucket. Filters apply first
 * (same shape as queryDispatches), then rows are bucketed by the
 * date prefix of dispatched_at.
 *
 * 'succeeded' = status in (merged, ready-for-merge); 'failed' = status='failed';
 * 'needsHuman' = needs-human; 'inFlight' = dispatched|reviewing.
 *
 * successRate is intentionally narrow: succeeded / (succeeded + failed),
 * excluding in-flight rows that haven't terminated yet.
 */
export function summarizeDispatches(
  db: Database.Database,
  options: SummarizeDispatchesOptions = {},
): DispatchSummaryBucket[] {
  const { bucket = "day", ...filters } = options;
  const rows = queryDispatches(db, { ...filters, limit: filters.limit ?? 10_000 });

  const buckets = new Map<string, DispatchSummaryBucket>();
  for (const row of rows) {
    const key = bucketKey(row.dispatched_at, bucket);
    let b = buckets.get(key);
    if (!b) {
      b = {
        bucket: key, total: 0, succeeded: 0, failed: 0,
        needsHuman: 0, merged: 0, inFlight: 0, totalCostUsd: 0,
        successRate: null,
      };
      buckets.set(key, b);
    }
    b.total += 1;
    b.totalCostUsd += row.cost_usd_estimate ?? 0;
    if (row.status === "merged") {
      b.merged += 1;
      b.succeeded += 1;
    } else if (row.status === "ready-for-merge") {
      b.succeeded += 1;
    } else if (row.status === "failed") {
      b.failed += 1;
    } else if (row.status === "needs-human") {
      b.needsHuman += 1;
    } else if (row.status === "dispatched" || row.status === "reviewing") {
      b.inFlight += 1;
    }
  }

  const out = Array.from(buckets.values()).sort((a, b) => b.bucket.localeCompare(a.bucket));
  for (const b of out) {
    const terminal = b.succeeded + b.failed;
    b.successRate = terminal > 0 ? b.succeeded / terminal : null;
  }
  return out;
}

export interface PruneDispatchesOptions {
  /** Delete rows older than this ISO 8601 timestamp. */
  before?: string;
  /** Delete rows older than this many days. */
  olderThanDays?: number;
  /** Only prune rows whose status matches (or is in this array). */
  status?: TaskResult["status"] | Array<TaskResult["status"]>;
  /** If true, just count matching rows without deleting. */
  dryRun?: boolean;
}

export interface PruneDispatchesResult {
  matched: number;
  deleted: number;
  cutoff: string;
}

/**
 * Delete rows from dispatch_log matching the supplied filters.
 *
 * At least one of `before` or `olderThanDays` must be supplied to bound
 * what gets deleted. Status filter optional. With dryRun=true, returns
 * the matched count without deleting.
 *
 * Throws if neither cutoff is supplied — refuses to wipe the whole table.
 */
export function pruneDispatches(
  db: Database.Database,
  options: PruneDispatchesOptions,
): PruneDispatchesResult {
  let cutoff: string;
  if (options.before !== undefined) {
    cutoff = options.before;
  } else if (options.olderThanDays !== undefined) {
    const ms = Date.now() - options.olderThanDays * 24 * 60 * 60 * 1000;
    cutoff = new Date(ms).toISOString();
  } else {
    throw new Error("pruneDispatches requires either 'before' or 'olderThanDays' to bound the deletion");
  }

  const where: string[] = ["dispatched_at < ?"];
  const vals: unknown[] = [cutoff];

  if (options.status !== undefined) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    if (statuses.length > 0) {
      where.push(`status IN (${statuses.map(() => "?").join(", ")})`);
      vals.push(...statuses);
    }
  }

  const whereClause = where.join(" AND ");
  const matchedRow = db
    .prepare(`SELECT COUNT(*) AS n FROM dispatch_log WHERE ${whereClause}`)
    .get(...vals) as { n: number };
  const matched = matchedRow.n;

  if (options.dryRun) {
    return { matched, deleted: 0, cutoff };
  }

  const info = db
    .prepare(`DELETE FROM dispatch_log WHERE ${whereClause}`)
    .run(...vals);
  return { matched, deleted: info.changes, cutoff };
}

function bucketKey(iso: string, granularity: "day" | "hour" | "month"): string {
  // dispatched_at is stored as ISO 8601, e.g. '2026-04-27T10:00:00Z'
  if (granularity === "month") return iso.slice(0, 7);
  if (granularity === "hour") return iso.slice(0, 13).replace("T", " ");
  return iso.slice(0, 10);
}
