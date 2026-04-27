// doctor.ts — diagnostic for the orchestrator's runtime dependencies.
//
// Probes each external dependency that the orchestrator needs and reports
// pass/warn/fail. Designed to answer "why is babysit/dispatch hanging?"
// before reaching for verbose log inspection.
//
// Checks:
//   1. Node version (>= 20)
//   2. gh CLI installed + authenticated
//   3. SQLite DB reachable + schema present
//   4. Claude Agent SDK loadable
//   5. Subagent definitions present in .claude/agents/
//   6. CLAUDE_CODE_OAUTH_TOKEN present (env or keychain hint)

import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { openDb } from "./store/db.js";

const execFileAsync = promisify(execFile);

export type CheckSeverity = "ok" | "warn" | "fail";

export interface CheckResult {
  name: string;
  severity: CheckSeverity;
  message: string;
  /** Optional remediation hint */
  hint?: string;
}

export interface DoctorOptions {
  /** Override DB path. Defaults to ~/.claude/orchestrator.db */
  dbPath?: string;
  /** Override cwd used for subagent lookup. Defaults to process.cwd(). */
  cwd?: string;
  /** Inject for testing. */
  execFileOverride?: typeof execFileAsync;
  /** Inject for testing. */
  sdkLoadOverride?: () => Promise<{ ok: boolean; version?: string }>;
  /** Inject for testing. */
  envOverride?: Record<string, string | undefined>;
}

export interface DoctorReport {
  checks: CheckResult[];
  hasFailures: boolean;
  hasWarnings: boolean;
}

const REQUIRED_NODE_MAJOR = 20;
const REQUIRED_AGENTS = ["orchestrator-shipper", "orchestrator-reviewer"];

export async function doctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const exec = options.execFileOverride ?? execFileAsync;
  const cwd = options.cwd ?? process.cwd();
  const env = options.envOverride ?? process.env;
  const checks: CheckResult[] = [];

  // 1. Node version
  checks.push(checkNode(env["__TEST_NODE_VERSION"]));

  // 2. gh CLI
  checks.push(await checkGh(exec));

  // 3. DB
  checks.push(checkDb(options.dbPath));

  // 4. SDK loadable
  checks.push(await checkSdk(options.sdkLoadOverride));

  // 5. Subagent definitions
  checks.push(checkSubagents(cwd));

  // 6. Auth token
  checks.push(checkAuthToken(env));

  return {
    checks,
    hasFailures: checks.some((c) => c.severity === "fail"),
    hasWarnings: checks.some((c) => c.severity === "warn"),
  };
}

function checkNode(overrideVersion?: string): CheckResult {
  const v = overrideVersion ?? process.versions.node;
  const major = parseInt(v.split(".")[0] ?? "0", 10);
  if (major >= REQUIRED_NODE_MAJOR) {
    return { name: "node", severity: "ok", message: `Node ${v}` };
  }
  return {
    name: "node",
    severity: "fail",
    message: `Node ${v} is too old`,
    hint: `Install Node ${REQUIRED_NODE_MAJOR}+ (better-sqlite3 binaries assume modern Node ABI)`,
  };
}

async function checkGh(exec: typeof execFileAsync): Promise<CheckResult> {
  let version: string;
  try {
    const { stdout } = await exec("gh", ["--version"]);
    version = stdout.split("\n")[0] ?? "unknown";
  } catch {
    return {
      name: "gh-cli",
      severity: "fail",
      message: "gh CLI not on PATH",
      hint: "Install via 'brew install gh' or https://cli.github.com",
    };
  }
  try {
    await exec("gh", ["auth", "status"]);
    return { name: "gh-cli", severity: "ok", message: version };
  } catch (err) {
    const e = err as { stderr?: string };
    return {
      name: "gh-cli",
      severity: "fail",
      message: `${version} (not authenticated)`,
      hint: `Run 'gh auth login'. Detail: ${(e.stderr ?? "").slice(0, 80)}`,
    };
  }
}

function checkDb(dbPath?: string): CheckResult {
  const path = dbPath ?? join(homedir(), ".claude", "orchestrator.db");
  try {
    const db = openDb({ path });
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dispatch_log'")
      .get();
    db.close();
    if (!row) {
      return { name: "db", severity: "fail", message: `${path} reachable but dispatch_log missing` };
    }
    return { name: "db", severity: "ok", message: `${path}` };
  } catch (err) {
    const e = err as { message?: string };
    return {
      name: "db",
      severity: "fail",
      message: `cannot open ${path}: ${e.message ?? "unknown"}`,
      hint: "Permissions issue? Or run any 'subagent-orchestrator dispatch …' to auto-create",
    };
  }
}

async function checkSdk(
  override?: () => Promise<{ ok: boolean; version?: string }>,
): Promise<CheckResult> {
  if (override) {
    const r = await override();
    return r.ok
      ? { name: "agent-sdk", severity: "ok", message: r.version ?? "loaded" }
      : { name: "agent-sdk", severity: "fail", message: "SDK not loadable", hint: "npm i @anthropic-ai/claude-agent-sdk" };
  }
  try {
    const mod = await import("@anthropic-ai/claude-agent-sdk");
    if (typeof mod.query !== "function") {
      return {
        name: "agent-sdk",
        severity: "fail",
        message: "SDK loaded but query() missing — version mismatch",
      };
    }
    return { name: "agent-sdk", severity: "ok", message: "loaded" };
  } catch (err) {
    return {
      name: "agent-sdk",
      severity: "fail",
      message: `cannot import @anthropic-ai/claude-agent-sdk: ${(err as Error).message.slice(0, 80)}`,
      hint: "Run 'npm ci' (or install the package)",
    };
  }
}

function checkSubagents(cwd: string): CheckResult {
  const dir = join(cwd, ".claude", "agents");
  if (!existsSync(dir)) {
    return {
      name: "subagents",
      severity: "warn",
      message: `no .claude/agents/ directory at ${cwd}`,
      hint: "ship/review subagents are required for full functionality",
    };
  }
  const missing = REQUIRED_AGENTS.filter(
    (name) => !existsSync(join(dir, `${name}.md`)),
  );
  if (missing.length > 0) {
    return {
      name: "subagents",
      severity: "warn",
      message: `missing subagent file(s): ${missing.join(", ")}`,
      hint: `expected ${missing.map((m) => `.claude/agents/${m}.md`).join(", ")}`,
    };
  }
  // Quick sanity — non-empty
  const sizes = REQUIRED_AGENTS.map((name) => statSync(join(dir, `${name}.md`)).size);
  if (sizes.some((s) => s < 100)) {
    return { name: "subagents", severity: "warn", message: "subagent file(s) suspiciously small" };
  }
  return { name: "subagents", severity: "ok", message: REQUIRED_AGENTS.join(", ") };
}

function checkAuthToken(env: Record<string, string | undefined>): CheckResult {
  if (env["CLAUDE_CODE_OAUTH_TOKEN"]) {
    return { name: "auth-token", severity: "ok", message: "CLAUDE_CODE_OAUTH_TOKEN set" };
  }
  return {
    name: "auth-token",
    severity: "warn",
    message: "CLAUDE_CODE_OAUTH_TOKEN not in env",
    hint: "SDK may fall back to ~/.claude/credentials.json or the macOS keychain. Set the env var explicitly to skip lookup.",
  };
}
