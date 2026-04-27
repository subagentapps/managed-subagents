// Tests for src/topo.ts.

import { describe, expect, it } from "vitest";

import { topoSortTasks, TopoSortError } from "../src/topo.js";
import type { Task } from "../src/types.js";

function t(overrides: Partial<Task>): Task {
  return {
    id: "x", title: "x", prompt: "x", disposition: "auto",
    repo: "owner/repo", branch: "main", automerge: false, deepReview: false,
    dependsOn: [], ...overrides,
  };
}

describe("topoSortTasks", () => {
  it("returns input unchanged when no deps", () => {
    const r = topoSortTasks([t({ id: "a" }), t({ id: "b" }), t({ id: "c" })]);
    expect(r.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("orders b before a when a dependsOn b", () => {
    const r = topoSortTasks([
      t({ id: "a", dependsOn: ["b"] }),
      t({ id: "b" }),
    ]);
    expect(r.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("preserves original relative order among independents", () => {
    const r = topoSortTasks([
      t({ id: "first" }),
      t({ id: "second" }),
      t({ id: "third" }),
    ]);
    expect(r.map((x) => x.id)).toEqual(["first", "second", "third"]);
  });

  it("handles a 4-node DAG", () => {
    // a → (none); b → a; c → a; d → b, c
    const r = topoSortTasks([
      t({ id: "d", dependsOn: ["b", "c"] }),
      t({ id: "c", dependsOn: ["a"] }),
      t({ id: "b", dependsOn: ["a"] }),
      t({ id: "a" }),
    ]);
    const order = r.map((x) => x.id);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("c"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("d"));
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("d"));
  });

  it("ignores unknown dependsOn ids (validate's job to flag)", () => {
    const r = topoSortTasks([t({ id: "a", dependsOn: ["nope"] })]);
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });

  it("ignores self-dependency", () => {
    const r = topoSortTasks([t({ id: "a", dependsOn: ["a"] })]);
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });

  it("throws TopoSortError on cycle", () => {
    expect(() =>
      topoSortTasks([
        t({ id: "a", dependsOn: ["b"] }),
        t({ id: "b", dependsOn: ["a"] }),
      ]),
    ).toThrow(TopoSortError);
  });

  it("attaches remaining tasks to TopoSortError", () => {
    try {
      topoSortTasks([
        t({ id: "a", dependsOn: ["b"] }),
        t({ id: "b", dependsOn: ["a"] }),
        t({ id: "free" }),  // not in cycle
      ]);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TopoSortError);
      const e = err as TopoSortError;
      expect(e.remaining.map((t) => t.id).sort()).toEqual(["a", "b"]);
    }
  });

  it("stable ordering: when both b and c are ready, declaration order wins", () => {
    // a → b; a → c. After a runs, b and c become ready simultaneously.
    // Original order: b before c → b runs first.
    const r = topoSortTasks([
      t({ id: "a" }),
      t({ id: "b", dependsOn: ["a"] }),
      t({ id: "c", dependsOn: ["a"] }),
    ]);
    expect(r.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("stable ordering: declaration order respected when c is declared before b", () => {
    const r = topoSortTasks([
      t({ id: "a" }),
      t({ id: "c", dependsOn: ["a"] }),
      t({ id: "b", dependsOn: ["a"] }),
    ]);
    expect(r.map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
});
