# TASKS_TODO.md

Next-session pickup list. Captured 2026-04-27 at the end of the day-1 speed-run, after hitting the monthly Claude Code usage cap (see `SESSION_2026-04-26_BILLING_EVENT.md`). Anything that needed Anthropic API consumption was paused; this list captures everything that's queued.

Use as input to `subagent-orchestrator/tasks.toml` once the cap resets (~2026-05-01).

---

## Immediate (when cap resets)

| # | Task | Estimated | Notes |
|---|---|---|---|
| 1 | Update `claude-code-review.yml` with author allowlist + Sonnet-for-docs split | 1h | Per `SESSION_2026-04-26_BILLING_EVENT.md` action items |
| 2 | Investigate per-token-budget setting on `anthropics/claude-code-action` | 30m | If exists, set monthly cap visible to the workflow so it can short-circuit gracefully |
| 3 | Add `if: github.event.pull_request.user.login == 'admin-jadecli'` to `claude-code-review.yml` | 5m | Only review user-authored PRs |
| 4 | Restart Claude Code to pick up the 6 newly-installed MCP servers | 1m | Required for `github`, `filesystem`, `memory`, `sequential-thinking`, `redis`, `claude-trace` to register |
| 5 | Verify `redis` MCP server connects (no Redis running locally yet) | 15m | Start `docker run -d -p 6379:6379 redis:7` first; or swap to Upstash URL |

## Orchestrator implementation queue

| # | Task | Milestone | Estimated |
|---|---|---|---|
| 6 | Wire `dispatchUltraplan` + `dispatchAutofix` into `orchestrator.ts` main loop | M6.5 | 1h — currently they're separate dispatchers; main loop returns "failed" with explanatory error |
| 7 | Wire `dispatchClaudeMention` into main loop with PR/issue target resolution | M5.5 | 2h — currently main loop says "requires explicit target; not yet implemented" |
| 8 | Implement `dispatch web` (the 5th disposition) | M4 | 4h — direct web session via `--remote` flag |
| 9 | Wire `watch/gh.ts` predicates into main loop | M4.5 | 2h — currently dispatch returns immediately; watch loop comes after |
| 10 | Implement `review/local.ts` (run `/review` after dispatch) | M4 | 3h |
| 11 | Implement `review/ultra.ts` (gated by `task.deepReview` and `assertUltrareviewBudgetOk`) | M4 | 2h |
| 12 | Add `subagent-orchestrator monitor` subcommand using `Monitor` tool | M9.5 | 3h |

## M10 MCP App (orchestrator-dashboard)

Per `subagent-orchestrator/docs/M10-mcp-app-orchestrator-dashboard.md`. ~15h total across 7 sub-milestones. **Only start after the cap resets and after orchestrator dispatch surface is fully wired (items 6-11).**

| Sub-milestone | What |
|---|---|
| M10.0 | Bootstrap forking `server-basic-react` |
| M10.1 | `RecentDispatches.tsx` from local SQLite |
| M10.2 | `OpenPrs.tsx` via github MCP server |
| M10.3 | `CostBurnChart.tsx` (recharts) |
| M10.4 | `ActiveMonitors.tsx` polling Monitor tool |
| M10.5 | Claude theme integration |
| M10.6 | MCP App registration |

## Crawler implementation queue

Both `subagent-typescript/` and `subagent-python/` are plan-only (their `PROJECT_PLAN.md` files describe the full architecture). Implementation is its own multi-week effort.

Suggest starting with: **`subagent-python/scripts/backfill-anthropic-llms-full.sh`** — the simplest possible end-to-end test of the whole crawler concept (download `platform.claude.com/llms-full.txt`, snippet-split, write to D1 or local SQLite). 1 day work; validates the whole shape.

## Infrastructure decisions still open

From `CLI_COWORK_PLAN.md` §8:

| # | Decision | Default | Trigger to revisit |
|---|---|---|---|
| 13 | Pick A (AWS) vs B (AlloyDB) vs C (Neon hybrid) | C | When real-time web writes become required |
| 14 | `db.managedsubagents.com` CNAME target | (TBD) | When Postgres is stood up |
| 15 | Snapshot frequency for Option C | nightly | If web sessions need <24h staleness |
| 16 | MCP server registration script | not yet | When 3+ MCP servers need same config in CLI + Cowork + web |

## Hygiene / cleanup

| # | Task | Why |
|---|---|---|
| 17 | Add `LICENSE` (DONE in PR #31 — merge before next session) | Required before external collaboration |
| 18 | Add Apache-2 patent grant if license becomes Apache-2 | Patent grant matters for some downstream consumers |
| 19 | Add `CONTRIBUTING.md` | Even if it just points at README's contribution section |
| 20 | Add `CODE_OF_CONDUCT.md` | Standard for OSS repos |
| 21 | Add `SECURITY.md` | Specifies how to report vulnerabilities (this is also part of `subagentapps/managed-subagents` GitHub trust signals) |
| 22 | Add Dependabot config for npm + GitHub Actions | Auto-PRs for security updates; will be skipped by auto-review per PR #25 paths-ignore |
| 23 | Add CODEOWNERS to auto-tag review on subdir changes | Currently no review gating |
| 24 | Resolve workflow ##[error] noise: "Internal error: directory mismatch ... tsconfig.json" | Cosmetic — appears on every run; bug in `anthropics/claude-code-action@v1` |

## Known limitations of the orchestrator at v0.1

- **No concurrency** — `orchestrateAll` is sequential. M8 hard rails cap at 3 once concurrency lands.
- **No PR/issue auto-creation** — `dispatchClaudeMention` requires explicit `target: { kind: 'pr', prNumber: N }`. Auto-create is M5.5.
- **No retry on transient failures** — circuit breaker (M8) opens after N consecutive failures but doesn't retry individual ones.
- **No dependency resolution** — `task.dependsOn` is in the schema but `orchestrateAll` doesn't honor it yet. Trivial topo sort to add.
- **No webhook for notifications** — currently writes to dispatch_log; user discovers outcomes via `make status` or `subagent-orchestrator dispatch stats`.

## Documentation backlog

| # | Doc | Status |
|---|---|---|
| 25 | `M4-watch-gh.md` spec | TBD — pattern from M3-spec |
| 26 | `M5-claude-mention-target-resolution.md` spec | TBD — for the auto-create-issue work |
| 27 | `M9.5-monitor-subcommand.md` spec | TBD |
| 28 | `M10.x-*.md` per sub-milestone (7 docs) | TBD; pull from PROJECT_PLAN.md when starting each |
| 29 | `CONTRIBUTING.md` | TBD |
| 30 | `SECURITY.md` | TBD |

## Costs avoided this session via filtering

Per the audit + retroactive application of PR #25's expanded paths-ignore:

| If PR had run today, would have cost ~$1 of Opus | Was saved? |
|---|---|
| PR #10 (M3 spec — 185 lines docs) | Already paid pre-PR-#25 |
| PR #13 (CLAUDE.md — 44 lines docs) | Already paid pre-PR-#25 |
| PR #18 (MCP triage doc) | Already paid pre-PR-#25 |
| PR #20 (M10 spec — 99 lines docs) | Already paid pre-PR-#25 |
| Future docs PRs | ✅ skipped by PR #25 going forward |

## How to use this file in next session

```bash
# Read it
cat TASKS_TODO.md

# Pick an item; convert to a tasks.toml entry
# Then dispatch via the orchestrator (once cap resets):
subagent-orchestrator dispatch task <id>
```

Or feed any single item back to a future Claude Code session as a one-shot prompt.
