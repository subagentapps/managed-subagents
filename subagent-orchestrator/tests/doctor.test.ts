// Tests for src/doctor.ts. Mock-only.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { doctor } from "../src/doctor.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExec = any;

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "doctor-"));
  // Seed required subagent files so subagents check passes by default
  const agentsDir = join(tmpDir, ".claude", "agents");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, "orchestrator-shipper.md"), "x".repeat(200));
  writeFileSync(join(agentsDir, "orchestrator-reviewer.md"), "x".repeat(200));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const okExec: AnyExec = async (cmd: string, args: string[]) => {
  if (cmd === "gh" && args[0] === "--version") return { stdout: "gh version 2.40.0\n", stderr: "" };
  if (cmd === "gh" && args[0] === "auth" && args[1] === "status") return { stdout: "Logged in\n", stderr: "" };
  return { stdout: "", stderr: "" };
};

const okSdk = async () => ({ ok: true, version: "1.2.3" });

describe("doctor", () => {
  it("all-green path", async () => {
    const report = await doctor({
      cwd: tmpDir,
      dbPath: ":memory:",
      execFileOverride: okExec,
      sdkLoadOverride: okSdk,
      envOverride: { CLAUDE_CODE_OAUTH_TOKEN: "secret" },
    });

    expect(report.hasFailures).toBe(false);
    expect(report.hasWarnings).toBe(false);
    expect(report.checks.every((c) => c.severity === "ok")).toBe(true);
    expect(report.checks.map((c) => c.name)).toEqual([
      "node", "gh-cli", "db", "agent-sdk", "subagents", "auth-token",
    ]);
  });

  it("flags missing gh CLI as fail", async () => {
    const exec: AnyExec = async () => {
      throw new Error("not found");
    };
    const report = await doctor({
      cwd: tmpDir,
      dbPath: ":memory:",
      execFileOverride: exec,
      sdkLoadOverride: okSdk,
      envOverride: { CLAUDE_CODE_OAUTH_TOKEN: "x" },
    });
    expect(report.hasFailures).toBe(true);
    const gh = report.checks.find((c) => c.name === "gh-cli");
    expect(gh?.severity).toBe("fail");
    expect(gh?.message).toMatch(/not on PATH/);
  });

  it("flags un-authed gh as fail", async () => {
    const exec: AnyExec = async (_cmd: string, args: string[]) => {
      if (args[0] === "--version") return { stdout: "gh version 2.40.0\n", stderr: "" };
      throw Object.assign(new Error("not logged in"), { stderr: "auth required" });
    };
    const report = await doctor({
      cwd: tmpDir,
      dbPath: ":memory:",
      execFileOverride: exec,
      sdkLoadOverride: okSdk,
      envOverride: { CLAUDE_CODE_OAUTH_TOKEN: "x" },
    });
    const gh = report.checks.find((c) => c.name === "gh-cli");
    expect(gh?.severity).toBe("fail");
    expect(gh?.message).toMatch(/not authenticated/);
  });

  it("flags missing SDK as fail", async () => {
    const report = await doctor({
      cwd: tmpDir,
      dbPath: ":memory:",
      execFileOverride: okExec,
      sdkLoadOverride: async () => ({ ok: false }),
      envOverride: { CLAUDE_CODE_OAUTH_TOKEN: "x" },
    });
    const sdk = report.checks.find((c) => c.name === "agent-sdk");
    expect(sdk?.severity).toBe("fail");
  });

  it("flags missing subagents as warn", async () => {
    rmSync(join(tmpDir, ".claude", "agents", "orchestrator-shipper.md"));
    const report = await doctor({
      cwd: tmpDir,
      dbPath: ":memory:",
      execFileOverride: okExec,
      sdkLoadOverride: okSdk,
      envOverride: { CLAUDE_CODE_OAUTH_TOKEN: "x" },
    });
    const sub = report.checks.find((c) => c.name === "subagents");
    expect(sub?.severity).toBe("warn");
    expect(sub?.message).toMatch(/orchestrator-shipper/);
    expect(report.hasWarnings).toBe(true);
  });

  it("flags missing .claude/agents directory entirely as warn", async () => {
    rmSync(join(tmpDir, ".claude"), { recursive: true });
    const report = await doctor({
      cwd: tmpDir,
      dbPath: ":memory:",
      execFileOverride: okExec,
      sdkLoadOverride: okSdk,
      envOverride: { CLAUDE_CODE_OAUTH_TOKEN: "x" },
    });
    const sub = report.checks.find((c) => c.name === "subagents");
    expect(sub?.severity).toBe("warn");
    expect(sub?.message).toMatch(/no .claude\/agents/);
  });

  it("warns when CLAUDE_CODE_OAUTH_TOKEN absent", async () => {
    const report = await doctor({
      cwd: tmpDir,
      dbPath: ":memory:",
      execFileOverride: okExec,
      sdkLoadOverride: okSdk,
      envOverride: {},  // no token
    });
    const tok = report.checks.find((c) => c.name === "auth-token");
    expect(tok?.severity).toBe("warn");
  });

  it("flags old node version as fail (via __TEST_NODE_VERSION override)", async () => {
    const report = await doctor({
      cwd: tmpDir,
      dbPath: ":memory:",
      execFileOverride: okExec,
      sdkLoadOverride: okSdk,
      envOverride: { __TEST_NODE_VERSION: "18.0.0", CLAUDE_CODE_OAUTH_TOKEN: "x" },
    });
    const node = report.checks.find((c) => c.name === "node");
    expect(node?.severity).toBe("fail");
    expect(node?.message).toMatch(/too old/);
  });

  it("flags db open failure as fail", async () => {
    const sdkOk = vi.fn().mockResolvedValue({ ok: true });
    // Use a path that can't be opened — directory that doesn't exist
    const report = await doctor({
      cwd: tmpDir,
      dbPath: "/nonexistent-dir-xyz/orchestrator.db",
      execFileOverride: okExec,
      sdkLoadOverride: sdkOk,
      envOverride: { CLAUDE_CODE_OAUTH_TOKEN: "x" },
    });
    const dbCheck = report.checks.find((c) => c.name === "db");
    expect(dbCheck?.severity).toBe("fail");
  });
});
