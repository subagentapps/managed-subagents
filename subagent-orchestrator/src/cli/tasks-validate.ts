// `subagent-orchestrator tasks validate` — load + cross-validate tasks.toml.

import { loadTasks } from "../store/tasks.js";
import { validateTasks } from "../validate.js";

export interface TasksValidateOptions {
  tasksTomlPath?: string;
}

const ICONS: Record<string, string> = { error: "❌", warn: "⚠ ", info: "ℹ " };

export function runTasksValidate(options: TasksValidateOptions = {}): void {
  let tasks;
  try {
    tasks = loadTasks(options.tasksTomlPath);
  } catch (err) {
    console.error(`Failed to load tasks.toml: ${(err as Error).message}`);
    process.exitCode = 2;
    return;
  }

  const report = validateTasks(tasks);
  if (report.findings.length === 0) {
    console.log(`✅ ${tasks.length} task(s) — no findings`);
    return;
  }

  for (const f of report.findings) {
    const where = f.taskId ? `[${f.taskId}]` : "[file]";
    console.log(`${ICONS[f.severity] ?? "?"} ${where} ${f.message}`);
  }
  console.log(
    `\n${tasks.length} task(s); ${report.errors} error, ${report.warnings} warn, ${report.infos} info`,
  );
  if (report.errors > 0) process.exitCode = 1;
}
