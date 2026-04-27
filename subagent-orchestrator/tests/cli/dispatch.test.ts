// Tests for src/cli/dispatch.ts (M9 CLI integration).
// Captures stdout, mocks the orchestrator's dispatchers via DB-only path.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runDispatchAll, runDispatchStats, runDispatchTask } from "../../src/cli/dispatch.js";

let tmpDir: string;
let tmpToml: string;
let tmpDb: string;
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;
let logged: string[];
let errored: string[];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "orch-cli-"));
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
  // reset exit code that earlier tests might have set
  process.exitCode = 0;
});

afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  try {
    unlinkSync(tmpToml);
  } catch {}
  try {
    unlinkSync(tmpDb);
  } catch {}
  process.exitCode = 0;
});

describe("runDispatchStats", () => {
  it("prints (no dispatches recorded yet) when db is empty", () => {
    runDispatchStats({ dbPath: tmpDb });
    expect(logged.some((l) => l.includes("no dispatches recorded yet"))).toBe(true);
  });
});

describe("runDispatchTask", () => {
  it("errors when task id not found", async () => {
    writeFileSync(
      tmpToml,
      `[[task]]\nid="other"\ntitle="x"\nprompt="y"\ndisposition="local"\n`,
    );
    await runDispatchTask("missing-id", { tasksTomlPath: tmpToml, dbPath: tmpDb });
    expect(errored.some((l) => l.includes("No task with id='missing-id'"))).toBe(true);
    expect(process.exitCode).toBe(2);
  });

  it("dispatches a found task and writes telemetry (autofix without target fails fast)", async () => {
    // autofix requires 'PR #N' in prompt; without one, the orchestrator
    // fails fast without hitting the real SDK — keeps this test hermetic.
    writeFileSync(
      tmpToml,
      `[[task]]\nid="fix-build"\ntitle="Fix CI"\nprompt="fix the build"\ndisposition="autofix"\nrepo="owner/repo"\n`,
    );
    await runDispatchTask("fix-build", {
      tasksTomlPath: tmpToml,
      dbPath: tmpDb,
    });
    expect(logged.some((l) => l.includes("fix-build") && l.includes("autofix"))).toBe(true);
    expect(logged.some((l) => l.includes("failed"))).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});

describe("runDispatchAll", () => {
  it("prints empty message when no tasks", async () => {
    writeFileSync(tmpToml, "# no tasks\n");
    await runDispatchAll({ tasksTomlPath: tmpToml, dbPath: tmpDb });
    expect(logged.some((l) => l.includes("no tasks defined"))).toBe(true);
  });

  it("processes multiple tasks sequentially", async () => {
    // Both tasks fail-fast without hitting real SDK/gh: 'a' is autofix
    // without a PR target; 'b' is web (un-wired). Hermetic + quick.
    writeFileSync(
      tmpToml,
      `
[[task]]
id="a"
title="fix CI"
prompt="fix the build"
disposition="autofix"
repo="owner/repo"

[[task]]
id="b"
title="implement new feature"
prompt="run remotely in the cloud"
disposition="web"
repo="owner/repo"
`,
    );
    await runDispatchAll({ tasksTomlPath: tmpToml, dbPath: tmpDb });
    // Both should appear in output
    expect(logged.some((l) => l.includes("[a]"))).toBe(true);
    expect(logged.some((l) => l.includes("[b]"))).toBe(true);
    // Summary line
    expect(logged.some((l) => /\d+\/\d+ succeeded/.test(l))).toBe(true);
  });
});
