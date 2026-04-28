// Tests for src/cli/tasks-show.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runTasksShow } from "../../src/cli/tasks-show.js";
import { openDb, recordDispatch, updateDispatch } from "../../src/store/db.js";

let tmpDir: string;
let tmpToml: string;
let tmpDb: string;
let logged: string[];
let errored: string[];
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "show-"));
  tmpToml = join(tmpDir, "tasks.toml");
  tmpDb = join(tmpDir, "orch.db");
  logged = [];
  errored = [];
  logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
    logged.push(args.join(" "));
  });
  errSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
    errored.push(args.join(" "));
  });
  process.exitCode = 0;
});

afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  try { unlinkSync(tmpToml); } catch {}
  try { unlinkSync(tmpDb); } catch {}
  process.exitCode = 0;
});

describe("runTasksShow", () => {
  it("errors when id not found", () => {
    writeFileSync(tmpToml, `[[task]]\nid = "other"\ntitle = "x"\nprompt = "y"\n`);
    runTasksShow({ tasksTomlPath: tmpToml, id: "missing", dbPath: tmpDb });
    expect(errored.some((l) => l.includes("missing"))).toBe(true);
    expect(process.exitCode).toBe(2);
  });

  it("prints fields, classification, prompt body for a found task", () => {
    writeFileSync(
      tmpToml,
      `[[task]]\nid = "alpha"\ntitle = "Read changelog"\nprompt = "read-only inspect"\n`,
    );
    runTasksShow({ tasksTomlPath: tmpToml, id: "alpha", dbPath: tmpDb });
    expect(logged.some((l) => l === "# alpha")).toBe(true);
    expect(logged.some((l) => l.includes("title:") && l.includes("Read changelog"))).toBe(true);
    expect(logged.some((l) => l.endsWith("## prompt"))).toBe(true);
    expect(logged.some((l) => l.endsWith("## classification"))).toBe(true);
    expect(logged.some((l) => l.includes("local"))).toBe(true);
  });

  it("includes validation findings scoped to this task", () => {
    writeFileSync(
      tmpToml,
      `[[task]]\nid = "fix"\ntitle = "Fix CI"\nprompt = "fix the build"\ndisposition = "autofix"\nrepo = "o/r"\n`,
    );
    runTasksShow({ tasksTomlPath: tmpToml, id: "fix", dbPath: tmpDb });
    expect(logged.some((l) => l.endsWith("## validation"))).toBe(true);
    expect(logged.some((l) => l.includes("PR #N"))).toBe(true);
  });

  it("omits validation section when no findings for this task", () => {
    writeFileSync(
      tmpToml,
      `[[task]]\nid = "clean"\ntitle = "x"\nprompt = "read-only inspect"\n`,
    );
    runTasksShow({ tasksTomlPath: tmpToml, id: "clean", dbPath: tmpDb });
    expect(logged.some((l) => l.endsWith("## validation"))).toBe(false);
  });

  it("shows recent dispatches when DB has rows for the task", () => {
    writeFileSync(tmpToml, `[[task]]\nid = "alpha"\ntitle = "x"\nprompt = "read-only"\n`);
    const db = openDb({ path: tmpDb });
    const a = recordDispatch(db, { taskId: "alpha", disposition: "local", dispatchedAt: "2026-04-26T10:00:00Z" });
    updateDispatch(db, a, { status: "merged", ultrareviewUsed: false, costUsdEstimate: 0.12 });
    db.close();

    runTasksShow({ tasksTomlPath: tmpToml, id: "alpha", dbPath: tmpDb });
    expect(logged.some((l) => l.includes("recent dispatches"))).toBe(true);
    expect(logged.some((l) => l.includes("merged") && l.includes("$0.12"))).toBe(true);
  });

  it("skips dispatches section when DB has no rows for this task", () => {
    writeFileSync(tmpToml, `[[task]]\nid = "alpha"\ntitle = "x"\nprompt = "read-only"\n`);
    const db = openDb({ path: tmpDb });
    // Different task in DB
    const o = recordDispatch(db, { taskId: "other", disposition: "local" });
    updateDispatch(db, o, { status: "failed", ultrareviewUsed: false });
    db.close();

    runTasksShow({ tasksTomlPath: tmpToml, id: "alpha", dbPath: tmpDb });
    expect(logged.some((l) => l.includes("recent dispatches"))).toBe(false);
  });

  it("renders multi-line prompts indented", () => {
    writeFileSync(
      tmpToml,
      `[[task]]\nid = "ml"\ntitle = "X"\nprompt = """\nfirst\nsecond\n"""\n`,
    );
    runTasksShow({ tasksTomlPath: tmpToml, id: "ml", dbPath: tmpDb });
    expect(logged.some((l) => l === "  first")).toBe(true);
    expect(logged.some((l) => l === "  second")).toBe(true);
  });
});
