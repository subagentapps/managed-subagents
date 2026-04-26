# SESSION_2026-04-26_BILLING_EVENT.md

Records the cost-cap event hit during the autonomous orchestration speed-run on 2026-04-26. Companion to `SESSION_HISTORY.md`. Captured for future capacity planning.

---

## Timeline

| UTC | Event |
|---|---|
| 21:25 | PR #1 (workflow install) merged — auto-review pipeline live |
| 21:42 | PR #2 (74 files, +12.6k lines) merged — first big Sonnet review ($1.15) |
| 21:45 | PR #4 merged — pinned auto-review to **Opus 4.7** |
| 21:51 | PR #5 — first Opus review ($0.99) |
| 22:23 | PR #8 (M2 classifier) — Opus reviewed, $1.29 |
| 22:42 | Speed-run mode enabled — parallel branches, 6 PRs in flight |
| 22:53 | PR #17, #18 reviewed; running Opus mean ~$1.12 |
| 23:08 | PR #25 (CI tweak) — anti-tamper failure (workflow self-mod), expected |
| **23:12** | **PR #26 (M8 hard rails) — REAL FAILURE: "You've hit your org's monthly usage limit"** |
| 23:46 | PR #27 (CLI dispatch) — same monthly-cap failure |
| 23:51 | PR #27 merged on local-verify only (auto-review offline) |

## Cost ledger

| Surface | Cost | Notes |
|---|---|---|
| GitHub Action auto-reviews (Sonnet ×2) | $1.84 | PRs #2, #3 before Opus pin |
| GitHub Action auto-reviews (Opus 4.7 ×15 successful) | ~$16.78 | Mean $1.12, range $0.70–$1.47 |
| Workflow self-tamper skips (PRs #4, #9, #25) | $0.00 | GitHub anti-tampering, expected |
| **Cap-blocked reviews (PRs #26, #27)** | **$0.00** | Action failed before Claude invocation |
| `/ultrareview` runs | $0.00 | Never invoked; 3 free runs intact through 2026-05-05 |
| **Auto-review subtotal** | **~$18.62** | over 17 successful reviews |
| CLI session (this Opus 4.7 1M context) | not measurable here | counted toward Max plan, separate from auto-review extra-usage |

## What hit the cap

Per the failure message, "**your org's monthly usage limit**" was tripped. This is the Claude Code paid-extra-usage cap, distinct from the Max plan's included usage. The Max plan covers your interactive CLI sessions; the `claude-code-action` running on GitHub charges against extra-usage with a separately-configurable cap.

The audit's projection (~$23 for the session) was within the per-review trend but apparently exceeded the org's configured monthly cap which had likely accumulated other usage before this session.

## Effects of the cap

While the cap is in effect:

- ❌ `claude-code-review.yml` workflow runs but exits with `is_error: true` after invoking Claude
- ❌ Any `@claude` mention in PR/issue comments via the action workflow will fail the same way
- ❌ Programmatic Agent SDK `query()` calls from `subagent-orchestrator/src/dispatch/local.ts` (M3) would hit the same wall
- ✅ Interactive CLI sessions (this one) continue under the Max plan
- ✅ Local typecheck/test/lint — no Anthropic API involved
- ✅ Git operations, gh PR ops — no Anthropic API involved

## Rollover

Per Anthropic's billing model, monthly caps reset on the **first day of the next billing month** in the org's timezone. This session's cap likely resets ~2026-05-01 UTC (a few days from this writing). Until then, auto-review on PRs is offline.

## Mitigations applied

| Mitigation | PR | Effect |
|---|---|---|
| Pin auto-review to Opus 4.7 | #4 | Higher per-review cost ($0.10 → $1.12) but ~10× signal |
| Skip lockfile / image / changelog-only PRs | #9 | Saves ~$1/PR for those types |
| Skip `**/docs/**`, `**/M*-*.md`, project-memory MD | #25 | Would have saved ~$4.87 over PRs #10/#13/#18/#20 |

## Mitigations to apply when cap resets

1. **Increase the org's monthly extra-usage cap** OR set a per-day rate limit at Anthropic's billing console — caps the damage, doesn't block first-day work.
2. **Add `if: github.event.pull_request.user.login == 'admin-jadecli'`** to the auto-review workflow — only review PRs *I* open. Saves cost on dependabot / random contributor PRs.
3. **Sonnet for `**/*.md` / `*.toml` / `*.yml` PRs**, Opus for `**/*.{ts,tsx,js,py}`. Per-path model selection. Implementation: ~10 lines in workflow.
4. **Debounce `synchronize`** events: only review on `opened` + `ready_for_review`. Saves cost when force-pushing fixes to an already-reviewed PR.
5. **Set `permission_denials_count` budget**: if Opus does >20 denials, kill the run early. Saw 28 denials on the lockfile review (PR #7) for $0; the review was useless work.

## Lessons learned

| Lesson | Evidence |
|---|---|
| **Spec/docs PRs have near-zero ROI on Opus review** | PRs #10, #13, #18, #20 all 0 findings; ~$4.87 burned |
| **Lockfile reviews are pure waste** | PR #7: $1.33, 28 denials, 0 useful output |
| **Opus per-review variance is low** | $0.70–$1.47, mean $1.12, σ ≈ $0.20 |
| **Anti-tampering protects against workflow self-modification** | PRs #4, #9, #25 — expected, safe |
| **The orchestrator's own M3 dispatch shares the same budget** | Building an orchestrator that uses Opus to review PRs that build an orchestrator that uses Opus is a feedback loop — needs explicit budget allocation |

## Action items for next session (when cap resets)

- [ ] Apply Sonnet-for-docs split to `claude-code-review.yml`
- [ ] Add author-allowlist filter
- [ ] Debounce `synchronize` events
- [ ] Investigate per-token-budget setting on the action
- [ ] Consider running PR auto-review through the local CLI (Max plan budget) instead of the action (extra-usage budget) — `gh pr view <PR> | claude /review` from a cron Worker; tradeoffs in `CLI_COWORK_PLAN.md`-style decision

## See also

- `SESSION_HISTORY.md` — the broader session arc
- `subagent-orchestrator/CLAUDE.md` — already documents the $0.90–$1.30 per-PR Opus expectation
- The audit summary printed mid-session (in chat history) — this doc captures it durably
