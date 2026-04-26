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
