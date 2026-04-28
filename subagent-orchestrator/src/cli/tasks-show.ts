// `subagent-orchestrator tasks show <id>` — detailed view of a single task.
//
// Shows: full TOML fields, classification result + reason, validate
// findings scoped to this task, and the most recent dispatch_log rows.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { classify } from "../classify.js";
import { loadTasks } from "../store/tasks.js";
import { openDb, queryDispatches } from "../store/db.js";
import { validateTasks } from "../validate.js";

export interface TasksShowOptions {
  tasksTomlPath?: string;
  id: string;
  /** Override dispatch_log DB path. Skips the dispatch section if file doesn't exist. */
  dbPath?: string;
  /** Max recent dispatches to show. Default 5. */
  recentLimit?: number;
}

const SEVERITY_ICON: Record<string, string> = { error: "❌", warn: "⚠ ", info: "ℹ " };

export function runTasksShow(options: TasksShowOptions): void {
  const tasks = loadTasks(options.tasksTomlPath);
  const task = tasks.find((t) => t.id === options.id);
  if (!task) {
    console.error(`No task with id='${options.id}' in ${options.tasksTomlPath ?? "tasks.toml"}`);
    process.exitCode = 2;
    return;
  }

  // 1. Identity
  console.log(`# ${task.id}`);
  console.log(`title:       ${task.title}`);
  console.log(`disposition: ${task.disposition}${task.disposition === "auto" ? " (will be classified at dispatch)" : ""}`);
  if (task.repo) console.log(`repo:        ${task.repo}`);
  console.log(`branch:      ${task.branch}`);
  if (task.label) console.log(`label:       ${task.label}`);
  console.log(`automerge:   ${task.automerge}`);
  console.log(`deepReview:  ${task.deepReview}`);
  if (task.dependsOn.length > 0) console.log(`dependsOn:   ${task.dependsOn.join(", ")}`);

  // 2. Prompt (full body, indented)
  console.log("\n## prompt");
  for (const line of task.prompt.split("\n")) console.log("  " + line);

  // 3. Classification
  const cls = classify(task);
  console.log("\n## classification");
  console.log(`  → ${cls.disposition} (confidence ${cls.confidence.toFixed(2)})`);
  console.log(`  signals: ${cls.signals.join(", ")}`);
  if (cls.reason) console.log(`  reason: ${cls.reason}`);

  // 4. Validation findings scoped to this task
  const report = validateTasks(tasks);
  const ours = report.findings.filter((f) => f.taskId === task.id);
  if (ours.length > 0) {
    console.log("\n## validation");
    for (const f of ours) {
      console.log(`  ${SEVERITY_ICON[f.severity] ?? "?"} ${f.message}`);
    }
  }

  // 5. Recent dispatches for this task
  const dbPath = options.dbPath ?? join(homedir(), ".claude", "orchestrator.db");
  if (existsSync(dbPath) || options.dbPath === ":memory:") {
    try {
      const db = openDb({ path: dbPath, readonly: true });
      const rows = queryDispatches(db, { taskId: task.id, limit: options.recentLimit ?? 5 });
      if (rows.length > 0) {
        console.log(`\n## recent dispatches (last ${rows.length})`);
        for (const r of rows) {
          const cost = r.cost_usd_estimate != null ? ` $${r.cost_usd_estimate.toFixed(2)}` : "";
          const pr = r.pr_url ? ` ${r.pr_url.replace("https://github.com/", "")}` : "";
          console.log(`  ${r.dispatched_at.slice(0, 19)}  ${r.status.padEnd(16)}${cost}${pr}`);
        }
      }
    } catch {
      // DB unreadable; quietly skip — the rest of the view is still useful
    }
  }
}
