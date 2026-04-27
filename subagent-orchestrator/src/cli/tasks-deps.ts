// `subagent-orchestrator tasks deps` — render the dependsOn graph.

import { renderDepsDot, renderDepsTree } from "../deps-graph.js";
import { loadTasks } from "../store/tasks.js";

export interface TasksDepsOptions {
  tasksTomlPath?: string;
  format?: "tree" | "dot";
}

export function runTasksDeps(options: TasksDepsOptions = {}): void {
  let tasks;
  try {
    tasks = loadTasks(options.tasksTomlPath);
  } catch (err) {
    console.error(`Failed to load tasks.toml: ${(err as Error).message}`);
    process.exitCode = 2;
    return;
  }
  if (tasks.length === 0) {
    console.log("(no tasks defined)");
    return;
  }
  const fmt = options.format ?? "tree";
  const out = fmt === "dot" ? renderDepsDot(tasks) : renderDepsTree(tasks);
  process.stdout.write(out);
}
