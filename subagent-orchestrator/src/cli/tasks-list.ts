// `subagent-orchestrator tasks list` subcommand.
//
// Reads tasks.toml, prints one row per task with its disposition + state.
// M1 deliverable.

import { loadTasks } from "../store/tasks.js";

export interface TasksListOptions {
  tasksTomlPath?: string;
}

export function runTasksList(options: TasksListOptions = {}): void {
  const tasks = loadTasks(options.tasksTomlPath);

  if (tasks.length === 0) {
    console.log("(no tasks defined in tasks.toml)");
    return;
  }

  // Compute column widths.
  const idW = Math.max(...tasks.map((t) => t.id.length), 2);
  const dispW = Math.max(...tasks.map((t) => t.disposition.length), 11);

  console.log(
    `${"id".padEnd(idW)}  ${"disposition".padEnd(dispW)}  ${"deps".padEnd(8)}  title`,
  );
  console.log(
    `${"-".repeat(idW)}  ${"-".repeat(dispW)}  ${"-".repeat(8)}  -----`,
  );
  for (const task of tasks) {
    const deps = task.dependsOn.length > 0 ? `[${task.dependsOn.length}]` : "—";
    console.log(
      `${task.id.padEnd(idW)}  ${task.disposition.padEnd(dispW)}  ${deps.padEnd(8)}  ${task.title}`,
    );
  }
}
