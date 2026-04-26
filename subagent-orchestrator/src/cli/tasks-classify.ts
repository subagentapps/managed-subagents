// `subagent-orchestrator tasks classify` subcommand.
//
// Reads tasks.toml, runs classify() on every task, prints disposition +
// confidence + signals per task. Useful for tuning heuristics and for
// "what would the orchestrator do with this TOML?" inspection.
// M2 deliverable.

import { classify } from "../classify.js";
import { loadTasks } from "../store/tasks.js";

export interface TasksClassifyOptions {
  tasksTomlPath?: string;
}

export function runTasksClassify(options: TasksClassifyOptions = {}): void {
  const tasks = loadTasks(options.tasksTomlPath);

  if (tasks.length === 0) {
    console.log("(no tasks defined in tasks.toml)");
    return;
  }

  const idW = Math.max(...tasks.map((t) => t.id.length), 2);
  const dispW = Math.max("disposition".length, 14);

  console.log(
    `${"id".padEnd(idW)}  ${"disposition".padEnd(dispW)}  conf  signals`,
  );
  console.log(
    `${"-".repeat(idW)}  ${"-".repeat(dispW)}  ----  -------`,
  );
  for (const task of tasks) {
    const result = classify(task);
    const conf = result.confidence.toFixed(2);
    const signals = result.signals.join(",");
    console.log(
      `${task.id.padEnd(idW)}  ${result.disposition.padEnd(dispW)}  ${conf}  ${signals}`,
    );
  }
}
