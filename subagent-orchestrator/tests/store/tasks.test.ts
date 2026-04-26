// Tests for src/store/tasks.ts (M1).

import { describe, expect, it } from "vitest";

import { TaskParseError, parseTasksToml } from "../../src/store/tasks.js";

describe("parseTasksToml", () => {
  it("returns empty array for empty TOML", () => {
    expect(parseTasksToml("")).toEqual([]);
  });

  it("returns empty array when no [[task]] entries", () => {
    expect(parseTasksToml("# just a comment\n")).toEqual([]);
  });

  it("parses a minimal task with defaults applied", () => {
    const toml = `
[[task]]
id     = "fix-bug"
title  = "Fix the auth bug"
prompt = "Find and fix the JWT validation issue"
disposition = "local"
`;
    const tasks = parseTasksToml(toml);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toEqual({
      id: "fix-bug",
      title: "Fix the auth bug",
      prompt: "Find and fix the JWT validation issue",
      disposition: "local",
      repo: "",
      branch: "main",
      label: undefined,
      automerge: false,
      deepReview: false,
      dependsOn: [],
    });
  });

  it("requires id", () => {
    const toml = `[[task]]\ntitle="x"\nprompt="y"\n`;
    expect(() => parseTasksToml(toml)).toThrow(TaskParseError);
    expect(() => parseTasksToml(toml)).toThrow(/missing required field 'id'/);
  });

  it("rejects non-kebab-case ids", () => {
    const toml = `[[task]]\nid="Fix_Bug"\ntitle="x"\nprompt="y"\n`;
    expect(() => parseTasksToml(toml)).toThrow(/lowercase kebab-case/);
  });

  it("requires repo for non-local dispositions", () => {
    const toml = `[[task]]\nid="t"\ntitle="x"\nprompt="y"\ndisposition="claude-mention"\n`;
    expect(() => parseTasksToml(toml)).toThrow(/requires 'repo'/);
  });

  it("rejects unknown disposition", () => {
    const toml = `[[task]]\nid="t"\ntitle="x"\nprompt="y"\ndisposition="bogus"\nrepo="o/r"\n`;
    expect(() => parseTasksToml(toml)).toThrow(/disposition 'bogus' invalid/);
  });

  it("normalizes deep_review snake_case to deepReview camelCase", () => {
    const toml = `
[[task]]
id="t"; title="x"; prompt="y"
disposition="claude-mention"
repo="o/r"
deep_review=true
depends_on=["a","b"]
`;
    const tasks = parseTasksToml(toml);
    expect(tasks[0]?.deepReview).toBe(true);
    expect(tasks[0]?.dependsOn).toEqual(["a", "b"]);
  });
});
