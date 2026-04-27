// `subagent-orchestrator dispatch` subcommands.
// Wires the orchestrator main loop into the CLI so users can:
//   subagent-orchestrator dispatch task <id>           — dispatch one task by id
//   subagent-orchestrator dispatch all                 — orchestrateAll over tasks.toml
//   subagent-orchestrator dispatch stats               — show recent dispatch_log rows

import { orchestrateAll, orchestrateOne } from "../orchestrator.js";
import { openDb, queryDispatches, type DispatchLogRow, type QueryDispatchesFilters } from "../store/db.js";
import { loadTasks } from "../store/tasks.js";
import type { OrchestrateResult } from "../orchestrator.js";
import type { TaskResult } from "../types.js";

export interface DispatchTaskOptions {
  tasksTomlPath?: string;
  dbPath?: string;
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
  const results = await orchestrateAll(tasks, { db });
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

function printResult(out: OrchestrateResult): void {
  const r = out.result;
  console.log(
    `[${out.task.id}] ${out.classification.disposition} (${out.classification.confidence.toFixed(2)}) → ${r.status}` +
      (r.costUsdEstimate != null ? ` ($${r.costUsdEstimate.toFixed(2)})` : "") +
      (r.error ? `\n  error: ${r.error}` : "") +
      (r.prUrl ? `\n  pr: ${r.prUrl}` : ""),
  );
}
