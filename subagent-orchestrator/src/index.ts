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

import { runBabysit } from "./cli/babysit.js";
import { runDaemon } from "./cli/daemon.js";
import { runDispatchAll, runDispatchStats, runDispatchTask } from "./cli/dispatch.js";
import { runMerge } from "./cli/merge.js";
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

program
  .command("merge <pr-number>")
  .description("Merge a PR via gh, honoring M8 hard rails (default-deny on protected branches)")
  .option("--repo <owner/name>", "GitHub repo (default: cwd's repo)")
  .option("--method <method>", "Merge method: merge | squash | rebase (default 'merge')", "merge")
  .option("--no-delete-branch", "Keep the head branch after merge")
  .option("--allow-protected", "Bypass the rail blocking merges to main/master/production/release")
  .action(async (prArg: string, opts: {
    repo?: string;
    method?: string;
    /** commander negation */
    deleteBranch?: boolean;
    allowProtected?: boolean;
  }) => {
    const prNumber = parseInt(prArg, 10);
    if (Number.isNaN(prNumber)) {
      console.error(`Invalid PR number: ${prArg}`);
      process.exitCode = 2;
      return;
    }
    const method = opts.method;
    if (method && !["merge", "squash", "rebase"].includes(method)) {
      console.error(`Invalid --method: ${method} (expected merge|squash|rebase)`);
      process.exitCode = 2;
      return;
    }
    await runMerge(prNumber, {
      repo: opts.repo,
      method: method as "merge" | "squash" | "rebase" | undefined,
      deleteBranch: opts.deleteBranch !== false,
      allowProtected: opts.allowProtected,
    });
  });

program
  .command("babysit")
  .description("Sweep open PRs: review each, auto-merge approvals (rails honored)")
  .option("--repo <owner/name>", "GitHub repo (default: cwd's repo)")
  .option("--author <login>", "Only review PRs whose author login contains this substring")
  .option("--include-drafts", "Include draft PRs (default: skip)")
  .option("--allow-protected", "Allow merging into main/master/etc (default: rail blocks)")
  .option("--no-comment", "Don't post review comments")
  .option("--budget <usd>", "Max total review spend per iteration", (v) => Number(v), 5)
  .option("--max <n>", "Max PRs to review per iteration", (v) => Number(v), 5)
  .action(async (opts: {
    repo?: string;
    author?: string;
    includeDrafts?: boolean;
    allowProtected?: boolean;
    /** commander negation */
    comment?: boolean;
    budget?: number;
    max?: number;
  }) => {
    await runBabysit({
      repo: opts.repo,
      authorFilter: opts.author,
      includeDrafts: opts.includeDrafts,
      allowProtected: opts.allowProtected,
      noComment: opts.comment === false,
      iterationBudgetUsd: opts.budget,
      maxReviews: opts.max,
    });
  });

program
  .command("daemon")
  .description("Long-running babysit driver — sweeps PRs every N seconds until SIGINT")
  .option("--repo <owner/name>", "GitHub repo")
  .option("--author <login>", "Filter PRs by author substring")
  .option("--include-drafts", "Include draft PRs")
  .option("--allow-protected", "Allow merging into main/master/etc")
  .option("--no-comment", "Don't post review comments")
  .option("--budget <usd>", "Per-iteration review budget", (v) => Number(v), 5)
  .option("--max <n>", "Max PRs per iteration", (v) => Number(v), 5)
  .option("--interval <seconds>", "Seconds between iterations", (v) => Number(v), 600)
  .option("--max-iterations <n>", "Stop after N iterations (0 = forever)", (v) => Number(v), 0)
  .option("--daily-budget <usd>", "Total spend cap before exit", (v) => Number(v), 50)
  .action(async (opts: {
    repo?: string;
    author?: string;
    includeDrafts?: boolean;
    allowProtected?: boolean;
    /** commander negation */
    comment?: boolean;
    budget?: number;
    max?: number;
    interval?: number;
    maxIterations?: number;
    dailyBudget?: number;
  }) => {
    await runDaemon({
      repo: opts.repo,
      authorFilter: opts.author,
      includeDrafts: opts.includeDrafts,
      allowProtected: opts.allowProtected,
      noComment: opts.comment === false,
      iterationBudgetUsd: opts.budget,
      maxReviews: opts.max,
      intervalSeconds: opts.interval,
      maxIterations: opts.maxIterations,
      dailyBudgetUsd: opts.dailyBudget,
    });
  });

program.parse(process.argv);
