// topo.ts — topological sort of Tasks by dependsOn.
//
// orchestrateAll currently runs tasks in tasks.toml order. With dependsOn
// declared (validate.ts catches cycles + unknown refs), we should respect it.
//
// Kahn's algorithm with stable tie-breaking on the original order.
// Throws on cycles — caller should run validateTasks first if it wants
// finer error reporting.

import type { Task } from "./types.js";

export class TopoSortError extends Error {
  constructor(message: string, public readonly remaining: Task[]) {
    super(message);
    this.name = "TopoSortError";
  }
}

/**
 * Return a copy of `tasks` ordered such that for every t with dep d in
 * t.dependsOn, d appears before t in the output. Tasks with no inter-deps
 * preserve their original relative order (stable Kahn).
 *
 * Unknown deps in dependsOn are IGNORED here (validate.ts is the place
 * that surfaces them). This keeps topoSort robust under partial inputs.
 */
export function topoSortTasks(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const knownDeps = (t: Task): string[] =>
    t.dependsOn.filter((d) => d !== t.id && byId.has(d));

  // In-degree per task = count of dependencies that exist
  const inDeg = new Map<string, number>();
  // Reverse adjacency: dep → tasks that depend on it
  const dependents = new Map<string, string[]>();
  for (const t of tasks) {
    inDeg.set(t.id, knownDeps(t).length);
    for (const d of knownDeps(t)) {
      const list = dependents.get(d) ?? [];
      list.push(t.id);
      dependents.set(d, list);
    }
  }

  // Original index for stable tie-break
  const origIdx = new Map(tasks.map((t, i) => [t.id, i]));

  // Ready queue: ids with in-degree 0, kept ordered by original index
  const ready: string[] = tasks
    .filter((t) => inDeg.get(t.id) === 0)
    .map((t) => t.id);
  ready.sort((a, b) => (origIdx.get(a) ?? 0) - (origIdx.get(b) ?? 0));

  const out: Task[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    const task = byId.get(id);
    if (task) out.push(task);

    for (const dependent of dependents.get(id) ?? []) {
      const next = (inDeg.get(dependent) ?? 0) - 1;
      inDeg.set(dependent, next);
      if (next === 0) {
        // Insert preserving original-index order
        const insertAt = ready.findIndex(
          (r) => (origIdx.get(r) ?? 0) > (origIdx.get(dependent) ?? 0),
        );
        if (insertAt < 0) ready.push(dependent);
        else ready.splice(insertAt, 0, dependent);
      }
    }
  }

  if (out.length !== tasks.length) {
    const remainingIds = new Set(out.map((t) => t.id));
    const remaining = tasks.filter((t) => !remainingIds.has(t.id));
    throw new TopoSortError(
      `topoSortTasks: cycle detected; ${remaining.length} task(s) could not be ordered`,
      remaining,
    );
  }
  return out;
}
