# subagent-orchestrator — Project Plan

Generated 2026-04-26. The TypeScript orchestrator program. Lives on the user's MacBook. Dispatches work to web/CLI sessions, watches outcomes, gates merges. Operationalizes the design in `../CLAUDE_CLI_MAX_PLAN_AGENT_AS_AUTONOMOUS_WEB_PR_ORCHESTRATOR_PLAN.md`.

---

## 0. Role

Standalone Node.js program. Single-machine, single-user. Reads tasks from `tasks.toml`, classifies disposition (local / ultraplan / autofix / direct-web / @claude-mention), launches the chosen path, watches via `Monitor` / `gh` / `/loop`, runs `/review` (always) and `/ultrareview` (when warranted), comments on the resulting PR.

Authenticated by `CLAUDE_CODE_OAUTH_TOKEN` from the user's macOS keychain (per `subagent-commands/whats-new/2026wk13/claude-code-week13.md`). Same token authenticates every action: CLI sessions, programmatic Agent SDK calls, web-session launches.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript 5.x | Matches the W13 SDK runbook; matches `subagent-typescript/` for primitive sharing |
| Runtime | Node.js ≥ 20 | Required for `@anthropic-ai/claude-agent-sdk` |
| SDK | [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) | Native programmatic interface; Subagent + agent-team semantics |
| GitHub | [`@octokit/rest`](https://www.npmjs.com/package/@octokit/rest) | PR fetch, comment, label; `gh` shellouts as fallback |
| CLI parser | [`commander`](https://www.npmjs.com/package/commander) | Standard, small, no surprises |
| TOML | [`@iarna/toml`](https://www.npmjs.com/package/@iarna/toml) | `tasks.toml` parser |
| Storage | SQLite via [`better-sqlite3`](https://www.npmjs.com/package/better-sqlite3) | `~/.claude/orchestrator.db` for telemetry / state |
| Test | [`vitest`](https://vitest.dev/) | Same as `subagent-typescript/` |
| Lint / format | [`@biomejs/biome`](https://biomejs.dev/) | Zero-config, ruff-fast |

---

## 2. Repo layout

```
subagent-orchestrator/
├── README.md
├── PROJECT_PLAN.md             # this file
├── package.json
├── tsconfig.json
├── biome.json
├── .gitignore
├── tasks.toml                  # input source v0.1
├── src/
│   ├── index.ts                # entrypoint: `subagent-orchestrator`
│   ├── orchestrator.ts         # main loop
│   ├── classify.ts             # disposition classifier (local|ultraplan|autofix|web|claude-mention)
│   ├── dispatch/
│   │   ├── local.ts            # spawn local Agent SDK query()
│   │   ├── ultraplan.ts        # /ultraplan via SDK
│   │   ├── autofix.ts          # /autofix-pr via SDK
│   │   ├── web.ts              # direct web session
│   │   └── claude-mention.ts   # `gh pr comment` with @claude
│   ├── watch/
│   │   ├── monitor.ts          # via Monitor tool
│   │   ├── gh.ts               # `gh pr checks --watch`
│   │   └── loop.ts             # /loop self-paced
│   ├── review/
│   │   ├── local.ts            # /review on PR
│   │   └── ultra.ts            # /ultrareview gate
│   ├── store/
│   │   ├── tasks.ts            # tasks.toml parser
│   │   ├── db.ts               # SQLite telemetry
│   │   └── auth.ts             # keychain → CLAUDE_CODE_OAUTH_TOKEN
│   └── types.ts                # Task, Disposition, TaskResult, ReviewFindings
├── tests/
│   ├── classify.test.ts
│   ├── dispatch/
│   └── fixtures/
└── scripts/
    ├── install.sh              # `claude setup-token` reminder + keychain check
    └── status.sh               # `gh pr list` + orchestrator.db query
```

---

## 3. Milestones

| # | Deliverable | Done when | Estimated |
|---|---|---|---|
| **M0 (this PR)** | Scaffold only | This PR's files exist; `tsc --noEmit` passes; no orchestrator logic yet | done |
| M1 | `tasks.toml` parser + Task types | `subagent-orchestrator tasks list` prints tasks from TOML | 2h |
| M2 | `classify.ts` + tests | Classifier returns one of 5 dispositions for each fixture task | 3h |
| M3 | `dispatch/local.ts` (Agent SDK `query()` + `agents:` registry) | Dispatching a "describe this repo" task returns a string from Opus 4.7 | 4h |
| M4 | `watch/gh.ts` + `review/local.ts` | After dispatch, the orchestrator watches the resulting PR and posts a `/review` comment | 4h |
| M5 | `dispatch/claude-mention.ts` | Dispatching a task as `@claude pr comment` fires the Action workflow on the repo (verify in Actions tab) | 3h |
| M6 | `dispatch/ultraplan.ts` + `dispatch/autofix.ts` | Both spawn web sessions and return their session URLs | 4h |
| M7 | `store/db.ts` SQLite telemetry | Every dispatch writes a row; `subagent-orchestrator stats` queries them | 2h |
| M8 | Hard rails (no auto-merge to main, concurrency cap, circuit breaker) | All §5 rails enforced with tests | 3h |
| M9 | E2E run: dispatch a real task → PR opened → reviewed → human merges | One full loop completes end-to-end against a test branch | 2h |

Total to v0.1: **~27h**.

---

## 4. v0.1 scope

What v0.1 *does*:
- Read tasks from `tasks.toml`
- Classify into one of 5 dispositions
- Dispatch via local Agent SDK or `@claude` mention (M3+M5)
- Watch the resulting PR via `gh`
- Post `/review` results as a PR comment
- **Never auto-merge**

What v0.1 *does not*:
- Read tasks from external systems (Linear, GitHub Issues) — v0.2
- Auto-merge — v0.3
- Spawn >1 task concurrently — v0.2
- Run unattended for days — early versions need eyeballing

---

## 5. Hard rails (built-in, can't be disabled by config)

| Rail | Mechanism |
|---|---|
| Never auto-merge to `main` | hardcoded `BLOCKED_AUTO_MERGE_BRANCHES = ['main', 'master']` |
| Never use `/ultrareview` without confirmation when free runs exhausted | check `/extra-usage` state; refuse without explicit `--paid-ultrareview` flag |
| Never spawn >N concurrent web sessions | `MAX_CONCURRENT = 3`, configurable via `--max-concurrent` |
| Always log every disposition + every PR action | `~/.claude/orchestrator.db`, rotated daily |
| Auto-pause on N consecutive failures | circuit breaker — opens GitHub issue tagged `orchestrator-paused` |

---

## 6. Authentication

Single source: `CLAUDE_CODE_OAUTH_TOKEN` from macOS keychain.

```bash
# One-time setup
claude setup-token

# Stored in keychain
security add-generic-password -a "$USER" -s "claude-code-oauth-token" -w "<token>" -U

# Read at runtime by src/store/auth.ts
export CLAUDE_CODE_OAUTH_TOKEN="$(security find-generic-password -a "$USER" -s claude-code-oauth-token -w)"
```

`src/store/auth.ts` reads from the keychain at startup. If absent, prints the `claude setup-token` instructions and exits non-zero.

---

## 7. Telemetry

`~/.claude/orchestrator.db` schema:

```sql
CREATE TABLE dispatch_log (
  id INTEGER PRIMARY KEY,
  task_id TEXT NOT NULL,
  disposition TEXT NOT NULL,
  dispatched_at TEXT NOT NULL,
  pr_url TEXT,
  pr_number INTEGER,
  pr_merged_at TEXT,
  review_finding_count INTEGER,
  ultrareview_used INTEGER NOT NULL DEFAULT 0,
  cost_usd_estimate REAL,
  status TEXT NOT NULL CHECK (status IN ('dispatched','reviewing','ready-for-merge','needs-human','failed','merged'))
);

CREATE INDEX idx_dispatch_log_status ON dispatch_log(status, dispatched_at DESC);
```

Surfaced by `subagent-orchestrator stats`.

---

## 8. Open decisions (deferred to M0+1)

1. **Auto-merge policy** — never (v0.1 default), or per-task opt-in via `automerge: true` in TOML
2. **Where review results post** — PR comment (default), Slack DM, both?
3. **Concurrency cap default** — 1 (v0.1 conservative) or 3 (matches the §5 hard cap)

---

## 9. Status

This PR (M0) ships the scaffold only — no logic. Subsequent PRs implement M1 through M9 in order.
