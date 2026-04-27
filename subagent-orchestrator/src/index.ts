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
import { runReview } from "./cli/review.js";
import { runShip } from "./cli/ship.js";
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

program
  .command("ship <task-id>")
  .description("End-to-end: dispatch task → commit on fresh branch → push → open draft PR")
  .option("-f, --file <path>", "Path to tasks.toml")
  .option("--db <path>", "Override dispatch_log database path")
  .option("--base <branch>", "Base branch (default 'main')")
  .option("--branch <name>", "Override branch name")
  .option("--repo <owner/name>", "GitHub repo (default: cwd's repo)")
  .option("--no-remote", "Don't push or open PR — local commit only (testing)")
  .action(async (id: string, opts: {
    file?: string; db?: string; base?: string; branch?: string;
    repo?: string;
    /** commander negation: --no-remote sets remote=false; default true */
    remote?: boolean;
  }) => {
    await runShip(id, {
      tasksTomlPath: opts.file,
      dbPath: opts.db,
      baseBranch: opts.base,
      branchName: opts.branch,
      repo: opts.repo,
      noRemote: opts.remote === false,
    });
  });

program
  .command("review <pr-number>")
  .description("Review a PR via the orchestrator-reviewer subagent; post comment + verdict")
  .option("--repo <owner/name>", "GitHub repo (default: cwd's repo)")
  .option("--no-comment", "Don't post a PR comment — just return the verdict")
  .option("--mark-ready-on-approve", "If verdict=APPROVE and PR is draft, mark it ready")
  .action(async (prArg: string, opts: {
    repo?: string;
    /** commander negation */
    comment?: boolean;
    markReadyOnApprove?: boolean;
  }) => {
    const prNumber = parseInt(prArg, 10);
    if (Number.isNaN(prNumber)) {
      console.error(`Invalid PR number: ${prArg}`);
      process.exitCode = 2;
      return;
    }
    await runReview(prNumber, {
      repo: opts.repo,
      noComment: opts.comment === false,
      markReadyOnApprove: opts.markReadyOnApprove,
    });
  });

program.parse(process.argv);
