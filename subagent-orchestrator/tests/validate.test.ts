// Tests for src/validate.ts.

import { describe, expect, it } from "vitest";

import { validateTasks } from "../src/validate.js";
import type { Task } from "../src/types.js";

function t(overrides: Partial<Task>): Task {
  return {
    id: "x",
    title: "x",
    prompt: "x",
    disposition: "auto",
    repo: "owner/repo",
    branch: "main",
    automerge: false,
    deepReview: false,
    dependsOn: [],
    ...overrides,
  };
}

describe("validateTasks", () => {
  it("clean run yields no findings", () => {
    const r = validateTasks([t({ id: "a" }), t({ id: "b" })]);
    expect(r.findings).toEqual([]);
  });

  it("flags duplicate ids", () => {
    const r = validateTasks([t({ id: "dup" }), t({ id: "dup" })]);
    expect(r.errors).toBeGreaterThan(0);
    expect(r.findings.find((f) => f.message.includes("duplicate"))?.taskId).toBe("dup");
  });

  it("flags dependsOn pointing to unknown id", () => {
    const r = validateTasks([t({ id: "a", dependsOn: ["nope"] })]);
    expect(r.errors).toBe(1);
    expect(r.findings[0]?.message).toMatch(/unknown task 'nope'/);
  });

  it("flags self-dependency", () => {
    const r = validateTasks([t({ id: "a", dependsOn: ["a"] })]);
    expect(r.findings.find((f) => f.message.includes("references self"))).toBeDefined();
  });

  it("detects 2-cycle in dependsOn", () => {
    const r = validateTasks([
      t({ id: "a", dependsOn: ["b"] }),
      t({ id: "b", dependsOn: ["a"] }),
    ]);
    const cycle = r.findings.find((f) => f.message.includes("cycle"));
    expect(cycle).toBeDefined();
    expect(cycle?.message).toMatch(/a → b → a|b → a → b/);
  });

  it("detects 3-cycle", () => {
    const r = validateTasks([
      t({ id: "a", dependsOn: ["b"] }),
      t({ id: "b", dependsOn: ["c"] }),
      t({ id: "c", dependsOn: ["a"] }),
    ]);
    expect(r.findings.find((f) => f.message.includes("cycle"))).toBeDefined();
  });

  it("accepts a DAG without false-positive cycle", () => {
    const r = validateTasks([
      t({ id: "a", dependsOn: ["b", "c"] }),
      t({ id: "b", dependsOn: ["d"] }),
      t({ id: "c", dependsOn: ["d"] }),
      t({ id: "d" }),
    ]);
    expect(r.findings.find((f) => f.message.includes("cycle"))).toBeUndefined();
  });

  it("warns on malformed repo", () => {
    const r = validateTasks([t({ id: "a", repo: "not-a-repo" })]);
    expect(r.warnings).toBe(1);
    expect(r.findings[0]?.message).toMatch(/owner\/name/);
  });

  it("warns on autofix without PR target", () => {
    const r = validateTasks([t({ id: "a", disposition: "autofix", prompt: "fix the build" })]);
    expect(r.findings.find((f) => f.message.includes("PR #N"))).toBeDefined();
  });

  it("does NOT warn on autofix with PR target", () => {
    const r = validateTasks([t({ id: "a", disposition: "autofix", prompt: "fix PR #42" })]);
    expect(r.findings.find((f) => f.message.includes("PR #N"))).toBeUndefined();
  });

  it("warns on claude-mention without target", () => {
    const r = validateTasks([t({ id: "a", disposition: "claude-mention", prompt: "say hi" })]);
    expect(r.findings.find((f) => /PR #N.*issue #N/.test(f.message))).toBeDefined();
  });

  it("infos on deepReview with disposition=local", () => {
    const r = validateTasks([t({ id: "a", disposition: "local", deepReview: true })]);
    expect(r.infos).toBe(1);
    expect(r.findings[0]?.message).toMatch(/deepReview is meaningless/);
  });

  it("warns on automerge=true (M8 rails block it)", () => {
    const r = validateTasks([t({ id: "a", automerge: true })]);
    expect(r.findings.find((f) => f.message.includes("automerge=true"))).toBeDefined();
  });

  it("aggregates findings counts correctly", () => {
    const r = validateTasks([
      t({ id: "a", repo: "bad", automerge: true }),
      t({ id: "a", dependsOn: ["nope"] }),
    ]);
    // Errors: duplicate id (1), unknown dep (1) = 2
    expect(r.errors).toBe(2);
    // Warnings: malformed repo (1), automerge (1) = 2
    expect(r.warnings).toBe(2);
  });
});
