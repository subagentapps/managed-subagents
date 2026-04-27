// Tests for src/deps-graph.ts.

import { describe, expect, it } from "vitest";

import { renderDepsDot, renderDepsTree } from "../src/deps-graph.js";
import type { Task } from "../src/types.js";

function t(overrides: Partial<Task>): Task {
  return {
    id: "x", title: "x", prompt: "x", disposition: "auto",
    repo: "owner/repo", branch: "main", automerge: false, deepReview: false,
    dependsOn: [], ...overrides,
  };
}

describe("renderDepsTree", () => {
  it("single isolated task renders as one line", () => {
    const out = renderDepsTree([t({ id: "alone" })]);
    expect(out.trim()).toBe("alone");
  });

  it("renders root with one dependency under it", () => {
    const out = renderDepsTree([
      t({ id: "build", dependsOn: ["lint"] }),
      t({ id: "lint" }),
    ]);
    // 'build' is root (no one depends on it); 'lint' is its dep
    expect(out).toMatch(/^build\n└─ lint/);
  });

  it("renders multiple roots", () => {
    const out = renderDepsTree([
      t({ id: "a" }),
      t({ id: "b" }),
    ]);
    expect(out).toMatch(/^a/m);
    expect(out).toMatch(/^b/m);
  });

  it("marks (↑) on shared deps within a tree", () => {
    // root depends on x and y; both x and y depend on shared
    const out = renderDepsTree([
      t({ id: "root", dependsOn: ["x", "y"] }),
      t({ id: "x", dependsOn: ["shared"] }),
      t({ id: "y", dependsOn: ["shared"] }),
      t({ id: "shared" }),
    ]);
    // 'shared' should appear once expanded, then again with (↑)
    expect((out.match(/shared/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(out).toContain("(↑)");
  });

  it("ignores self-dep", () => {
    const out = renderDepsTree([t({ id: "a", dependsOn: ["a"] })]);
    // 'a' is treated as a root with no children
    expect(out.trim()).toBe("a");
  });

  it("ignores unknown dep ids", () => {
    const out = renderDepsTree([t({ id: "a", dependsOn: ["nope"] })]);
    expect(out.trim()).toBe("a");
  });
});

describe("renderDepsDot", () => {
  it("emits valid digraph header + footer", () => {
    const out = renderDepsDot([t({ id: "a" })]);
    expect(out).toMatch(/^digraph tasks \{/);
    expect(out.trim()).toMatch(/\}$/);
    expect(out).toContain("rankdir=TB");
  });

  it("emits one node per task", () => {
    const out = renderDepsDot([t({ id: "a" }), t({ id: "b" })]);
    expect(out).toMatch(/"a" \[fillcolor=/);
    expect(out).toMatch(/"b" \[fillcolor=/);
  });

  it("emits dep -> task edges (direction matters)", () => {
    const out = renderDepsDot([
      t({ id: "build", dependsOn: ["lint"] }),
      t({ id: "lint" }),
    ]);
    expect(out).toContain('"lint" -> "build"');
    expect(out).not.toContain('"build" -> "lint"');
  });

  it("colors nodes by disposition", () => {
    const out = renderDepsDot([
      t({ id: "a", disposition: "local" }),
      t({ id: "b", disposition: "ultraplan" }),
    ]);
    expect(out).toMatch(/"a".*lightblue/);
    expect(out).toMatch(/"b".*lightyellow/);
  });

  it("escapes quotes in title attribute", () => {
    const out = renderDepsDot([t({ id: "a", title: 'has "quotes"' })]);
    expect(out).toContain('tooltip="has \\"quotes\\""');
  });

  it("skips self-edge", () => {
    const out = renderDepsDot([t({ id: "a", dependsOn: ["a"] })]);
    expect(out).not.toContain('"a" -> "a"');
  });
});
