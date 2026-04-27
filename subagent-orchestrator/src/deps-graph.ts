// deps-graph.ts — render the dependsOn graph as text or DOT.
//
// `tasks deps` uses these to give operators a visual map without
// parsing tasks.toml by eye. Two formats:
//   - 'tree': ASCII tree per root, shows the topological order
//   - 'dot':  Graphviz DOT — pipe through `dot -Tpng > graph.png`

import type { Task } from "./types.js";

/**
 * Render an ASCII tree per root (a "root" is a task that no other task
 * depends on — i.e., something that can be the final goal of a chain).
 *
 * Each root is rendered with its dependency subtree below, indented.
 * Tasks that appear in multiple subtrees are shown once per occurrence;
 * a `(↑)` marker indicates a dep already shown elsewhere to keep output finite.
 */
export function renderDepsTree(tasks: Task[]): string {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  // dependents: id → tasks that name it in their dependsOn
  const dependents = new Map<string, string[]>();
  for (const t of tasks) {
    for (const d of t.dependsOn) {
      const list = dependents.get(d) ?? [];
      list.push(t.id);
      dependents.set(d, list);
    }
  }
  // Roots = tasks no one else depends on
  const roots = tasks.filter((t) => !dependents.has(t.id));
  if (roots.length === 0) {
    // All tasks are in cycles or every task is depended on — fall back to listing all
    return tasks.map((t) => t.id).join("\n");
  }

  const lines: string[] = [];
  const seenInThisTree = new Set<string>();

  function render(id: string, prefix: string, isLast: boolean): void {
    const branch = isLast ? "└─ " : "├─ ";
    const seenMark = seenInThisTree.has(id) ? " (↑)" : "";
    lines.push(prefix + branch + id + seenMark);
    if (seenInThisTree.has(id)) return;
    seenInThisTree.add(id);
    const task = byId.get(id);
    if (!task) return;
    const childPrefix = prefix + (isLast ? "   " : "│  ");
    const deps = task.dependsOn.filter((d) => byId.has(d) && d !== id);
    deps.forEach((d, i) => render(d, childPrefix, i === deps.length - 1));
  }

  for (const root of roots) {
    seenInThisTree.clear();
    lines.push(root.id);
    seenInThisTree.add(root.id);
    const deps = root.dependsOn.filter((d) => byId.has(d) && d !== root.id);
    deps.forEach((d, i) => render(d, "", i === deps.length - 1));
    lines.push("");
  }
  return lines.join("\n").replace(/\n+$/, "\n");
}

/**
 * Render the dependsOn graph as Graphviz DOT.
 *
 * Edge direction: dep → task (deps must be done first, point down to the
 * task they unblock). This matches the natural "X must finish before Y"
 * reading order.
 *
 * Disposition is encoded as node color so different work types stand out.
 */
export function renderDepsDot(tasks: Task[]): string {
  const colors: Record<string, string> = {
    local: "lightblue",
    "claude-mention": "lightgreen",
    ultraplan: "lightyellow",
    autofix: "lightpink",
    web: "lavender",
    auto: "lightgrey",
  };
  const lines: string[] = ["digraph tasks {", "  rankdir=TB;", "  node [shape=box, style=filled];"];
  for (const t of tasks) {
    const color = colors[t.disposition] ?? "white";
    const label = t.id.replace(/"/g, '\\"');
    lines.push(`  "${label}" [fillcolor="${color}", tooltip="${escapeAttr(t.title)}"];`);
  }
  for (const t of tasks) {
    for (const d of t.dependsOn) {
      if (d === t.id) continue;
      lines.push(`  "${d}" -> "${t.id}";`);
    }
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}

function escapeAttr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
