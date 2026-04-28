# CLAUDE.md — subagent-orchestrator

Project-local instructions for Claude Code when working inside `subagent-orchestrator/`.

## Posture

This subdirectory is a **TypeScript Node CLI** that orchestrates dispatching tasks to web/CLI/@-mention surfaces, watching the resulting PRs, gating merges. It runs on the user's MacBook only. Authenticated via `CLAUDE_CODE_OAUTH_TOKEN` (env or macOS keychain).

Read [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) for the full milestone roadmap (M0–M9). Read [`docs/M3-dispatch-local.md`](./docs/M3-dispatch-local.md) before touching `src/dispatch/local.ts`.

## Conventions

- **Strict TypeScript.** `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noPropertyAccessFromIndexSignature` are all on. `tsc --noEmit` must pass before commit.
- **ESM only.** All imports include the `.js` suffix (resolves to `.ts` source via bundler resolution).
- **Vitest for tests.** Mock external SDK calls with the `SdkOverride` pattern in `dispatch/local.ts` — never hit a real API in tests.
- **Each public function gets a unit test.** Add to `tests/<area>/<name>.test.ts`.
- **Errors are typed.** `AuthError`, `TaskParseError`, `DispatchError` — extend `Error` with a `name`.

## Workflow

1. Branch from `main`: `git checkout -b feat/orchestrator-<short-name>`
2. Write code + tests in the same change
3. `npm run typecheck && npm test` must both pass before push
4. Commit with conventional-commit prefix: `feat(orchestrator):` / `fix(orchestrator):` / `docs(orchestrator):` / `chore(orchestrator):`
5. PR opens; auto-review on Opus 4.7 fires (or skips per `.github/workflows/claude-code-review.yml` paths-ignore)
6. Merge with `gh pr merge --merge --delete-branch` (NOT squash — we keep granular history)

## Don't

- Don't run `npm install` if `package-lock.json` exists; use `npm ci` for reproducible installs.
- Don't add SDK calls to the orchestrator's main loop without a `maxBudgetUsd` cap. The default is $5/dispatch.
- Don't auto-merge to `main` from inside the orchestrator. v0.1 has a hard-coded block; will stay that way until M8 lands the rails properly.
- Don't add `Agent` or `Skill` to `allowedTools` of dispatched sessions. v0.1 disallows nested agent spawning and skill loading for predictability.
- Don't write `~/.claude/settings.json` from orchestrator code. Read-only — settings are user territory.

## Cost notes

Auto-review on Opus 4.7 averages **$0.90–$1.30 per PR** for typical 100–300 line changes. Lockfile / image / changelog-only PRs are skipped via `paths-ignore`. If a PR review goes >$3, investigate — likely Opus is doing too much exploratory tool use.

## Integration with the rest of the repo

- Orchestrator dispatches tasks that often produce PRs against this same repo or others under `subagentapps/`.
- Cowork plugins (see `../subagent-cowork/`) get invoked via the orchestrator's `dispatch/local.ts` once the cowork bridge (M3+) lands.
- The shared `connectors.toml` at repo root (see `../connectors.toml`) is consumed by the cowork bridge, not directly by the orchestrator.
- Sibling project: `../webapp/` — Vite + React + Cloudflare Workers app (`managedsubagents-web`). Served locally via `npm run dev` (Vite) or `npx wrangler dev` (Workers runtime). Deployed via `npx wrangler deploy`.
