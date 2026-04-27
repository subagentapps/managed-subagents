// `subagent-orchestrator dispatch` subcommands.
// Wires the orchestrator main loop into the CLI so users can:
//   subagent-orchestrator dispatch task <id>           — dispatch one task by id
//   subagent-orchestrator dispatch all                 — orchestrateAll over tasks.toml
//   subagent-orchestrator dispatch stats               — show recent dispatch_log rows

import { orchestrateAll, orchestrateOne } from "../orchestrator.js";
import { exportDispatches, importDispatches, openDb, pruneDispatches, queryDispatches, summarizeDispatches, type DispatchExportFile, type DispatchLogRow, type ImportDispatchesOptions, type PruneDispatchesOptions, type QueryDispatchesFilters, type SummarizeDispatchesOptions } from "../store/db.js";
import { readFileSync, writeFileSync } from "node:fs";
import { loadTasks } from "../store/tasks.js";
import type { OrchestrateResult } from "../orchestrator.js";
import type { TaskResult } from "../types.js";

export interface DispatchTaskOptions {
  tasksTomlPath?: string;
  dbPath?: string;
  /** orchestrateAll: respect dependsOn topo order (default true). */
  respectDeps?: boolean;
}

export async function runDispatchTask(
  taskId: string,
  options: DispatchTaskOptions = {},
): Promise<void> {
  const tasks = loadTasks(options.tasksTomlPath);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    console.error(`No task with id='${taskId}' in ${options.tasksTomlPath ?? "tasks.toml"}`);
    process.exitCode = 2;
    return;
  }

  const db = openDb(options.dbPath ? { path: options.dbPath } : {});
  const out = await orchestrateOne(task, { db });
  printResult(out);
  if (out.result.status === "failed") {
    process.exitCode = 1;
  }
}

export async function runDispatchAll(options: DispatchTaskOptions = {}): Promise<void> {
  const tasks = loadTasks(options.tasksTomlPath);
  if (tasks.length === 0) {
    console.log("(no tasks defined in tasks.toml)");
    return;
  }
  const db = openDb(options.dbPath ? { path: options.dbPath } : {});
  const results = await orchestrateAll(tasks, {
    db,
    ...(options.respectDeps !== undefined ? { respectDeps: options.respectDeps } : {}),
  });
  for (const r of results) printResult(r);

  const failed = results.filter((r) => r.result.status === "failed").length;
  console.log(`\n${results.length - failed}/${results.length} succeeded`);
  if (failed > 0) process.exitCode = 1;
}

export function runDispatchStats(options: { dbPath?: string; limit?: number } = {}): void {
  const db = openDb(options.dbPath ? { path: options.dbPath } : {});
  const limit = options.limit ?? 20;
  const rows = db
    .prepare(`SELECT * FROM dispatch_log ORDER BY dispatched_at DESC LIMIT ?`)
    .all(limit) as Array<{
    id: number;
    task_id: string;
    disposition: string;
    status: string;
    cost_usd_estimate: number | null;
    dispatched_at: string;
    pr_url: string | null;
  }>;

  if (rows.length === 0) {
    console.log("(no dispatches recorded yet)");
    return;
  }

  console.log("id   task_id              disposition     status            cost   dispatched_at        pr");
  console.log("---  -------------------  --------------  ----------------  -----  -------------------  --");
  for (const r of rows) {
    const cost = r.cost_usd_estimate != null ? `$${r.cost_usd_estimate.toFixed(2)}` : "—";
    const pr = r.pr_url ? r.pr_url.replace("https://github.com/", "") : "";
    console.log(
      `${String(r.id).padEnd(3)}  ${r.task_id.padEnd(19)}  ${r.disposition.padEnd(14)}  ${r.status.padEnd(16)}  ${cost.padEnd(5)}  ${r.dispatched_at.slice(0, 19)}  ${pr}`,
    );
  }

  const total = rows.reduce((s, r) => s + (r.cost_usd_estimate ?? 0), 0);
  console.log(`\nTotal cost across ${rows.length} rows: $${total.toFixed(2)}`);
}

export interface DispatchQueryOptions {
  dbPath?: string;
  status?: string;
  taskId?: string;
  disposition?: string;
  since?: string;
  until?: string;
  hasPr?: boolean;
  limit?: number;
}

export function runDispatchQuery(options: DispatchQueryOptions = {}): void {
  const db = openDb(options.dbPath ? { path: options.dbPath } : {});
  const filters: QueryDispatchesFilters = {};
  if (options.status) {
    // Allow comma-separated list, e.g. --status=failed,needs-human
    const list = options.status.split(",").map((s) => s.trim()).filter(Boolean) as Array<TaskResult["status"]>;
    filters.status = list.length === 1 ? list[0] : list;
  }
  if (options.taskId) filters.taskId = options.taskId;
  if (options.disposition) filters.disposition = options.disposition;
  if (options.since) filters.since = options.since;
  if (options.until) filters.until = options.until;
  if (options.hasPr !== undefined) filters.hasPr = options.hasPr;
  if (options.limit !== undefined) filters.limit = options.limit;

  const rows = queryDispatches(db, filters);
  if (rows.length === 0) {
    console.log("(no rows match the filters)");
    return;
  }
  printDispatchTable(rows);
}

function printDispatchTable(rows: DispatchLogRow[]): void {
  console.log("id   task_id              disposition     status            cost   dispatched_at        pr");
  console.log("---  -------------------  --------------  ----------------  -----  -------------------  --");
  for (const r of rows) {
    const cost = r.cost_usd_estimate != null ? `$${r.cost_usd_estimate.toFixed(2)}` : "—";
    const pr = r.pr_url ? r.pr_url.replace("https://github.com/", "") : "";
    console.log(
      `${String(r.id).padEnd(3)}  ${r.task_id.padEnd(19)}  ${r.disposition.padEnd(14)}  ${r.status.padEnd(16)}  ${cost.padEnd(5)}  ${r.dispatched_at.slice(0, 19)}  ${pr}`,
    );
  }
  const total = rows.reduce((s, r) => s + (r.cost_usd_estimate ?? 0), 0);
  console.log(`\nTotal cost across ${rows.length} rows: $${total.toFixed(2)}`);
}

export interface DispatchSummaryCommandOptions {
  dbPath?: string;
  bucket?: "day" | "hour" | "month";
  status?: string;
  taskId?: string;
  disposition?: string;
  since?: string;
  until?: string;
}

export function runDispatchSummary(options: DispatchSummaryCommandOptions = {}): void {
  const db = openDb(options.dbPath ? { path: options.dbPath } : {});
  const summarizeOpts: SummarizeDispatchesOptions = { bucket: options.bucket ?? "day" };
  if (options.status) {
    const list = options.status.split(",").map((s) => s.trim()).filter(Boolean) as Array<TaskResult["status"]>;
    summarizeOpts.status = list.length === 1 ? list[0] : list;
  }
  if (options.taskId) summarizeOpts.taskId = options.taskId;
  if (options.disposition) summarizeOpts.disposition = options.disposition;
  if (options.since) summarizeOpts.since = options.since;
  if (options.until) summarizeOpts.until = options.until;

  const buckets = summarizeDispatches(db, summarizeOpts);
  if (buckets.length === 0) {
    console.log("(no dispatches in window)");
    return;
  }

  console.log("bucket           total  ok  fail  human  inflight  cost     rate");
  console.log("---------------  -----  --  ----  -----  --------  -------  ------");
  let totals = { total: 0, succeeded: 0, failed: 0, needsHuman: 0, inFlight: 0, totalCostUsd: 0 };
  for (const b of buckets) {
    const cost = `$${b.totalCostUsd.toFixed(2)}`;
    const rate = b.successRate != null ? `${(b.successRate * 100).toFixed(0)}%` : "—";
    console.log(
      `${b.bucket.padEnd(15)}  ${String(b.total).padEnd(5)}  ${String(b.succeeded).padEnd(2)}  ${String(b.failed).padEnd(4)}  ${String(b.needsHuman).padEnd(5)}  ${String(b.inFlight).padEnd(8)}  ${cost.padEnd(7)}  ${rate}`,
    );
    totals.total += b.total;
    totals.succeeded += b.succeeded;
    totals.failed += b.failed;
    totals.needsHuman += b.needsHuman;
    totals.inFlight += b.inFlight;
    totals.totalCostUsd += b.totalCostUsd;
  }
  const overallTerminal = totals.succeeded + totals.failed;
  const overallRate = overallTerminal > 0 ? (totals.succeeded / overallTerminal * 100).toFixed(0) + "%" : "—";
  console.log(
    `\nTOTAL across ${buckets.length} bucket(s): ${totals.total} dispatches, $${totals.totalCostUsd.toFixed(2)}, success rate ${overallRate}`,
  );
}

export interface DispatchPruneCommandOptions {
  dbPath?: string;
  before?: string;
  olderThanDays?: number;
  status?: string;
  dryRun?: boolean;
}

export function runDispatchPrune(options: DispatchPruneCommandOptions = {}): void {
  if (options.before === undefined && options.olderThanDays === undefined) {
    console.error("dispatch prune requires --before <iso> or --older-than-days <n>");
    process.exitCode = 2;
    return;
  }
  const db = openDb(options.dbPath ? { path: options.dbPath } : {});
  const pruneOpts: PruneDispatchesOptions = {};
  if (options.before !== undefined) pruneOpts.before = options.before;
  if (options.olderThanDays !== undefined) pruneOpts.olderThanDays = options.olderThanDays;
  if (options.dryRun) pruneOpts.dryRun = true;
  if (options.status) {
    const list = options.status.split(",").map((s) => s.trim()).filter(Boolean) as Array<TaskResult["status"]>;
    pruneOpts.status = list.length === 1 ? list[0] : list;
  }

  const result = pruneDispatches(db, pruneOpts);
  if (options.dryRun) {
    console.log(`[dry-run] would delete ${result.matched} row(s) older than ${result.cutoff}`);
  } else {
    console.log(`deleted ${result.deleted} row(s) older than ${result.cutoff}`);
  }
}

export interface DispatchExportCommandOptions {
  dbPath?: string;
  out?: string;
  status?: string;
  taskId?: string;
  disposition?: string;
  since?: string;
  until?: string;
}

export function runDispatchExport(options: DispatchExportCommandOptions = {}): void {
  const db = openDb(options.dbPath ? { path: options.dbPath } : { readonly: true });
  const filters: QueryDispatchesFilters = {};
  if (options.status) {
    const list = options.status.split(",").map((s) => s.trim()).filter(Boolean) as Array<TaskResult["status"]>;
    filters.status = list.length === 1 ? list[0] : list;
  }
  if (options.taskId) filters.taskId = options.taskId;
  if (options.disposition) filters.disposition = options.disposition;
  if (options.since) filters.since = options.since;
  if (options.until) filters.until = options.until;

  const file = exportDispatches(db, filters);
  const json = JSON.stringify(file, null, 2);
  if (options.out) {
    writeFileSync(options.out, json);
    console.log(`exported ${file.rows.length} row(s) → ${options.out}`);
  } else {
    process.stdout.write(json + "\n");
  }
}

export interface DispatchImportCommandOptions {
  dbPath?: string;
  in: string;
  onConflict?: "skip" | "replace" | "error";
  dryRun?: boolean;
}

export function runDispatchImport(options: DispatchImportCommandOptions): void {
  let raw: string;
  try {
    raw = readFileSync(options.in, "utf8");
  } catch (err) {
    console.error(`Cannot read ${options.in}: ${(err as Error).message}`);
    process.exitCode = 2;
    return;
  }
  let parsed: DispatchExportFile;
  try {
    parsed = JSON.parse(raw) as DispatchExportFile;
  } catch (err) {
    console.error(`Invalid JSON in ${options.in}: ${(err as Error).message}`);
    process.exitCode = 2;
    return;
  }

  const db = openDb(options.dbPath ? { path: options.dbPath } : {});
  const importOpts: ImportDispatchesOptions = {};
  if (options.onConflict) importOpts.onConflict = options.onConflict;
  if (options.dryRun) importOpts.dryRun = true;

  let result;
  try {
    result = importDispatches(db, parsed, importOpts);
  } catch (err) {
    console.error(`Import failed: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }
  const verb = options.dryRun ? "would " : "";
  console.log(
    `${verb}insert ${result.inserted}; ${verb}skip ${result.skipped}; ${verb}replace ${result.replaced}`,
  );
}

function printResult(out: OrchestrateResult): void {
  const r = out.result;
  console.log(
    `[${out.task.id}] ${out.classification.disposition} (${out.classification.confidence.toFixed(2)}) → ${r.status}` +
      (r.costUsdEstimate != null ? ` ($${r.costUsdEstimate.toFixed(2)})` : "") +
      (r.error ? `\n  error: ${r.error}` : "") +
      (r.prUrl ? `\n  pr: ${r.prUrl}` : ""),
  );
}
