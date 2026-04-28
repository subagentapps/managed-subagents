// Core types for subagent-orchestrator.
//
// See ../PROJECT_PLAN.md §3 (M1) and ../tasks.toml for the on-disk shape.

export type Disposition = "auto" | "local" | "ultraplan" | "autofix" | "web" | "claude-mention";

export const DISPOSITIONS = ["auto", "local", "ultraplan", "autofix", "web", "claude-mention"] as const;

/**
 * One unit of work for the orchestrator to dispatch. Comes from tasks.toml.
 *
 * `disposition: "auto"` is the default — classify.ts (M2) picks one of the
 * other 5 based on heuristics. The other values are explicit overrides.
 */
export interface Task {
  /** Short kebab-case id, e.g. "fix-auth-bug". */
  id: string;
  /** One-line task title. */
  title: string;
  /** Self-contained prompt body sent to whichever surface handles it. */
  prompt: string;
  /** Default "auto"; classify.ts picks if "auto". */
  disposition: Disposition;
  /** "owner/repo"; required for non-local dispositions. */
  repo: string;
  /** Base branch for the work; defaults to "main". */
  branch: string;
  /** Optional GitHub label to apply. */
  label?: string;
  /** Off in v0.1; v0.3 enables. */
  automerge: boolean;
  /** If true, run /ultrareview after /review. */
  deepReview: boolean;
  /** List of task ids that must complete first. */
  dependsOn: string[];
}

/**
 * What's actually in the TOML before defaults are applied.
 * Mirrors the documented schema in tasks.toml's comment block.
 */
export interface RawTaskTomlEntry {
  id?: string;
  title?: string;
  prompt?: string;
  disposition?: string;
  repo?: string;
  branch?: string;
  label?: string;
  automerge?: boolean;
  deep_review?: boolean;
  depends_on?: string[];
}

export interface RawTasksTomlFile {
  task?: RawTaskTomlEntry[];
}

/**
 * The result of dispatching one task end-to-end.
 *
 * Used by the orchestrator's main loop (M3+) and by `subagent-orchestrator stats` (M7).
 */
export interface TaskResult {
  taskId: string;
  status: "dispatched" | "reviewing" | "ready-for-merge" | "needs-human" | "failed" | "merged" | "cancelled";
  prUrl?: string;
  prNumber?: number;
  prMergedAt?: string;
  reviewFindingCount?: number;
  ultrareviewUsed: boolean;
  costUsdEstimate?: number;
  error?: string;
}

/**
 * Output of the local /review step. M4.
 */
export interface ReviewFindings {
  ok: boolean;
  prNumber: number;
  findings: Array<{
    severity: "critical" | "high" | "medium" | "low" | "info";
    file?: string;
    line?: number;
    message: string;
  }>;
}
