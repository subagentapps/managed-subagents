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
import { runDispatchAll, runDispatchExport, runDispatchImport, runDispatchPrune, runDispatchQuery, runDispatchStats, runDispatchSummary, runDispatchTask } from "./cli/dispatch.js";
import { runDoctor } from "./cli/doctor.js";
import { runMerge } from "./cli/merge.js";
import { runReview } from "./cli/review.js";
import { runShip } from "./cli/ship.js";
import { runTasksAdd } from "./cli/tasks-add.js";
import { runTasksClassify } from "./cli/tasks-classify.js";
import { runTasksDeps } from "./cli/tasks-deps.js";
import { runTasksList } from "./cli/tasks-list.js";
import { runTasksValidate } from "./cli/tasks-validate.js";
import type { Disposition } from "./types.js";
import { DISPOSITIONS } from "./types.js";

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
  .command("add <id>")
  .description("Append a new task stanza to tasks.toml")
  .option("-f, --file <path>", "Path to tasks.toml (default: ./tasks.toml)")
  .option("--title <text>", "Task title (required)")
  .option("--prompt <text>", "Task prompt body (required)")
  .option("--disposition <name>", `One of ${DISPOSITIONS.join("|")}`)
  .option("--repo <owner/name>", "GitHub repo (required for non-local dispositions)")
  .option("--branch <name>", "Base branch (default 'main')")
  .option("--label <name>", "GitHub label to apply")
  .option("--automerge", "Set automerge=true")
  .option("--deep-review", "Set deep_review=true")
  .option("--depends-on <ids>", "Comma-separated list of task ids")
  .option("--dry-run", "Print the rendered stanza but don't write")
  .action((id: string, opts: {
    file?: string; title?: string; prompt?: string;
    disposition?: string; repo?: string; branch?: string; label?: string;
    automerge?: boolean; deepReview?: boolean; dependsOn?: string;
    dryRun?: boolean;
  }) => {
    if (!opts.title || !opts.prompt) {
      console.error("tasks add requires --title and --prompt");
      process.exitCode = 2;
      return;
    }
    const disp = opts.disposition;
    if (disp && !DISPOSITIONS.includes(disp as Disposition)) {
      console.error(`Invalid --disposition: ${disp} (expected ${DISPOSITIONS.join("|")})`);
      process.exitCode = 2;
      return;
    }
    const input = {
      id,
      title: opts.title,
      prompt: opts.prompt,
      ...(disp ? { disposition: disp as Disposition } : {}),
      ...(opts.repo ? { repo: opts.repo } : {}),
      ...(opts.branch ? { branch: opts.branch } : {}),
      ...(opts.label ? { label: opts.label } : {}),
      ...(opts.automerge ? { automerge: true } : {}),
      ...(opts.deepReview ? { deepReview: true } : {}),
      ...(opts.dependsOn
        ? { dependsOn: opts.dependsOn.split(",").map((s) => s.trim()).filter(Boolean) }
        : {}),
    };
    runTasksAdd({ tasksTomlPath: opts.file, dryRun: opts.dryRun, input });
  });

tasks
  .command("deps")
  .description("Render dependsOn graph (ASCII tree or Graphviz DOT)")
  .option("-f, --file <path>", "Path to tasks.toml")
  .option("--format <fmt>", "tree | dot (default tree)", "tree")
  .action((opts: { file?: string; format?: string }) => {
    const fmt = opts.format;
    if (fmt && !["tree", "dot"].includes(fmt)) {
      console.error(`Invalid --format: ${fmt} (expected tree|dot)`);
      process.exitCode = 2;
      return;
    }
    runTasksDeps({ tasksTomlPath: opts.file, format: fmt as "tree" | "dot" | undefined });
  });

tasks
  .command("validate")
  .description("Cross-validate tasks.toml: duplicate ids, dependsOn refs/cycles, soft warnings")
  .option("-f, --file <path>", "Path to tasks.toml (default: ../tasks.toml)")
  .action((opts: { file?: string }) => {
    runTasksValidate({ tasksTomlPath: opts.file });
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
  .option("--dry-run", "Classify+validate but don't dispatch (no DB writes)")
  .action(async (id: string, opts: { file?: string; db?: string; dryRun?: boolean }) => {
    await runDispatchTask(id, {
      tasksTomlPath: opts.file,
      dbPath: opts.db,
      dryRun: opts.dryRun,
    });
  });

dispatch
  .command("all")
  .description("Dispatch every task in tasks.toml; topo-sorted by dependsOn unless --no-deps")
  .option("-f, --file <path>", "Path to tasks.toml")
  .option("--db <path>", "Override dispatch_log database path")
  .option("--no-deps", "Run in declaration order, ignoring dependsOn")
  .option("--dry-run", "Classify+validate every task but don't dispatch (no DB writes)")
  .action(async (opts: { file?: string; db?: string; deps?: boolean; dryRun?: boolean }) => {
    await runDispatchAll({
      tasksTomlPath: opts.file,
      dbPath: opts.db,
      respectDeps: opts.deps !== false,
      dryRun: opts.dryRun,
    });
  });

dispatch
  .command("stats")
  .description("Show recent dispatch_log rows from the orchestrator DB")
  .option("--db <path>", "Override dispatch_log database path")
  .option("-n, --limit <n>", "Number of rows", (v) => Number(v), 20)
  .action((opts: { db?: string; limit?: number }) => {
    runDispatchStats({ dbPath: opts.db, limit: opts.limit });
  });

dispatch
  .command("export")
  .description("Serialize dispatch_log rows to JSON (stdout or --out file)")
  .option("--db <path>", "Override dispatch_log database path")
  .option("--out <file>", "Write to file instead of stdout")
  .option("--status <list>", "Comma-separated statuses to include")
  .option("--task <id>", "Exact task_id match")
  .option("--disposition <name>", "Exact disposition match")
  .option("--since <iso>", "ISO 8601 timestamp; only rows dispatched at/after")
  .option("--until <iso>", "ISO 8601 timestamp; only rows dispatched at/before")
  .action((opts: { db?: string; out?: string; status?: string; task?: string; disposition?: string; since?: string; until?: string }) => {
    runDispatchExport({
      dbPath: opts.db,
      out: opts.out,
      status: opts.status,
      taskId: opts.task,
      disposition: opts.disposition,
      since: opts.since,
      until: opts.until,
    });
  });

dispatch
  .command("import <file>")
  .description("Load a previously-exported JSON dump back into dispatch_log")
  .option("--db <path>", "Override dispatch_log database path")
  .option("--on-conflict <mode>", "skip | replace | error (default skip)", "skip")
  .option("--dry-run", "Report counts without writing")
  .action((file: string, opts: { db?: string; onConflict?: string; dryRun?: boolean }) => {
    const mode = opts.onConflict;
    if (mode && !["skip", "replace", "error"].includes(mode)) {
      console.error(`Invalid --on-conflict: ${mode} (expected skip|replace|error)`);
      process.exitCode = 2;
      return;
    }
    runDispatchImport({
      dbPath: opts.db,
      in: file,
      onConflict: mode as "skip" | "replace" | "error" | undefined,
      dryRun: opts.dryRun,
    });
  });

dispatch
  .command("prune")
  .description("Delete old dispatch_log rows (requires --before or --older-than-days to bound)")
  .option("--db <path>", "Override dispatch_log database path")
  .option("--before <iso>", "Delete rows dispatched before this ISO 8601 timestamp")
  .option("--older-than-days <n>", "Delete rows older than N days", (v) => Number(v))
  .option("--status <list>", "Only prune rows with these statuses (comma-separated)")
  .option("--dry-run", "Count matching rows but don't delete")
  .action((opts: { db?: string; before?: string; olderThanDays?: number; status?: string; dryRun?: boolean }) => {
    runDispatchPrune({
      dbPath: opts.db,
      before: opts.before,
      olderThanDays: opts.olderThanDays,
      status: opts.status,
      dryRun: opts.dryRun,
    });
  });

dispatch
  .command("summary")
  .description("Aggregate dispatch_log rows by time bucket (day/hour/month) with totals")
  .option("--db <path>", "Override dispatch_log database path")
  .option("--bucket <granularity>", "day | hour | month (default day)", "day")
  .option("--status <list>", "Comma-separated statuses to include before bucketing")
  .option("--task <id>", "Exact task_id match")
  .option("--disposition <name>", "Exact disposition match")
  .option("--since <iso>", "ISO 8601 timestamp; only rows dispatched at/after")
  .option("--until <iso>", "ISO 8601 timestamp; only rows dispatched at/before")
  .action((opts: { db?: string; bucket?: string; status?: string; task?: string; disposition?: string; since?: string; until?: string }) => {
    const bucket = opts.bucket;
    if (bucket && !["day", "hour", "month"].includes(bucket)) {
      console.error(`Invalid --bucket: ${bucket} (expected day|hour|month)`);
      process.exitCode = 2;
      return;
    }
    runDispatchSummary({
      dbPath: opts.db,
      bucket: bucket as "day" | "hour" | "month" | undefined,
      status: opts.status,
      taskId: opts.task,
      disposition: opts.disposition,
      since: opts.since,
      until: opts.until,
    });
  });

dispatch
  .command("query")
  .description("Filter dispatch_log rows (status, task, disposition, time range, has-pr)")
  .option("--db <path>", "Override dispatch_log database path")
  .option("--status <list>", "Comma-separated statuses, e.g. failed,needs-human")
  .option("--task <id>", "Exact task_id match")
  .option("--disposition <name>", "Exact disposition match (local, ultraplan, ...)")
  .option("--since <iso>", "ISO 8601 timestamp; only rows dispatched at/after")
  .option("--until <iso>", "ISO 8601 timestamp; only rows dispatched at/before")
  .option("--has-pr", "Only rows with a PR number")
  .option("--no-pr", "Only rows WITHOUT a PR number")
  .option("-n, --limit <n>", "Max rows (default 100)", (v) => Number(v), 100)
  .action((opts: {
    db?: string; status?: string; task?: string; disposition?: string;
    since?: string; until?: string;
    /** commander negation: --no-pr sets pr=false */
    pr?: boolean; hasPr?: boolean;
    limit?: number;
  }) => {
    const hasPrFlag = opts.hasPr === true ? true : opts.pr === false ? false : undefined;
    runDispatchQuery({
      dbPath: opts.db,
      status: opts.status,
      taskId: opts.task,
      disposition: opts.disposition,
      since: opts.since,
      until: opts.until,
      ...(hasPrFlag !== undefined ? { hasPr: hasPrFlag } : {}),
      limit: opts.limit,
    });
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
  .option("--require-checks", "Skip PRs whose meaningful CI checks haven't passed (claude-review ignored)")
  .option("--db <path>", "Persist each PR sweep into dispatch_log")
  .action(async (opts: {
    repo?: string;
    author?: string;
    includeDrafts?: boolean;
    allowProtected?: boolean;
    /** commander negation */
    comment?: boolean;
    budget?: number;
    max?: number;
    requireChecks?: boolean;
    db?: string;
  }) => {
    await runBabysit({
      repo: opts.repo,
      authorFilter: opts.author,
      includeDrafts: opts.includeDrafts,
      allowProtected: opts.allowProtected,
      noComment: opts.comment === false,
      iterationBudgetUsd: opts.budget,
      maxReviews: opts.max,
      requireChecksPass: opts.requireChecks,
      dbPath: opts.db,
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
  .option("--require-checks", "Skip PRs whose meaningful CI checks haven't passed")
  .option("--db <path>", "Persist each PR sweep into dispatch_log")
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
    requireChecks?: boolean;
    db?: string;
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
      requireChecksPass: opts.requireChecks,
      dbPath: opts.db,
    });
  });

program
  .command("doctor")
  .description("Probe runtime dependencies (gh, db, SDK, subagents) and report readiness")
  .option("--db <path>", "Override DB path probed")
  .action(async (opts: { db?: string }) => {
    await runDoctor({ dbPath: opts.db });
  });

program.parse(process.argv);
