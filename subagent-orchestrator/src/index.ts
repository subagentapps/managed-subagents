#!/usr/bin/env node
// subagent-orchestrator entrypoint.
//
// Subcommands wired:
//   tasks list           — M1: list tasks.toml entries
//   tasks classify       — M2: classify every task and print disposition
//   dispatch task <id>   — M9: orchestrate one task end-to-end
//   dispatch all         — M9: orchestrate every task in tasks.toml
//   dispatch stats       — M7: read recent dispatch_log rows
// See ../PROJECT_PLAN.md milestones.

import { Command } from "commander";

import { runDispatchAll, runDispatchStats, runDispatchTask } from "./cli/dispatch.js";
import { runTasksClassify } from "./cli/tasks-classify.js";
import { runTasksList } from "./cli/tasks-list.js";

const program = new Command();

program
  .name("subagent-orchestrator")
  .description("Dispatch tasks to web/CLI sessions, watch PRs, gate merges")
  .version("0.0.0");

const tasks = program.command("tasks").description("Inspect tasks.toml");

tasks
  .command("list")
  .description("List all tasks defined in tasks.toml")
  .option("-f, --file <path>", "Path to tasks.toml (default: ../tasks.toml)")
  .action((opts: { file?: string }) => {
    runTasksList({ tasksTomlPath: opts.file });
  });

tasks
  .command("classify")
  .description("Run classify() on every task and print disposition + confidence")
  .option("-f, --file <path>", "Path to tasks.toml (default: ../tasks.toml)")
  .action((opts: { file?: string }) => {
    runTasksClassify({ tasksTomlPath: opts.file });
  });

const dispatch = program.command("dispatch").description("Orchestrate task dispatches");

dispatch
  .command("task <id>")
  .description("Dispatch a single task by id")
  .option("-f, --file <path>", "Path to tasks.toml")
  .option("--db <path>", "Override dispatch_log database path")
  .action(async (id: string, opts: { file?: string; db?: string }) => {
    await runDispatchTask(id, { tasksTomlPath: opts.file, dbPath: opts.db });
  });

dispatch
  .command("all")
  .description("Dispatch every task in tasks.toml sequentially")
  .option("-f, --file <path>", "Path to tasks.toml")
  .option("--db <path>", "Override dispatch_log database path")
  .action(async (opts: { file?: string; db?: string }) => {
    await runDispatchAll({ tasksTomlPath: opts.file, dbPath: opts.db });
  });

dispatch
  .command("stats")
  .description("Show recent dispatch_log rows from the orchestrator DB")
  .option("--db <path>", "Override dispatch_log database path")
  .option("-n, --limit <n>", "Number of rows", (v) => Number(v), 20)
  .action((opts: { db?: string; limit?: number }) => {
    runDispatchStats({ dbPath: opts.db, limit: opts.limit });
  });

program.parse(process.argv);
