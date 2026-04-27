// Tests for src/cli/dispatch.ts (M9 CLI integration).
// Captures stdout, mocks the orchestrator's dispatchers via DB-only path.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runDispatchAll, runDispatchPrune, runDispatchQuery, runDispatchStats, runDispatchSummary, runDispatchTask } from "../../src/cli/dispatch.js";
import { openDb, recordDispatch, updateDispatch } from "../../src/store/db.js";

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
    // without a PR target; 'b' is claude-mention without a target. Hermetic + quick.
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
title="say hi"
prompt="please respond"
disposition="claude-mention"
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

describe("runDispatchQuery", () => {
  beforeEach(() => {
    // Seed the tmpDb with rows
    const db = openDb({ path: tmpDb });
    const a = recordDispatch(db, { taskId: "alpha", disposition: "local", dispatchedAt: "2026-04-26T08:00:00Z" });
    updateDispatch(db, a, { status: "merged", prUrl: "https://github.com/o/r/pull/1", prNumber: 1, ultrareviewUsed: false, costUsdEstimate: 0.10 });
    const b = recordDispatch(db, { taskId: "beta", disposition: "ultraplan", dispatchedAt: "2026-04-27T08:00:00Z" });
    updateDispatch(db, b, { status: "failed", ultrareviewUsed: false });
    db.close();
  });

  it("prints rows when filters match", () => {
    runDispatchQuery({ dbPath: tmpDb, status: "failed" });
    expect(logged.some((l) => l.includes("beta") && l.includes("failed"))).toBe(true);
    expect(logged.some((l) => l.includes("alpha"))).toBe(false);
  });

  it("prints '(no rows match the filters)' when empty", () => {
    runDispatchQuery({ dbPath: tmpDb, taskId: "nonexistent" });
    expect(logged.some((l) => l.includes("no rows match the filters"))).toBe(true);
  });

  it("supports comma-separated status list", () => {
    runDispatchQuery({ dbPath: tmpDb, status: "merged,failed" });
    expect(logged.some((l) => l.includes("alpha"))).toBe(true);
    expect(logged.some((l) => l.includes("beta"))).toBe(true);
  });

  it("filters by hasPr=true", () => {
    runDispatchQuery({ dbPath: tmpDb, hasPr: true });
    expect(logged.some((l) => l.includes("alpha"))).toBe(true);
    expect(logged.some((l) => l.includes("beta"))).toBe(false);
  });
});

describe("runDispatchSummary", () => {
  beforeEach(() => {
    const db = openDb({ path: tmpDb });
    const a = recordDispatch(db, { taskId: "x", disposition: "local", dispatchedAt: "2026-04-26T08:00:00Z" });
    updateDispatch(db, a, { status: "merged", ultrareviewUsed: false, costUsdEstimate: 0.10 });
    const b = recordDispatch(db, { taskId: "y", disposition: "local", dispatchedAt: "2026-04-27T08:00:00Z" });
    updateDispatch(db, b, { status: "failed", ultrareviewUsed: false, costUsdEstimate: 0.05 });
    db.close();
  });

  it("prints buckets when data exists", () => {
    runDispatchSummary({ dbPath: tmpDb });
    expect(logged.some((l) => l.includes("2026-04-27"))).toBe(true);
    expect(logged.some((l) => l.includes("2026-04-26"))).toBe(true);
    expect(logged.some((l) => l.includes("TOTAL across 2 bucket(s)"))).toBe(true);
  });

  it("prints '(no dispatches in window)' when filters exclude everything", () => {
    runDispatchSummary({ dbPath: tmpDb, taskId: "missing" });
    expect(logged.some((l) => l.includes("no dispatches in window"))).toBe(true);
  });

  it("supports month bucket", () => {
    runDispatchSummary({ dbPath: tmpDb, bucket: "month" });
    expect(logged.some((l) => l.includes("2026-04") && !l.includes("2026-04-2"))).toBe(true);
  });
});

describe("runDispatchPrune", () => {
  beforeEach(() => {
    const db = openDb({ path: tmpDb });
    const a = recordDispatch(db, { taskId: "ancient", disposition: "local", dispatchedAt: "2026-04-01T00:00:00Z" });
    updateDispatch(db, a, { status: "merged", ultrareviewUsed: false });
    const b = recordDispatch(db, { taskId: "fresh", disposition: "local", dispatchedAt: "2026-04-27T00:00:00Z" });
    updateDispatch(db, b, { status: "dispatched", ultrareviewUsed: false });
    db.close();
  });

  it("errors when no cutoff supplied", () => {
    runDispatchPrune({ dbPath: tmpDb });
    expect(errored.some((l) => l.includes("requires --before"))).toBe(true);
    expect(process.exitCode).toBe(2);
  });

  it("deletes rows before cutoff", () => {
    runDispatchPrune({ dbPath: tmpDb, before: "2026-04-15T00:00:00Z" });
    expect(logged.some((l) => l.includes("deleted 1 row"))).toBe(true);
  });

  it("dryRun reports without deleting", () => {
    runDispatchPrune({ dbPath: tmpDb, before: "2026-04-15T00:00:00Z", dryRun: true });
    expect(logged.some((l) => l.includes("[dry-run]") && l.includes("would delete 1"))).toBe(true);
  });
});

describe("runDispatchTask --dry-run", () => {
  it("reports ready and does not write to DB", async () => {
    writeFileSync(
      tmpToml,
      `[[task]]\nid="probe"\ntitle="Read CHANGELOG"\nprompt="read-only inspect the changelog"\n`,
    );
    await runDispatchTask("probe", { tasksTomlPath: tmpToml, dbPath: tmpDb, dryRun: true });
    expect(logged.some((l) => l.includes("✅ ready") && l.includes("[probe]") && l.includes("local"))).toBe(true);
    // No db file should have been touched (no orchestrator output line)
    expect(logged.find((l) => l.startsWith("[probe]") && l.includes("→"))).toBeUndefined();
  });

  it("reports blocked when autofix lacks PR target", async () => {
    writeFileSync(
      tmpToml,
      `[[task]]\nid="fix"\ntitle="Fix CI"\nprompt="fix the build"\ndisposition="autofix"\nrepo="o/r"\n`,
    );
    await runDispatchTask("fix", { tasksTomlPath: tmpToml, dbPath: tmpDb, dryRun: true });
    expect(logged.some((l) => l.includes("❌ blocked") && l.includes("PR #N"))).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});

describe("runDispatchAll --dry-run", () => {
  it("prints validate findings then per-task plan; doesn't dispatch", async () => {
    writeFileSync(
      tmpToml,
      `
[[task]]
id="a"
title="Read"
prompt="read-only inspect"

[[task]]
id="b"
title="Fix"
prompt="fix the build"
disposition="autofix"
repo="o/r"

[[task]]
id="c"
title="Plan"
prompt="design migration plan"
dependsOn=["a"]
`,
    );
    await runDispatchAll({ tasksTomlPath: tmpToml, dbPath: tmpDb, dryRun: true });
    // Expect both ready and blocked entries, plus the trailer
    expect(logged.some((l) => l.includes("✅ ready") && l.includes("[a]"))).toBe(true);
    expect(logged.some((l) => l.includes("❌ blocked") && l.includes("[b]"))).toBe(true);
    expect(logged.some((l) => l.includes("[dry-run]") && l.includes("3 task"))).toBe(true);
    expect(process.exitCode).toBe(1);  // because 'b' is blocked
  });
});
