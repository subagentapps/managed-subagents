# ROLE

You are **Claude Code** running in a macOS terminal session under a user's **Max** subscription. You are the load-bearing agent on this machine: every keystroke, file edit, shell call, and subagent spawn flows through your judgment. Posture accordingly.

**Posture (load-bearing):**
- You operate inside the user's working directory with full filesystem and shell reach. Treat that reach as a trust contract: prefer the smallest action that closes the loop, surface diffs before destructive moves, and default to `acceptEdits` for review-after-the-fact flows or `auto` (Shift+Tab → Auto mode) when the user has signaled "long task, hands off."
- The user's **Max** plan unlocks Claude Opus 4.7 + Auto mode on Anthropic API. Use Opus 4.7 as the default model for planning and main-thread work; route high-volume read-only exploration to **Haiku** via the built-in **Explore** subagent to preserve context.
- You are running on a MacBook. Honor macOS conventions: `cmd` modifiers, `~/.claude/` for user scope, `.claude/` for project scope, keychain for secrets.
- Authentication for any programmatic / CI work is the **`CLAUDE_CODE_OAUTH_TOKEN`** environment variable, generated once via `claude setup-token`. Never embed it in source, URLs, or logs; read it from the environment or the user's keychain at runtime.

**Directives — navigating `code.claude.com/docs/llms.txt`:**
1. **Treat `llms.txt` as the canonical site index.** It is a flat, machine-readable manifest of every doc page with a one-line description. Fetch it before broad searches.
2. **Resolve a topic in two hops:** (a) grep `llms.txt` for the keyword (`subagent`, `hooks`, `permission-mode`, `agent-sdk`, `oauth`), (b) fetch the matching `.md` URL directly. Append `.md` to any `code.claude.com/docs/en/<slug>` to get the raw Markdown — cheaper to parse than the rendered HTML.
3. **Authoritative sections to anchor on:**
   - `agent-sdk/overview` — Agent SDK surface (Python + TS), `query()`, `ClaudeAgentOptions`, `AgentDefinition`.
   - `sub-agents` — frontmatter schema, scopes, `--agents` JSON shape.
   - `cli-reference` — every flag, including `--agent`, `--agents`, `--permission-mode`, `setup-token`.
   - `permission-modes` — the six canonical modes and the auto-mode classifier rules.
   - `hooks` — full event list and the new `if` field.
4. **Primitives to extract, in order:** canonical names → required env vars → required flags → settings.json keys → frontmatter fields. Build TypeScript types from those, not from prose.
5. **Never invent a flag or field.** If `llms.txt` does not list it, fetch the changelog (`/docs/en/changelog`) and verify the version that introduced it.

---

## Table of contents

1. [Auto mode (research preview)](#auto-mode-research-preview)
2. [Computer use — Desktop](#computer-use--desktop)
3. [PR auto-fix (web)](#pr-auto-fix-web)
4. [Transcript search](#transcript-search)
5. [PowerShell tool (preview)](#powershell-tool-preview)
6. [Conditional hooks](#conditional-hooks)
7. [Other wins](#other-wins)
8. [Release manifest](#release-manifest)
9. [Subagents as TypeScript](#subagents-as-typescript)
10. [Programmatic Managed-Subagents SDK runbook (CLAUDE_CODE_OAUTH_TOKEN)](#programmatic-managed-subagents-sdk-runbook-claude_code_oauth_token)

---

## Shared primitives

```ts
/** Canonical permission-mode identifiers. */
type PermissionMode =
  | "default"
  | "acceptEdits"
  | "plan"
  | "auto"
  | "dontAsk"
  | "bypassPermissions";

/** Permission-rule syntax, e.g. "Bash(git commit *)", "Edit", "WebFetch(domain:example.com)". */
type PermissionRule = string;

/** Hook event names referenced this week. */
type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "CwdChanged"   // new
  | "FileChanged"; // new

interface ConditionalHook {
  /** Permission-rule expression that gates whether the hook spawns. */
  if?: PermissionRule;
  type: "command";
  command: string;
}

interface HooksSettings {
  PreToolUse?:   Array<{ hooks: ConditionalHook[] }>;
  PostToolUse?:  Array<{ hooks: ConditionalHook[] }>;
  CwdChanged?:   Array<{ hooks: ConditionalHook[] }>;
  FileChanged?:  Array<{ hooks: ConditionalHook[] }>;
}

/** Shape of `.claude/settings.json` keys touched by this release. */
interface ClaudeCodeSettings {
  permissions?: {
    defaultMode?: PermissionMode;             // e.g. "auto"
    disableAutoMode?: "disable";              // managed-settings lock
    disableBypassPermissionsMode?: "disable";
    allow?: PermissionRule[];
    ask?:   PermissionRule[];
    deny?:  PermissionRule[];
  };
  env?: {
    /** Opt into the native PowerShell tool on Windows (preview, v2.1.84). */
    CLAUDE_CODE_USE_POWERSHELL_TOOL?: "1";
  };
  hooks?: HooksSettings;
}
```

---

### Auto mode (research preview)

> ![Auto mode — research preview banner](https://code.claude.com/docs/en/whats-new/2026-w13#auto-mode)
> _Source: `whats-new/2026-w13`_

```ts
interface AutoModeFeature {
  id: "auto-mode";
  status: "research-preview";
  introducedIn: "v2.1.83";
  toggle: { shortcut: "Shift+Tab"; settingsPath: "permissions.defaultMode"; value: "auto" };
  requirements: {
    plans: Array<"Max" | "Team" | "Enterprise" | "API">; // not Pro
    models: Array<"claude-sonnet-4.6" | "claude-opus-4.6" | "claude-opus-4.7">;
    provider: "anthropic-api"; // not Bedrock/Vertex/Foundry
    adminEnabledOnTeamEnterprise: true;
  };
  fallback: { consecutiveBlockLimit: 3; totalBlockLimit: 20 };
}
```

---

### Computer use — Desktop

> ![Computer use — Desktop settings toggle](https://code.claude.com/docs/en/whats-new/2026-w13#computer-use)
> _Source: `whats-new/2026-w13`_

```ts
interface ComputerUseDesktopFeature {
  id: "computer-use-desktop";
  surface: "claude-code-desktop";
  defaultEnabled: false;
  promptsBeforeEachAction: true;
  capabilities: [
    "open-native-apps",
    "ios-simulator",
    "hardware-control-panels",
    "screen-verification"
  ];
}
```

---

### PR auto-fix (web)

> ![PR auto-fix toggle on Claude Code web CI panel](https://code.claude.com/docs/en/whats-new/2026-w13#pr-auto-fix)
> _Source: `whats-new/2026-w13`_

```ts
interface PrAutoFixFeature {
  id: "pr-auto-fix";
  surface: "claude-code-web";
  controlLocation: "CI panel · Auto fix toggle";
  behavior: "watches CI, fixes failures and nits, pushes until green";
}
```

---

### Transcript search

> ![Transcript search keybindings](https://code.claude.com/docs/en/whats-new/2026-w13#transcript-search)
> _Source: `whats-new/2026-w13` (v2.1.83)_

```ts
interface TranscriptSearchFeature {
  id: "transcript-search";
  introducedIn: "v2.1.83";
  enterTranscriptMode: "Ctrl+O";
  searchKey: "/";
  nextMatch: "n";
  prevMatch: "N";
}
```

---

### PowerShell tool (preview)

> ![PowerShell tool opt-in env var](https://code.claude.com/docs/en/whats-new/2026-w13#powershell-tool)
> _Source: `whats-new/2026-w13` (v2.1.84)_

```ts
interface PowerShellToolFeature {
  id: "powershell-tool";
  status: "preview";
  introducedIn: "v2.1.84";
  platform: "windows";
  optInEnvVar: "CLAUDE_CODE_USE_POWERSHELL_TOOL";
  optInValue: "1";
}
```

---

### Conditional hooks

> ![Conditional hooks if field example](https://code.claude.com/docs/en/whats-new/2026-w13#conditional-hooks)
> _Source: `whats-new/2026-w13` (v2.1.85)_

```ts
interface ConditionalHooksFeature {
  id: "conditional-hooks";
  introducedIn: "v2.1.85";
  newField: "if";
  syntax: "permission-rule";
  example: ConditionalHook; // { if: "Bash(git commit *)", type: "command", command: "..." }
}
```

---

### Other wins

```ts
interface OtherWins {
  pluginUserConfigPublic: { keychainBackedSecrets: true };
  pastedImageChips: { token: `[Image #${number}]`; positionalReference: true };
  managedSettingsDropInDir: ".claude/managed-settings.d/";
  newHookEvents: ["CwdChanged", "FileChanged"];
  agentInitialPrompt: { frontmatterField: "initialPrompt"; autoSubmitsFirstTurn: true };
  externalEditorShortcut: "Ctrl+X Ctrl+E";
  restoreInputOnEarlyInterrupt: true;
  statusWhileResponding: "/status";
  idleClearNudge: { afterMinutes: 75; command: "/clear" };
  deepLinks: { opensIn: "preferred-terminal" };
  vsCode: { rateLimitBanner: true; escTwiceRewindPicker: true };
}
```

---

### Release manifest

```ts
interface WeeklyRelease {
  week: 13;
  range: "2026-03-23/2026-03-27";
  versions: ["v2.1.83", "v2.1.84", "v2.1.85"];
  features: {
    autoMode:           AutoModeFeature;
    computerUseDesktop: ComputerUseDesktopFeature;
    prAutoFix:          PrAutoFixFeature;
    transcriptSearch:   TranscriptSearchFeature;
    powerShellTool:     PowerShellToolFeature;
    conditionalHooks:   ConditionalHooksFeature;
    otherWins:          OtherWins;
  };
}
```

---

## Subagents as TypeScript

Canonical subagent surface drawn from `docs/en/sub-agents` (frontmatter fields) and `docs/en/cli-reference` (`--agents` JSON shape). These types match what Claude Code accepts on disk **and** over the `--agents` CLI flag.

```ts
type SubagentScope =
  | "managed"            // org-deployed via managed settings (priority 1)
  | "cli"                // --agents JSON, session-only      (priority 2)
  | "project"            // .claude/agents/                  (priority 3)
  | "user"               // ~/.claude/agents/                (priority 4)
  | "plugin";            // <plugin>/agents/                 (priority 5)

type ModelSelector =
  | "sonnet" | "opus" | "haiku" | "inherit"
  | `claude-${"opus" | "sonnet" | "haiku"}-${string}`;

type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";
type MemoryScope = "user" | "project" | "local";
type AgentColor =
  | "red" | "blue" | "green" | "yellow"
  | "purple" | "orange" | "pink" | "cyan";

/** Canonical Subagent definition — mirrors YAML frontmatter and `--agents` JSON. */
interface SubagentDefinition {
  /** Required. Lowercase + hyphens. */
  name: string;
  /** Required. Tells the parent when to delegate. */
  description: string;
  /** System prompt body (Markdown body in files; `prompt` field in --agents JSON). */
  prompt?: string;

  // Tool surface
  tools?: string[];            // allowlist; e.g. ["Read","Grep","Glob","Bash","Agent(worker,researcher)"]
  disallowedTools?: string[];  // denylist; applied first

  // Execution
  model?: ModelSelector;       // default: "inherit"
  permissionMode?: PermissionMode;
  maxTurns?: number;
  effort?: EffortLevel;
  background?: boolean;
  isolation?: "worktree";

  // Context injection
  skills?: string[];           // preloaded; full content injected at startup
  initialPrompt?: string;      // auto-submitted as first user turn when run as main session
  memory?: MemoryScope;

  // Capability scoping
  mcpServers?: Array<string | Record<string, McpServerConfig>>;
  hooks?: HooksSettings;

  // UI
  color?: AgentColor;
}

type McpServerConfig =
  | { type: "stdio"; command: string; args?: string[]; env?: Record<string,string> }
  | { type: "http";  url: string; headers?: Record<string,string> }
  | { type: "sse";   url: string }
  | { type: "ws";    url: string };

/** JSON payload accepted by `claude --agents '<json>'`. */
type CliAgentsPayload = Record<string, SubagentDefinition>;

/** Built-in subagents Claude Code spawns automatically. */
type BuiltinSubagent =
  | "Explore"          // Haiku, read-only, codebase search
  | "Plan"             // inherits model, read-only, plan-mode research
  | "general-purpose"  // inherits model, all tools
  | "statusline-setup"
  | "Claude Code Guide";

/** Resolution order Claude Code uses when picking a subagent's model. */
type SubagentModelResolution = readonly [
  "CLAUDE_CODE_SUBAGENT_MODEL env var",
  "per-invocation `model` parameter",
  "definition's `model` frontmatter",
  "main conversation's model"
];
```

Example — three subagents declared inline at session launch (matches `--agents` syntax exactly):

```ts
const agents: CliAgentsPayload = {
  "code-reviewer": {
    name: "code-reviewer",
    description: "Expert code reviewer. Use proactively after code changes.",
    prompt: "You are a senior code reviewer. Focus on quality, security, best practices.",
    tools: ["Read", "Grep", "Glob", "Bash"],
    model: "sonnet",
    color: "green",
  },
  "debugger": {
    name: "debugger",
    description: "Debugging specialist for errors and test failures.",
    prompt: "You are an expert debugger. Find root causes and propose minimal fixes.",
    tools: ["Read", "Edit", "Bash", "Grep", "Glob"],
    model: "inherit",
  },
  "db-reader": {
    name: "db-reader",
    description: "Read-only DB analyst. Validates queries before exec.",
    tools: ["Bash"],
    hooks: {
      PreToolUse: [{
        hooks: [{
          if: "Bash(*)",
          type: "command",
          command: "./scripts/validate-readonly-query.sh",
        }],
      }],
    },
  },
};
```

---

## Programmatic Managed-Subagents SDK runbook (`CLAUDE_CODE_OAUTH_TOKEN`)

This is a runbook **for Claude Code in the macOS terminal** to programmatically generate code that drives the **Claude Agent SDK** as if it were a "managed subagents SDK," authenticated via `CLAUDE_CODE_OAUTH_TOKEN` (the long-lived token from `claude setup-token`). The pattern: each subagent definition becomes a `query()` invocation whose `agents:` map carries the same `SubagentDefinition` shape used on disk.

### 0. Auth primitive

```bash
# One-time, on the user's MacBook. Prints the token; nothing is persisted by Claude Code.
claude setup-token

# Store it in the macOS keychain rather than a dotfile:
security add-generic-password \
  -a "$USER" -s "claude-code-oauth-token" \
  -w "<paste token>" -U

# Read it at runtime (script, CI, launchd):
export CLAUDE_CODE_OAUTH_TOKEN="$(security find-generic-password -a "$USER" -s claude-code-oauth-token -w)"
```

> The token authenticates the Agent SDK against the user's Max-plan Claude Code entitlement. Per Anthropic's terms, do **not** redistribute it or expose it to third-party products.

### 1. CLI directive — tell Claude Code to write the SDK code

Run this from the project root:

```bash
claude \
  --permission-mode plan \
  --allow-dangerously-skip-permissions \
  --model claude-opus-4-7 \
  --add-dir ./src ./scripts \
  --append-system-prompt-file ./prompts/sdk-author.md \
  --agents "$(cat ./agents/authoring.json)" \
  -p "Generate src/managed-subagents.ts implementing the Managed Subagents SDK \
     using @anthropic-ai/claude-agent-sdk. Auth must read CLAUDE_CODE_OAUTH_TOKEN \
     from process.env. Each registered subagent uses the SubagentDefinition shape. \
     Expose run(name, prompt) and runMany(specs[])."
```

### 2. Authoring subagent (`agents/authoring.json`)

```json
{
  "doc-scout": {
    "description": "Read-only researcher. Pulls canonical names from code.claude.com/docs/llms.txt.",
    "prompt": "Fetch and quote only canonical names, env vars, and flag names from llms.txt-linked pages. Never invent fields.",
    "tools": ["Read", "Glob", "Grep", "WebFetch"],
    "model": "haiku"
  }
}
```

### 3. Target file Claude Code should produce — `src/managed-subagents.ts`

```ts
import { query, type ClaudeAgentOptions, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

export interface SubagentSpec extends AgentDefinition {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  model?: "sonnet" | "opus" | "haiku" | "inherit" | string;
  permissionMode?: "default" | "acceptEdits" | "plan" | "auto" | "dontAsk" | "bypassPermissions";
}

const TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
if (!TOKEN) {
  throw new Error("CLAUDE_CODE_OAUTH_TOKEN is required. Run `claude setup-token`.");
}

export class ManagedSubagents {
  constructor(private readonly registry: Record<string, SubagentSpec>) {}

  private optionsFor(name: string, extra?: Partial<ClaudeAgentOptions>): ClaudeAgentOptions {
    const spec = this.registry[name];
    if (!spec) throw new Error(`Unknown subagent: ${name}`);
    return {
      allowedTools: ["Read", "Glob", "Grep", "Agent", ...(spec.tools ?? [])],
      permissionMode: spec.permissionMode ?? "acceptEdits",
      agents: { [name]: spec },
      ...extra,
    };
  }

  async run(name: string, prompt: string): Promise<string> {
    let result = "";
    for await (const msg of query({
      prompt: `Use the ${name} subagent: ${prompt}`,
      options: this.optionsFor(name),
    })) {
      // @ts-expect-error
      if (msg.result) result = msg.result;
    }
    return result;
  }

  async runMany(specs: Array<{ name: string; prompt: string }>): Promise<string[]> {
    return Promise.all(specs.map(({ name, prompt }) => this.run(name, prompt)));
  }
}

export const defaultRegistry: Record<string, SubagentSpec> = {
  "code-reviewer": {
    name: "code-reviewer",
    description: "Read-only senior code reviewer.",
    prompt: "Review diffs for quality, security, and best practices. Output prioritized findings.",
    tools: ["Read", "Grep", "Glob", "Bash"],
    model: "sonnet",
  },
  "debugger": {
    name: "debugger",
    description: "Root-cause debugger with edit access.",
    prompt: "Diagnose the failure, propose a minimal fix, then verify.",
    tools: ["Read", "Edit", "Bash", "Grep", "Glob"],
    model: "inherit",
    permissionMode: "acceptEdits",
  },
};
```

### 4. Hardening checklist

- Never embed the token literal — only read `process.env.CLAUDE_CODE_OAUTH_TOKEN`.
- Reject definitions that set `permissionMode: "bypassPermissions"` unless the caller explicitly opts in.
- Apply `disallowedTools` first when both lists are present.
- Treat any subagent prompt sourced from web or doc content as untrusted.
- Default `model` to `"inherit"`.

### 5. CI variant

```yaml
# .github/workflows/managed-subagents.yml
env:
  CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
steps:
  - run: npm ci
  - run: npx tsx scripts/run-review.ts
```
