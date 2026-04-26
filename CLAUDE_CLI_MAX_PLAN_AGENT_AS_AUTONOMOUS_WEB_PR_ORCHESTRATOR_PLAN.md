# CLAUDE_CLI_MAX_PLAN_AGENT_AS_AUTONOMOUS_WEB_PR_ORCHESTRATOR_PLAN.md

Generated 2026-04-26. Sibling plan to `CLI_COWORK_PLAN.md`. Where that plan covers shared persistent state across CLI / Cowork / web, this plan covers **the loop**: a Max-plan CLI agent that delegates work to autonomous web sessions which produce PRs back to this repo.

The user's existing `subagent-commands/whats-new/2026wk13/claude-code-week13.md` already encodes the load-bearing primitive for this pattern: `CLAUDE_CODE_OAUTH_TOKEN` from keychain → drives the Agent SDK programmatically as a "Managed Subagents SDK." This plan operationalizes it.

---

## 1. The loop

```
              ┌──────────────────────────────────────────────┐
              │  CLI agent on MacBook (Max plan, Opus 4.7)   │
              │  - reads task from queue / cron / user       │
              │  - decides: do here, or hand to web?         │
              └──────┬───────────────────────────────────────┘
                     │
                     │  /ultraplan or /autofix-pr or
                     │  programmatic Agent SDK invocation
                     ▼
              ┌──────────────────────────────────────────────┐
              │  Anthropic-managed web session                │
              │  - runs in sandbox VM with allowlisted egress │
              │  - clones the repo, makes changes             │
              │  - opens a PR back to subagentapps/...        │
              └──────┬───────────────────────────────────────┘
                     │
                     │  PR opened
                     ▼
              ┌──────────────────────────────────────────────┐
              │  CLI agent watches the PR                    │
              │  - polls via gh / Monitor tool                │
              │  - on PR ready: runs /review locally         │
              │  - on confidence: runs /ultrareview cloud    │
              │  - on green: comments, optionally merges     │
              └──────────────────────────────────────────────┘
```

The web session is the **autonomous worker**. The CLI agent is the **orchestrator** — it picks tasks, hands them off, watches outcomes, and gates merges.

---

## 2. The four building blocks

### 2.1 Authentication: `CLAUDE_CODE_OAUTH_TOKEN`

Generated once via `claude setup-token`. Stored in macOS keychain (per the W13 doc):

```bash
security add-generic-password -a "$USER" -s "claude-code-oauth-token" -w "<token>" -U
```

Read at runtime:

```bash
export CLAUDE_CODE_OAUTH_TOKEN="$(security find-generic-password -a "$USER" -s claude-code-oauth-token -w)"
```

Same token authenticates: CLI sessions, programmatic Agent SDK calls, and the orchestrator's web-session-launches (`/ultraplan`, `/autofix-pr` use this OAuth chain).

### 2.2 Web-session launchers (CLI commands)

| Command | Spawns | Best for |
|---|---|---|
| `/ultraplan <prompt>` | Web session in plan mode → produces a plan to review in browser | Architectural design tasks |
| `/autofix-pr [prompt]` | Web session that watches a PR's CI + reviews and pushes fixes | "Get this PR green" |
| Programmatic SDK | Custom-shaped session via `query()` with `agents:` registry | Anything else |

These are the three on-ramps from CLI to web.

### 2.3 Watchers (CLI tools)

| Tool | Use for |
|---|---|
| `Monitor` (v2.1.98+) | Watch a long-running cloud session; stream events back as transcript messages |
| `gh pr checks --watch <PR>` via Bash | Wait for CI to complete on the PR the web session opened |
| `/loop` with self-paced interval | Re-check PR state every few minutes until merged or stuck |
| `CronCreate` | Schedule a check 1h/1d/1w out (max 7-day session-scoped expiry) |

Use `Monitor` first; fall back to `/loop`+`gh` for longer-horizon watches.

### 2.4 Reviewers

| Tool | Use when |
|---|---|
| `/review [PR]` | Local single-pass — fast, cheap |
| `/ultrareview [PR]` | Cloud multi-agent — slow, deeper, costs $5–20 after 3 free runs |

Default: always `/review`; escalate to `/ultrareview` for "this PR touches load-bearing code" or "I want pre-merge confidence."

---

## 3. The orchestrator program (sketch)

A Python or TypeScript program living in this repo (suggested location: `subagent-orchestrator/`) that runs continuously on the MacBook and:

1. **Reads task queue** — could be a TOML file, Linear backlog via MCP, or `~/.claude/tasks.jsonl`
2. **Per task, classifies disposition:**
   - "Do locally" — short / safe / read-only → CLI session
   - "Plan in cloud, execute locally" → `/ultraplan` then teleport back
   - "Do entirely in cloud" → `/autofix-pr` or direct `--remote` session
3. **Launches the chosen path**
4. **Watches** (Monitor / gh / loop) until completion
5. **On completion:** runs `/review` (always), `/ultrareview` (when warranted)
6. **On reviewer-clean:** comments approval, optionally auto-merges (only if the task class permits — most don't)

Pseudocode:

```python
async def orchestrate_one(task: Task) -> TaskResult:
    disposition = classify(task)  # local | ultraplan | autofix | direct-web
    pr = None
    if disposition == "local":
        pr = await run_local(task)
    elif disposition == "ultraplan":
        plan = await ultraplan(task.prompt)
        pr = await execute_plan(plan, where=plan.preferred_execution_target)
    elif disposition == "autofix":
        pr = await autofix_pr(task.target_branch, task.prompt)
    elif disposition == "direct-web":
        pr = await launch_web(task.prompt, repo=task.repo)

    await wait_for_pr_ready(pr)             # Monitor or /loop + gh
    review = await local_review(pr)
    if review.ok:
        return TaskResult(status="ready-for-merge", pr=pr)
    if task.deep_review_requested:
        ultra = await ultrareview(pr)
        if ultra.ok:
            return TaskResult(status="ready-for-merge", pr=pr)
    return TaskResult(status="needs-human", pr=pr, findings=[review, ultra])
```

The orchestrator is **single-machine, single-user** (this MacBook). No cluster, no Cloudflare deploy required. It uses the same `CLAUDE_CODE_OAUTH_TOKEN` for every action.

---

## 4. Task classification heuristics

Decides which disposition to use:

| Task signal | Recommended disposition |
|---|---|
| "Read-only investigation" | local |
| "Run tests / lint / format" | local |
| "Architectural design / multi-step plan" | ultraplan → execute on web |
| "Fix CI failures on existing PR" | autofix |
| "Write a feature from spec" | direct-web (or ultraplan first) |
| "Migrate a config across N repos" | direct-web with isolation: worktree |
| "Bug bash an entire branch" | ultrareview (skip local) |

Heuristics live in `subagent-orchestrator/classify.py` (or `.ts`). Start naive (regex on task title), refine with telemetry.

---

## 5. Safety rails

The orchestrator has elevated capabilities — `CLAUDE_CODE_OAUTH_TOKEN` + `gh` permissions + auto-merge potentially. Hard rails:

| Rail | Mechanism |
|---|---|
| Never auto-merge to `main` | `auto_merge_branches` allowlist in orchestrator config; `main` is excluded |
| Never push to `main` | hooks in `~/.claude/settings.json` block `git push origin main` |
| Never use `/ultrareview` without confirmation when free runs are exhausted | check `/extra-usage` state first |
| Never spawn >N concurrent web sessions | hard cap = 3 (configurable) |
| Always log every disposition + every PR action | `subagent-orchestrator/orchestrator.log` (rotated daily) |
| Auto-pause on N consecutive failures | circuit breaker — opens a manual-review issue |

---

## 6. Telemetry

Track:

- Tasks orchestrated per day, broken down by disposition
- Local-review pass rate vs ultrareview pass rate
- Time-to-PR-merged distribution
- Cost per task (tokens via `/cost`, ultrareview via $5–20 billing)
- Disposition accuracy (manual flag: was the chosen disposition right?)

These live in a small SQLite DB at `~/.claude/orchestrator.db`. Surface them via a `subagent-orchestrator stats` CLI subcommand.

---

## 7. Initial scope (v0.1)

What the orchestrator *can* do at v0.1:

- Read tasks from a local TOML file (`subagent-orchestrator/tasks.toml`)
- Classify into one of the four dispositions
- Launch + watch + review
- Comment on the PR with review results
- **Never auto-merge**

What it *cannot* do at v0.1:

- Read tasks from external systems (Linear, GitHub Issues) — that's v0.2
- Auto-merge — that's v0.3
- Spawn >1 task concurrently — that's v0.2
- Run unattended for days — early versions need a human eyeballing the log

v0.1 is essentially a "watch this PR until it's ready, then ping me" tool. Everything else accretes.

---

## 8. Where this lives in the repo

Suggested:

```
managed-subagents/
├── subagent-orchestrator/      # this plan's deliverable
│   ├── PROJECT_PLAN.md
│   ├── orchestrator.py / .ts
│   ├── classify.py / .ts
│   ├── tasks.toml              # initial input source
│   └── orchestrator.log        # rotated daily
├── subagent-typescript/        # the recurring crawler
├── subagent-python/            # the backfill crawler
└── subagent-cowork/            # plugin reference (this PR)
```

`subagent-orchestrator/` is its own subproject. v0.1 is intentionally tiny (a few hundred lines) so it's easy to verify and gate.

---

## 9. Open decisions

1. **Language for the orchestrator** — Python (matches `subagent-python/`) or TypeScript (matches `subagent-typescript/` and the W13 SDK runbook). I'd default to TypeScript because the W13 runbook already targets it.
2. **Task source v0.1** — TOML file (recommended) or direct CLI invocation
3. **Auto-merge policy** — never (v0.1 default), or "for tasks tagged `automerge: true` only"
4. **Concurrency cap** — 1 (v0.1) or 3 (v0.2)
5. **Where review results post** — PR comment (default), Slack DM, both?

---

## 10. Status

Awaiting decisions §9. Then `subagent-orchestrator/` becomes a sibling subproject with its own `PROJECT_PLAN.md` mirroring the shape of `subagent-typescript/PROJECT_PLAN.md`.
