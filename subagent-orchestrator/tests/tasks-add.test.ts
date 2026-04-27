// Tests for src/tasks-add.ts.

import { describe, expect, it } from "vitest";
import toml from "@iarna/toml";

import { AddTaskError, appendTaskToToml, renderTaskToml, validateNewTask } from "../src/tasks-add.js";
import { parseTasksToml } from "../src/store/tasks.js";

describe("validateNewTask", () => {
  it("rejects malformed id", () => {
    expect(() => validateNewTask({ id: "Bad ID", title: "x", prompt: "x" })).toThrow(/kebab-case/);
  });
  it("rejects empty title/prompt", () => {
    expect(() => validateNewTask({ id: "a", title: "", prompt: "x" })).toThrow(/title/);
    expect(() => validateNewTask({ id: "a", title: "x", prompt: " " })).toThrow(/prompt/);
  });
  it("rejects invalid disposition", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateNewTask({ id: "a", title: "x", prompt: "x", disposition: "bogus" as any })).toThrow(/disposition/);
  });
  it("requires repo for non-local non-auto", () => {
    expect(() => validateNewTask({ id: "a", title: "x", prompt: "x", disposition: "ultraplan" })).toThrow(/repo/);
  });
  it("accepts local without repo", () => {
    expect(() => validateNewTask({ id: "a", title: "x", prompt: "x", disposition: "local" })).not.toThrow();
  });
});

describe("renderTaskToml", () => {
  it("emits minimal required fields", () => {
    const out = renderTaskToml({ id: "a", title: "T", prompt: "P" });
    expect(out).toMatch(/^\[\[task\]\]$/m);
    expect(out).toMatch(/id = "a"/);
    expect(out).toMatch(/title = "T"/);
    expect(out).toMatch(/prompt = "P"/);
    expect(out).not.toMatch(/disposition/);
  });

  it("omits disposition when 'auto'", () => {
    const out = renderTaskToml({ id: "a", title: "T", prompt: "P", disposition: "auto" });
    expect(out).not.toMatch(/disposition/);
  });

  it("includes repo / branch / label / flags when set", () => {
    const out = renderTaskToml({
      id: "a", title: "T", prompt: "P",
      disposition: "ultraplan", repo: "o/r", branch: "dev", label: "bug",
      automerge: true, deepReview: true,
    });
    expect(out).toMatch(/disposition = "ultraplan"/);
    expect(out).toMatch(/repo = "o\/r"/);
    expect(out).toMatch(/branch = "dev"/);
    expect(out).toMatch(/label = "bug"/);
    expect(out).toMatch(/automerge = true/);
    expect(out).toMatch(/deep_review = true/);
  });

  it("omits branch when 'main' (default)", () => {
    const out = renderTaskToml({ id: "a", title: "T", prompt: "P", branch: "main" });
    expect(out).not.toMatch(/branch/);
  });

  it("emits depends_on as TOML array", () => {
    const out = renderTaskToml({ id: "a", title: "T", prompt: "P", dependsOn: ["x", "y"] });
    expect(out).toMatch(/depends_on = \["x", "y"\]/);
  });

  it("escapes embedded quotes and backslashes in strings", () => {
    const out = renderTaskToml({ id: "a", title: 'has "quote"', prompt: "back\\slash" });
    expect(out).toMatch(/title = "has \\"quote\\""/);
    expect(out).toMatch(/prompt = "back\\\\slash"/);
  });

  it("uses triple-quoted prompt when multiline", () => {
    const out = renderTaskToml({ id: "a", title: "T", prompt: "line1\nline2" });
    expect(out).toMatch(/prompt = """\nline1\nline2\n"""/);
  });

  it("output round-trips through TOML parser", () => {
    const out = renderTaskToml({
      id: "a", title: "T", prompt: "line1\nline2", disposition: "local",
      dependsOn: ["x"],
    });
    const parsed = toml.parse(out) as { task: Array<{ id: string; prompt: string; depends_on: string[] }> };
    expect(parsed.task[0]?.id).toBe("a");
    // TOML triple-quoted string preserves the line-break before closing """
    expect(parsed.task[0]?.prompt).toMatch(/^line1\nline2\n?$/);
    expect(parsed.task[0]?.depends_on).toEqual(["x"]);
  });
});

describe("appendTaskToToml", () => {
  it("appends to empty file", () => {
    const out = appendTaskToToml("", { id: "a", title: "T", prompt: "P" });
    expect(out).toMatch(/\[\[task\]\]/);
    // Round-trips
    const parsed = parseTasksToml(out);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe("a");
  });

  it("appends to file with existing task", () => {
    const existing = `[[task]]\nid = "first"\ntitle = "X"\nprompt = "Y"\n`;
    const out = appendTaskToToml(existing, { id: "second", title: "T", prompt: "P" });
    const parsed = parseTasksToml(out);
    expect(parsed.map((t) => t.id)).toEqual(["first", "second"]);
  });

  it("refuses to add duplicate id", () => {
    const existing = `[[task]]\nid = "dup"\ntitle = "X"\nprompt = "Y"\n`;
    expect(() => appendTaskToToml(existing, { id: "dup", title: "T", prompt: "P" }))
      .toThrow(AddTaskError);
  });

  it("preserves leading comments and whitespace in existing file", () => {
    const existing = `# Header comment\n# stays here\n\n[[task]]\nid = "first"\ntitle = "X"\nprompt = "Y"\n`;
    const out = appendTaskToToml(existing, { id: "second", title: "T", prompt: "P" });
    expect(out).toMatch(/^# Header comment/);
    expect(out).toMatch(/# stays here/);
  });
});
