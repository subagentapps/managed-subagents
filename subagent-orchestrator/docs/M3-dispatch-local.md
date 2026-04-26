# M3 spec — `dispatch/local.ts`

Spec for milestone M3 of `subagent-orchestrator/PROJECT_PLAN.md`. **No code yet.** This doc nails down the API shape, the testing strategy, and the cost / safety bounds *before* the implementation PR opens.

---

## 1. What M3 does

When `classify()` returns `disposition: "local"`, the orchestrator dispatches the task by spawning an **in-process** Claude Code session via the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) (`@anthropic-ai/claude-agent-sdk`). The session runs on the user's MacBook (CLI runtime), inherits the same `CLAUDE_CODE_OAUTH_TOKEN` from the keychain, and has tool permissions appropriate to the task.

This is the *first* dispatch path. M4-M6 add the cloud paths (autofix / ultraplan / web). M5 adds the `@claude-mention` path (which doesn't go through the SDK at all — it's a `gh pr comment` + the GitHub Action picks up).

**Output:** a `TaskResult` with the captured response text and any PR URL produced. Persisted to telemetry (M7).

---

## 2. API surface

### Public function

```ts
// subagent-orchestrator/src/dispatch/local.ts

import type { Task, TaskResult } from "../types.js";

export interface DispatchLocalOptions {
  /** Override CWD; defaults to process.cwd() */
  cwd?: string;
  /** Cap turns to bound cost; default 30 */
  maxTurns?: number;
  /** Cap budget per dispatch in USD; default $5; throws if exceeded mid-stream */
  maxBudgetUsd?: number;
  /** Inject a SDK client for testing; defaults to real query() */
  sdkOverride?: SdkOverride;
}

export interface SdkOverride {
  query: typeof import("@anthropic-ai/claude-agent-sdk").query;
}

export async function dispatchLocal(
  task: Task,
  options: DispatchLocalOptions = {},
): Promise<TaskResult>;
```

### Behavior

1. Reads `CLAUDE_CODE_OAUTH_TOKEN` from env (set by `src/store/auth.ts` per the W13 SDK runbook)
2. Builds `ClaudeAgentOptions`:
   - `prompt`: `task.prompt`
   - `allowedTools`: see §3 default tool grants below
   - `permissionMode`: `"acceptEdits"` for code-editing tasks, `"plan"` for read-only investigation, `"default"` otherwise — derived from `task.title`+`task.prompt` shape using the same regex hints as `classify.ts`
   - `cwd`: from `options.cwd` or `process.cwd()`
   - `maxTurns`: from `options.maxTurns` (default 30)
3. Calls `query()` and iterates the async generator, accumulating result text and tracking cost
4. Returns `TaskResult{ status, costUsdEstimate, ... }`

### Errors

- **`AuthError`**: `CLAUDE_CODE_OAUTH_TOKEN` missing → throw immediately, suggest `claude setup-token`
- **`BudgetExceededError`**: cost crosses `maxBudgetUsd` → abort the SDK loop, return partial result with `status: "failed"`
- **`SdkError`**: any error from `query()` → wrap with task context, return `status: "failed"`

---

## 3. Default tool grants

| Permission mode in task | allowedTools |
|---|---|
| Read-only / investigation (matches `local-or-test-language` regex) | `["Read", "Glob", "Grep", "Bash"]` |
| Code edits | `["Read", "Glob", "Grep", "Bash", "Edit", "Write"]` |
| Test/lint/format runs | `["Read", "Glob", "Grep", "Bash"]` |

Always disallow:
- `Agent` (no nested subagent spawning at v0.1)
- `Skill` (no skill invocation; predictable tool surface)
- `WebFetch`, `WebSearch` (M3 stays local; M4+ adds these per disposition)

`mcpServers`: empty for M3. M3.5 adds optional MCP loading from `~/.claude/settings.json`.

---

## 4. Cost / safety bounds

| Bound | Default | Why |
|---|---|---|
| `maxTurns` | 30 | Most tasks finish in 5-15 turns; 30 catches runaways |
| `maxBudgetUsd` | $5.00 | Bounds individual dispatch cost; can be raised per-task with TOML override (v0.2) |
| Wall-clock timeout | 10 min via `AbortController` | Prevents indefinite hangs |
| Concurrent dispatches | 1 (caller responsibility) | M3 is single-task-at-a-time; concurrency is M8 |

If any bound trips, returns `TaskResult{ status: "failed", error: "..." }`.

---

## 5. Testing strategy

The challenge: `query()` calls a paid API. Tests can't hit it.

### Unit tests (`tests/dispatch/local.test.ts`)

Use `sdkOverride.query` to inject a mock async generator. 8 cases:

1. Happy path: mock yields one assistant message + one result message → returns `status: "ready-for-merge"`
2. Multi-turn: mock yields N tool-use blocks → reads correctly, accumulates cost
3. Budget exceeded mid-stream: returns partial with `status: "failed"`
4. SDK throws: caught and wrapped
5. No `CLAUDE_CODE_OAUTH_TOKEN` env: throws `AuthError`
6. `permissionMode` resolution: read-only task → `"plan"`; code-edit task → `"acceptEdits"`
7. `allowedTools` resolution per mode (3 fixtures)
8. `maxTurns` capped

### Integration test (gated, off by default)

`tests/dispatch/local.live.test.ts` — opt-in via `RUN_LIVE_TESTS=1`, runs **one** real query against a known-cheap prompt ("count to 5"). Asserts non-empty result and cost < $0.05. Skipped in CI by default.

---

## 6. The `query()` API surface (per `@anthropic-ai/claude-agent-sdk` v0.2.x)

> Verified against `https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk` and the W13 doc's example code. May drift if SDK version bumps significantly.

```ts
import { query, type ClaudeAgentOptions } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Your prompt here",
  options: {
    allowedTools: ["Read", "Grep"],
    permissionMode: "acceptEdits",
    cwd: "/path/to/repo",
    maxTurns: 30,
    abortController: new AbortController(),
  } satisfies ClaudeAgentOptions,
})) {
  // message.type ∈ {"system", "user", "assistant", "result"}
  // message.subtype on "result": "success" | "error_max_turns" | "error_max_budget_usd" | ...
  if (message.type === "result") {
    finalResult = message.result;       // string
    finalCostUsd = message.total_cost_usd;  // number
    finalSessionId = message.session_id;
  }
}
```

**Important:** `query()` ignores any `model` param at the SDK level — it uses whatever model the user's CLI is configured for, OR `CLAUDE_CODE_SUBAGENT_MODEL` env. Per the W13 doc, the resolution order is:
1. `CLAUDE_CODE_SUBAGENT_MODEL` env var
2. Per-invocation `model` parameter (if SDK supports it; v0.2.x does NOT)
3. The subagent definition's `model` frontmatter
4. The main conversation's model

For M3 we don't pass `model`. The user's session model is used. Since the user is on Max with default Opus 4.7, that's what we get. Future tasks that need Haiku for cost-control can set `CLAUDE_CODE_SUBAGENT_MODEL=claude-haiku-4-5` in env.

---

## 7. What M3 explicitly does NOT do

- **No PR creation.** M3 dispatches a *task* (e.g., "investigate why X is slow"). It doesn't open PRs. PR-creation tasks should be classified as `claude-mention` (M5) or `web` (M6).
- **No PR review or merge.** That's M4 (`watch/`) + the orchestrator main loop (M9).
- **No telemetry write.** That's M7 (`store/db.ts`). M3 returns `costUsdEstimate` in `TaskResult`; the caller persists.
- **No concurrency.** M3 expects one dispatch at a time; the orchestrator's main loop (M9) serializes calls.

---

## 8. Implementation plan

PR shape when M3 ships:
- `src/dispatch/local.ts` (~80 LOC)
- `src/cli/dispatch-task.ts` (~40 LOC) — `subagent-orchestrator dispatch <task-id>` subcommand
- `src/index.ts` (+8 LOC)
- `src/store/auth.ts` (~30 LOC) — keychain reader (NEW; previously inline)
- `tests/dispatch/local.test.ts` (~150 LOC)
- `tests/dispatch/local.live.test.ts` (~30 LOC, gated)

Estimated diff: ~350 LOC. Estimated time: 4h (per the plan).

---

## 9. Open decisions before M3 implementation

1. **`maxBudgetUsd` default — $5 too high?** $1 forces tighter task scopes; $5 is comfortable. Keep $5 default; let users override per-task.
2. **What happens on `AuthError`?** Throw vs return failed result? **Throw.** Auth errors are programmer/setup errors, not task failures.
3. **Should the dispatch CLI be `dispatch <task-id>` (looks up TOML by id) or `dispatch <prompt>` (ad-hoc)?** Both. Two subcommands: `dispatch task <id>` and `dispatch prompt <text>`.
4. **Telemetry now or wait for M7?** Wait. M3 returns `TaskResult` with cost; caller persists in M7. Don't couple M3 to a DB schema that's still being designed.
