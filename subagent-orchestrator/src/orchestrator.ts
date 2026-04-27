// orchestrator.ts — main loop. Reads tasks, classifies, dispatches,
// records telemetry. Pure function from inputs (Task, dependencies)
// to outputs (TaskResult). All side effects injectable.
//
// M9 piece. Builds on M1 (tasks parser), M2 (classify), M3 (dispatch
// local), M5 (claude-mention), M6 (ultraplan + autofix), M7 (db).

import { classify, type ClassifyResult } from "./classify.js";
import { dispatchAutofix } from "./dispatch/autofix.js";
import { dispatchClaudeMention, parseTargetFromPrompt } from "./dispatch/claude-mention.js";
import { dispatchLocal } from "./dispatch/local.js";
import { dispatchUltraplan } from "./dispatch/ultraplan.js";
import { ship } from "./ship.js";
import { topoSortTasks, TopoSortError } from "./topo.js";
import {
  openDb,
  recordDispatch,
  updateDispatch,
  type DispatchLogRow,
} from "./store/db.js";
import type { Disposition, Task, TaskResult } from "./types.js";
import type Database from "better-sqlite3";

export interface OrchestratorOptions {
  /** Inject for testing — defaults to real openDb */
  db?: Database.Database;
  /** Override dispatch implementations (for testing or runtime swap) */
  dispatchOverrides?: Partial<{
    local: typeof dispatchLocal;
    "claude-mention": typeof dispatchClaudeMention;
    ultraplan: typeof dispatchUltraplan;
    autofix: typeof dispatchAutofix;
    web: typeof ship;
  }>;
  /** Default repo for non-local dispositions when task.repo is empty */
  defaultRepo?: string;
  /** orchestrateAll: topo-sort by dependsOn (default true). False = declaration order. */
  respectDeps?: boolean;
}

export interface OrchestrateResult {
  task: Task;
  classification: ClassifyResult;
  result: TaskResult;
  dispatchLogId: number | null;
}

/**
 * Run one task through the full orchestrator pipeline.
 *
 * Pure orchestration logic — pulls in db + dispatchers, runs them,
 * persists the outcome. Returns a structured record of what happened.
 */
export async function orchestrateOne(
  task: Task,
  options: OrchestratorOptions = {},
): Promise<OrchestrateResult> {
  const db = options.db ?? openDb();
  const dispatchLocalFn = options.dispatchOverrides?.local ?? dispatchLocal;
  const dispatchClaudeMentionFn =
    options.dispatchOverrides?.["claude-mention"] ?? dispatchClaudeMention;
  const dispatchUltraplanFn = options.dispatchOverrides?.ultraplan ?? dispatchUltraplan;
  const dispatchAutofixFn = options.dispatchOverrides?.autofix ?? dispatchAutofix;
  const dispatchWebFn = options.dispatchOverrides?.web ?? ship;

  // 1. Classify
  const classification = classify(task);
  const disposition: Exclude<Disposition, "auto"> = classification.disposition;

  // 2. Record start
  const dispatchLogId = recordDispatch(db, {
    taskId: task.id,
    disposition,
  });

  // 3. Dispatch
  let result: TaskResult;
  try {
    if (disposition === "local") {
      result = await dispatchLocalFn(task);
    } else if (disposition === "claude-mention") {
      const repo = task.repo || options.defaultRepo;
      if (!repo) {
        result = {
          taskId: task.id,
          status: "failed",
          ultrareviewUsed: false,
          error: "claude-mention requires task.repo or defaultRepo",
        };
      } else {
        const target = parseTargetFromPrompt(task.prompt);
        if (!target) {
          result = {
            taskId: task.id,
            status: "failed",
            ultrareviewUsed: false,
            error: "claude-mention requires explicit target — include 'PR #N' or 'issue #N' in prompt",
          };
        } else {
          result = await dispatchClaudeMentionFn(task, { target, repo });
        }
      }
    } else if (disposition === "ultraplan") {
      result = await dispatchUltraplanFn(task);
    } else if (disposition === "autofix") {
      const target = parseTargetFromPrompt(task.prompt);
      if (!target || target.kind !== "pr") {
        result = {
          taskId: task.id,
          status: "failed",
          ultrareviewUsed: false,
          error: "autofix requires a PR target — include 'PR #N' in prompt",
        };
      } else {
        result = await dispatchAutofixFn(task, { prNumber: target.prNumber });
      }
    } else if (disposition === "web") {
      // 'web' = full execute-and-PR via ship.ts (uses local SDK as the
      // execution engine; equivalent to a Claude Code on the web kickoff
      // for users without the chrome MCP wired up).
      result = await dispatchWebFn(task, {
        ...(options.defaultRepo ? { repo: task.repo || options.defaultRepo } : {}),
      });
    } else {
      result = {
        taskId: task.id,
        status: "failed",
        ultrareviewUsed: false,
        error: `Unknown disposition '${disposition}'`,
      };
    }
  } catch (err) {
    result = {
      taskId: task.id,
      status: "failed",
      ultrareviewUsed: false,
      error: `Orchestrator caught: ${(err as Error).message}`,
    };
  }

  // 4. Update telemetry with the outcome
  updateDispatch(db, dispatchLogId, {
    status: result.status,
    prUrl: result.prUrl ?? null,
    prNumber: result.prNumber ?? null,
    prMergedAt: result.prMergedAt ?? null,
    reviewFindingCount: result.reviewFindingCount ?? null,
    ultrareviewUsed: result.ultrareviewUsed,
    costUsdEstimate: result.costUsdEstimate ?? null,
  });

  return {
    task,
    classification,
    result,
    dispatchLogId,
  };
}

/**
 * Sequentially run a list of tasks. v0.1 has no concurrency (M8).
 *
 * Order: topo-sorted by dependsOn (stable Kahn). Pass
 * options.respectDeps=false to run in declaration order instead.
 *
 * If a topo cycle is detected, runs tasks in declaration order and
 * marks each subsequent failure with a topo-error annotation rather
 * than refusing to run anything (graceful degradation).
 */
export async function orchestrateAll(
  tasks: Task[],
  options: OrchestratorOptions = {},
): Promise<OrchestrateResult[]> {
  let ordered = tasks;
  if (options.respectDeps !== false) {
    try {
      ordered = topoSortTasks(tasks);
    } catch (err) {
      if (err instanceof TopoSortError) {
        // Fall back to declaration order; cycle is the operator's problem to fix.
        // (validateTasks would have caught and reported it before this point.)
        ordered = tasks;
      } else {
        throw err;
      }
    }
  }
  const results: OrchestrateResult[] = [];
  for (const task of ordered) {
    results.push(await orchestrateOne(task, options));
  }
  return results;
}

/** Read recent dispatch_log rows. Convenience for the CLI stats subcommand. */
export function getRecentDispatches(
  db: Database.Database,
  limit = 50,
): DispatchLogRow[] {
  return db
    .prepare(`SELECT * FROM dispatch_log ORDER BY dispatched_at DESC LIMIT ?`)
    .all(limit) as DispatchLogRow[];
}
