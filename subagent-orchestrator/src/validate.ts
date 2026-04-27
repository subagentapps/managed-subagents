// validate.ts — semantic validation across a tasks.toml file.
//
// loadTasks() (store/tasks.ts) already throws on syntax/required-field
// errors. This module catches things that load can't:
//   - duplicate task ids
//   - dependsOn pointing to nonexistent ids
//   - dependsOn cycles
//   - per-task soft warnings (autofix without PR target, malformed repo, …)

import { parseTargetFromPrompt } from "./dispatch/claude-mention.js";
import type { Task } from "./types.js";

export type ValidationSeverity = "error" | "warn" | "info";

export interface ValidationFinding {
  severity: ValidationSeverity;
  taskId?: string;
  message: string;
}

export interface ValidationReport {
  findings: ValidationFinding[];
  errors: number;
  warnings: number;
  infos: number;
}

const REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export function validateTasks(tasks: Task[]): ValidationReport {
  const findings: ValidationFinding[] = [];
  const ids = new Set<string>();

  // 1. Duplicate ids (errors)
  const idCounts = new Map<string, number>();
  for (const t of tasks) {
    idCounts.set(t.id, (idCounts.get(t.id) ?? 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      findings.push({ severity: "error", taskId: id, message: `duplicate id (appears ${count} times)` });
    }
    ids.add(id);
  }

  // 2. Per-task checks
  for (const t of tasks) {
    // Repo format
    if (t.repo && !REPO_RE.test(t.repo)) {
      findings.push({
        severity: "warn", taskId: t.id,
        message: `repo '${t.repo}' doesn't look like 'owner/name'`,
      });
    }

    // dependsOn — invalid references
    for (const dep of t.dependsOn) {
      if (dep === t.id) {
        findings.push({ severity: "error", taskId: t.id, message: `dependsOn references self` });
      } else if (!ids.has(dep)) {
        findings.push({
          severity: "error", taskId: t.id,
          message: `dependsOn references unknown task '${dep}'`,
        });
      }
    }

    // Disposition-specific soft checks
    if (t.disposition === "autofix") {
      const target = parseTargetFromPrompt(t.prompt);
      if (!target || target.kind !== "pr") {
        findings.push({
          severity: "warn", taskId: t.id,
          message: `autofix prompt missing 'PR #N' target — will fail at dispatch`,
        });
      }
    }
    if (t.disposition === "claude-mention") {
      const target = parseTargetFromPrompt(t.prompt);
      if (!target) {
        findings.push({
          severity: "warn", taskId: t.id,
          message: `claude-mention prompt missing 'PR #N' or 'issue #N' — will fail at dispatch`,
        });
      }
    }
    if (t.deepReview && t.disposition === "local") {
      findings.push({
        severity: "info", taskId: t.id,
        message: `deepReview is meaningless for disposition='local' (no PR to ultrareview)`,
      });
    }
    if (t.automerge) {
      findings.push({
        severity: "warn", taskId: t.id,
        message: `automerge=true is currently ignored by orchestrator (M8 hard rails block auto-merge to main)`,
      });
    }
  }

  // 3. dependsOn cycle detection (DFS w/ 3-color marking)
  const cycle = findCycle(tasks);
  if (cycle) {
    findings.push({
      severity: "error",
      message: `dependsOn cycle detected: ${cycle.join(" → ")}`,
    });
  }

  return {
    findings,
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warn").length,
    infos: findings.filter((f) => f.severity === "info").length,
  };
}

/**
 * Detect a cycle via DFS with white/gray/black marking. Returns the
 * cycle path as an array of task ids, or null if no cycle.
 */
function findCycle(tasks: Task[]): string[] | null {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const color = new Map<string, "white" | "gray" | "black">();
  for (const t of tasks) color.set(t.id, "white");

  const stack: string[] = [];

  function dfs(id: string): string[] | null {
    color.set(id, "gray");
    stack.push(id);
    const task = byId.get(id);
    if (task) {
      for (const dep of task.dependsOn) {
        const c = color.get(dep);
        if (c === "gray") {
          // Cycle: trim stack to the start of the loop
          const start = stack.indexOf(dep);
          return [...stack.slice(start), dep];
        }
        if (c === "white") {
          const found = dfs(dep);
          if (found) return found;
        }
        // black or unknown-id: skip (unknown ids handled separately)
      }
    }
    color.set(id, "black");
    stack.pop();
    return null;
  }

  for (const t of tasks) {
    if (color.get(t.id) === "white") {
      const found = dfs(t.id);
      if (found) return found;
    }
  }
  return null;
}
