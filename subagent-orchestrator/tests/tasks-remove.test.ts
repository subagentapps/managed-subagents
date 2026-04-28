// Tests for src/tasks-remove.ts.

import { describe, expect, it } from "vitest";

import { removeTaskFromToml, RemoveTaskError } from "../src/tasks-remove.js";
import { parseTasksToml } from "../src/store/tasks.js";

const oneTask = `[[task]]
id = "alpha"
title = "First"
prompt = "P1"
`;

const twoTasks = `[[task]]
id = "alpha"
title = "First"
prompt = "P1"

[[task]]
id = "beta"
title = "Second"
prompt = "P2"
`;

describe("removeTaskFromToml", () => {
  it("removes a single task leaving an empty file", () => {
    const r = removeTaskFromToml(oneTask, "alpha");
    expect(r.removed).toMatch(/id = "alpha"/);
    expect(parseTasksToml(r.content)).toHaveLength(0);
  });

  it("removes the first of two and keeps the other intact", () => {
    const r = removeTaskFromToml(twoTasks, "alpha");
    const remaining = parseTasksToml(r.content);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe("beta");
  });

  it("removes the second of two and keeps the first intact", () => {
    const r = removeTaskFromToml(twoTasks, "beta");
    const remaining = parseTasksToml(r.content);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe("alpha");
  });

  it("preserves leading comments and whitespace", () => {
    const file = `# top comment\n# another\n\n${twoTasks}`;
    const r = removeTaskFromToml(file, "alpha");
    expect(r.content).toMatch(/^# top comment/);
    expect(r.content).toMatch(/# another/);
  });

  it("preserves comments between stanzas (associated with the kept task)", () => {
    const file = `${oneTask}\n# comment about beta\n[[task]]\nid = "beta"\ntitle = "Second"\nprompt = "P2"\n`;
    const r = removeTaskFromToml(file, "alpha");
    expect(r.content).toMatch(/# comment about beta/);
    expect(parseTasksToml(r.content)).toHaveLength(1);
  });

  it("throws when id not found", () => {
    expect(() => removeTaskFromToml(twoTasks, "missing")).toThrow(RemoveTaskError);
    expect(() => removeTaskFromToml(twoTasks, "missing")).toThrow(/no task with id='missing'/);
  });

  it("throws when there are no [[task]] blocks at all", () => {
    expect(() => removeTaskFromToml("# only comments\n", "alpha")).toThrow(/no \[\[task\]\] entries/);
  });

  it("refuses when id appears in multiple stanzas", () => {
    const dup = `[[task]]\nid = "alpha"\ntitle = "X"\nprompt = "Y"\n\n[[task]]\nid = "alpha"\ntitle = "Z"\nprompt = "W"\n`;
    expect(() => removeTaskFromToml(dup, "alpha")).toThrow(/2 stanzas/);
  });

  it("throws on empty id", () => {
    expect(() => removeTaskFromToml(oneTask, "")).toThrow(/id is required/);
  });

  it("does not match id substring (a != alpha)", () => {
    expect(() => removeTaskFromToml(oneTask, "a")).toThrow(/no task with id='a'/);
  });

  it("returns the exact removed stanza text", () => {
    const r = removeTaskFromToml(twoTasks, "beta");
    expect(r.removed).toContain('id = "beta"');
    expect(r.removed).toContain("Second");
    expect(r.removed).not.toContain("alpha");
  });
});
