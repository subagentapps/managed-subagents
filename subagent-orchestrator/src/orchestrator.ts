// orchestrator.ts — main loop. Reads tasks, classifies, dispatches,
// records telemetry. Pure function from inputs (Task, dependencies)
// to outputs (TaskResult). All side effects injectable.
//
// M9 piece. Builds on M1 (tasks parser), M2 (classify), M3 (dispatch
// local), M5 (claude-mention), M6 (ultraplan + autofix), M7 (db).

import { classify, type ClassifyResult } from "./classify.js";
import { dispatchClaudeMention, parseTargetFromPrompt } from "./dispatch/claude-mention.js";
import { dispatchLocal } from "./dispatch/local.js";
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
    // ultraplan + autofix + web require their own option shapes; defer
    // to the per-disposition tests until those PRs land on main
  }>;
  /** Default repo for non-local dispositions when task.repo is empty */
  defaultRepo?: string;
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
    } else {
      result = {
        taskId: task.id,
        status: "failed",
        ultrareviewUsed: false,
        error: `Disposition '${disposition}' not yet wired into the main loop (ultraplan+autofix+web are M6+; tracked separately)`,
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

/** Sequentially run a list of tasks. v0.1 has no concurrency (M8). */
export async function orchestrateAll(
  tasks: Task[],
  options: OrchestratorOptions = {},
): Promise<OrchestrateResult[]> {
  const results: OrchestrateResult[] = [];
  for (const task of tasks) {
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
