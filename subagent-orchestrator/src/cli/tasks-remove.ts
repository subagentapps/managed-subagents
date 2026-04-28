// `subagent-orchestrator tasks remove <id>` — excise a task stanza.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { removeTaskFromToml, RemoveTaskError } from "../tasks-remove.js";

export interface TasksRemoveOptions {
  tasksTomlPath?: string;
  id: string;
  /** Print what would be removed without writing. */
  dryRun?: boolean;
}

const DEFAULT_PATH = "tasks.toml";

export function runTasksRemove(options: TasksRemoveOptions): void {
  const path = resolve(options.tasksTomlPath ?? DEFAULT_PATH);
  if (!existsSync(path)) {
    console.error(`tasks.toml not found at ${path}`);
    process.exitCode = 2;
    return;
  }

  const existing = readFileSync(path, "utf8");
  let result;
  try {
    result = removeTaskFromToml(existing, options.id);
  } catch (err) {
    if (err instanceof RemoveTaskError) {
      console.error(`tasks remove failed: ${err.message}`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  if (options.dryRun) {
    console.log(`[dry-run] would remove:\n${result.removed.trimEnd()}`);
    return;
  }

  writeFileSync(path, result.content);
  console.log(`removed task '${options.id}' from ${path}`);
}
