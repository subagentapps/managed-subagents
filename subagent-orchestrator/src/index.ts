#!/usr/bin/env node
// subagent-orchestrator entrypoint.
//
// M1 wires `tasks` subcommands. M2+ adds dispatch/watch/review.
// See ../PROJECT_PLAN.md milestones.

import { Command } from "commander";

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

program.parse(process.argv);
