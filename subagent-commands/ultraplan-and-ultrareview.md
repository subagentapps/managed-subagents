# /ultraplan and /ultrareview

Generated 2026-04-26. Research notes on the two cloud-execution slash commands, captured from `code.claude.com/docs/en/ultraplan.md` and `ultrareview.md`.

These are the two CLI on-ramps to *Claude Code on the web* infrastructure. They share a precondition (Claude.ai account, GitHub repo, not on Bedrock/Vertex/Foundry) but solve different problems.

---

## /ultraplan — plan in the cloud

Hands a planning task from the local CLI to a `claude-code-on-the-web` session running in **plan mode**. Claude drafts the plan in the cloud while your terminal stays free.

**Available since:** v2.1.91 (research preview)

### Three ways to launch

| Pattern | Example |
|---|---|
| Slash command | `/ultraplan migrate auth from sessions to JWTs` |
| Keyword | `we should ultraplan the migration` (anywhere in a normal prompt) |
| From a local plan | After `ExitPlanMode` shows the approval dialog, choose **"No, refine with Ultraplan on Claude Code on the web"** |

The first two paths show a confirmation dialog. The third skips it (the menu choice is the confirmation).

### Status indicators in the prompt bar

| Indicator | Meaning |
|---|---|
| `◇ ultraplan` | Researching codebase + drafting |
| `◇ ultraplan needs your input` | Has a clarifying question — open the session link |
| `◆ ultraplan ready` | Ready to review in the browser |

`/tasks` shows the ultraplan entry with session link and a "Stop ultraplan" action.

### The browser review surface

- **Inline comments** on any passage
- **Emoji reactions** to signal approval / concern
- **Outline sidebar** for navigation
- Iterate until satisfied

### Three execution choices (from the browser)

| Choice | What happens |
|---|---|
| **Approve and start coding** | Claude implements in the same web session → opens a PR from the web interface |
| **Approve and teleport back to terminal** | Web session archived; terminal opens "Ultraplan approved" dialog |
| **(in terminal dialog) Implement here** | Inject plan into current conversation, continue |
| **(in terminal dialog) Start new session** | Clear conversation, begin fresh with only the plan |
| **(in terminal dialog) Cancel** | Save plan to a file, print the path |

### When to use

- Architectural design ("design the migration before we touch code")
- Plans you want to share for human review (browser markup is better than terminal)
- Plans you'd otherwise spend an hour tweaking in plan mode locally — let it run while you work

### When NOT to use

- "Quick fix this typo" — the cloud round-trip is overkill
- Anything Bedrock / Vertex / Foundry — unsupported
- Anything where you can't tolerate web-allowlist restrictions on what the plan can reference

---

## /ultrareview — find bugs in the cloud

Deep multi-agent code review in a remote sandbox. Compared to local `/review`:

| Aspect | `/review` (local) | `/ultrareview` (cloud) |
|---|---|---|
| Runs | locally | remote sandbox |
| Depth | single-pass | multi-agent fleet, independent verification |
| Duration | seconds to minutes | 5–10 minutes |
| Cost | normal usage | 3 free runs (Pro/Max), then $5–20/run as extra usage |
| Best for | quick feedback while iterating | pre-merge confidence on substantial changes |

**Available since:** v2.1.86 (research preview)

### Two invocation modes

| Mode | Command | What gets reviewed |
|---|---|---|
| Branch | `/ultrareview` | Diff between current branch and default branch + uncommitted/staged changes |
| PR | `/ultrareview 1234` | Cloned from GitHub by PR number (requires `github.com` remote) |

If your repo is too large to bundle (branch mode), you'll be prompted to use PR mode — push and open a draft PR first.

### Pricing

| Plan | Free runs | After |
|---|---|---|
| Pro | 3 (one-time, expires May 5 2026) | $5–20/run as extra usage |
| Max | 3 (one-time, expires May 5 2026) | $5–20/run as extra usage |
| Team / Enterprise | none | $5–20/run as extra usage |

Extra usage must be enabled before the launch is permitted. Check / change with `/extra-usage`.

### Output

Verified findings appear as a notification when the review completes (5–10 min). Each finding has a file location and an explanation. Ask Claude to fix any of them inline.

`/tasks` lets you see running and completed reviews and stop in-progress ones (which discards partial findings).

### When to use

- Before merging a substantial change
- When you want a deeper sweep than `/review` does
- When you suspect a class of bugs (race conditions, security, cross-module interactions) that single-pass review misses

### When NOT to use

- Style nits — `/review` is better, `/ultrareview` filters those out
- Anything Bedrock / Vertex / Foundry — unsupported
- Zero Data Retention orgs — unsupported

---

## How they pair with this repo

Both are first-class building blocks for `CLAUDE_CLI_MAX_PLAN_AGENT_AS_AUTONOMOUS_WEB_PR_ORCHESTRATOR_PLAN.md`:

- The orchestrator can launch `/ultraplan` for design tasks and `/ultrareview` as the deep-review gate before auto-merge
- The W13 SDK runbook (in `whats-new/2026wk13/claude-code-week13.md`) shows how to do the *same thing* programmatically via `query()` with `agents:`

For this repo's first use case (audit the merged PR after we land the cowork docs), `/ultrareview <PR>` is the canonical move. We have 3 free runs through May 5, 2026.

---

## See also

- `code.claude.com/docs/en/ultraplan.md` — upstream
- `code.claude.com/docs/en/ultrareview.md` — upstream
- `claude-code-on-the-web.md` — the underlying infra
- `../whats-new/2026wk13/claude-code-week13.md` — programmatic SDK pattern (orchestrator-friendly)
