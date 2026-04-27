// `subagent-orchestrator tasks add` — append a TOML stanza to tasks.toml.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { appendTaskToToml, AddTaskError, renderTaskToml, type NewTaskInput } from "../tasks-add.js";

export interface TasksAddOptions {
  tasksTomlPath?: string;
  /** Print the rendered stanza to stdout but don't write. */
  dryRun?: boolean;
  input: NewTaskInput;
}

const DEFAULT_PATH = "tasks.toml";

export function runTasksAdd(options: TasksAddOptions): void {
  const path = resolve(options.tasksTomlPath ?? DEFAULT_PATH);

  if (options.dryRun) {
    try {
      const stanza = renderTaskToml(options.input);
      process.stdout.write(stanza);
    } catch (err) {
      console.error((err as Error).message);
      process.exitCode = 2;
    }
    return;
  }

  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  let updated: string;
  try {
    updated = appendTaskToToml(existing, options.input);
  } catch (err) {
    if (err instanceof AddTaskError) {
      console.error(`tasks add failed: ${err.message}`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }
  writeFileSync(path, updated);
  console.log(`appended task '${options.input.id}' → ${path}`);
}
