// `subagent-orchestrator ship <task-id>` — end-to-end pipeline.
// Reads task from tasks.toml, dispatches the shipper subagent, opens a draft PR.

import { ship } from "../ship.js";
import { openDb, recordDispatch, updateDispatch } from "../store/db.js";
import { loadTasks } from "../store/tasks.js";

export interface ShipCommandOptions {
  tasksTomlPath?: string;
  dbPath?: string;
  baseBranch?: string;
  branchName?: string;
  repo?: string;
  noRemote?: boolean;
}

export async function runShip(taskId: string, options: ShipCommandOptions = {}): Promise<void> {
  const tasks = loadTasks(options.tasksTomlPath);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    console.error(`No task with id='${taskId}' in ${options.tasksTomlPath ?? "tasks.toml"}`);
    process.exitCode = 2;
    return;
  }

  const db = openDb(options.dbPath ? { path: options.dbPath } : {});
  const dispatchLogId = recordDispatch(db, { taskId: task.id, disposition: "local" });

  console.log(`[${task.id}] dispatching ship pipeline...`);
  const result = await ship(task, {
    baseBranch: options.baseBranch,
    branchName: options.branchName,
    repo: options.repo,
    noRemote: options.noRemote,
  });

  updateDispatch(db, dispatchLogId, {
    status: result.status,
    prUrl: result.prUrl ?? null,
    prNumber: result.prNumber ?? null,
    costUsdEstimate: result.costUsdEstimate ?? null,
    ultrareviewUsed: result.ultrareviewUsed,
  });

  const cost = result.costUsdEstimate != null ? `$${result.costUsdEstimate.toFixed(2)}` : "$?.??";
  console.log(`[${task.id}] ${result.status} (${cost})`);
  if (result.error) console.log(`  ${result.error}`);
  if (result.prUrl) console.log(`  PR: ${result.prUrl}`);

  if (result.status === "failed") process.exitCode = 1;
}
