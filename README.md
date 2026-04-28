# managed-subagents

Repository for the Claude Code orchestration stack: a CLI orchestrator that dispatches tasks across CLI / web / `@claude`-mention surfaces, watches the resulting PRs, and gates merges; plus the supporting reference docs (Anthropic skills, Cowork plugins, MCP servers, crawler plans).

**Status:** v0.1 in active development. 90+ PRs merged on day-1; orchestrator scaffold + classifier + dispatchers + telemetry + hard rails + brutalist landing page all live. Production site at https://managedsubagents.com.

## Layout

| Path | What |
|---|---|
| [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) | Root project plan — subagent-docs corpus rationale + naming |
| [`SHARED_DATA_MODEL.md`](./SHARED_DATA_MODEL.md) | Entity/fact/dim/event schema for the crawler warehouse; D1 DDL; 25+ entity types; dbt boundary |
| [`CLI_COWORK_PLAN.md`](./CLI_COWORK_PLAN.md) | CLI ↔ Cowork ↔ web parity story; 3 viable DB architectures given the `claude-code-on-the-web` allowlist |
| [`CLAUDE_CLI_MAX_PLAN_AGENT_AS_AUTONOMOUS_WEB_PR_ORCHESTRATOR_PLAN.md`](./CLAUDE_CLI_MAX_PLAN_AGENT_AS_AUTONOMOUS_WEB_PR_ORCHESTRATOR_PLAN.md) | The orchestrator design |
| [`SESSION_HISTORY.md`](./SESSION_HISTORY.md) | Curated session arc + decisions |
| [`SESSION_2026-04-26_BILLING_EVENT.md`](./SESSION_2026-04-26_BILLING_EVENT.md) | Cost cap event from the speed-run session — lessons + mitigations |
| [`connectors.toml`](./connectors.toml) | `~~category` → MCP server resolution (consumed by the cowork bridge) |
| [`Makefile`](./Makefile) | `make help` for all common targets |

## Quick Start

See the live landing page at https://managedsubagents.com for the install flow. In short:

```bash
git clone https://github.com/subagentapps/managed-subagents.git
cd managed-subagents/subagent-orchestrator
npm ci && npm run build
node dist/index.js doctor
```

The orchestrator reads `tasks.toml` and dispatches each `[[task]]` to a CLI / web / `@claude`-mention surface. Run `node dist/index.js tasks list` to inspect the queue.

### Subprojects

| Path | Purpose |
|---|---|
| [`subagent-orchestrator/`](./subagent-orchestrator/) | The TypeScript CLI orchestrator. Has its own [`PROJECT_PLAN.md`](./subagent-orchestrator/PROJECT_PLAN.md) and [`CLAUDE.md`](./subagent-orchestrator/CLAUDE.md). 100+ vitest cases. |
| [`subagent-cowork/`](./subagent-cowork/) | 16 Cowork knowledge-work plugin docs + cli-cowork-bridge spec |
| [`subagent-skills/`](./subagent-skills/) | 13 Anthropic skill catalog deeplinks (10 from the screenshot + 3 references) |
| [`subagent-commands/`](./subagent-commands/) | Claude Code `/command` reference, sub-agents spec, weekly deep-dives (W13/W14/W15) |
| [`subagent-evaluations/`](./subagent-evaluations/) | Eval substrate (success-metrics, latency-budget, future-llm-integration) |
| [`subagent-hooks/`](./subagent-hooks/), [`subagent-plugins/`](./subagent-plugins/), [`subagent-sessions/`](./subagent-sessions/), [`subagent-tasks/`](./subagent-tasks/), [`subagent-tools/`](./subagent-tools/), [`subagent-channels/`](./subagent-channels/) | Primary Claude Code doc references |
| [`subagent-mcp-servers/`](./subagent-mcp-servers/) | MCP server triage + `install.sh` for the Tier 1 set |
| [`.github/workflows/`](./.github/workflows/) | `claude.yml` (@claude action) + `claude-code-review.yml` (auto-review on Opus 4.7) |

## Auto-review

Every PR opened against this repo triggers `claude-code-review.yml` running Claude Opus 4.7 with the `code-review` plugin from `anthropics/claude-code`. Auto-review:

- ✅ Runs on `*.ts`, `*.json`, `*.sh`, scripts, configs, etc.
- ⏭ Skips on `**/package-lock.json`, binary images, `**/CHANGELOG.md`, `**/docs/**`, project-memory `.md` files (per `paths-ignore` in the workflow)
- ⏭ Skips on workflow-self-modifying PRs (GitHub anti-tampering)

Cost: ~$1.12/PR average for code PRs (range $0.70–$1.47). Spec/docs PRs are now filtered out (PR #25). See [`SESSION_2026-04-26_BILLING_EVENT.md`](./SESSION_2026-04-26_BILLING_EVENT.md) for the cost-cap event.

## How to contribute

1. Branch off `main` with conventional prefix: `feat/`, `fix/`, `docs/`, `chore/`, `ci/`
2. Code + tests in the same change
3. `make typecheck && make test` before push
4. Open PR; auto-review fires
5. Merge with `gh pr merge --merge --delete-branch` (NOT squash — granular history)

See [`subagent-orchestrator/CLAUDE.md`](./subagent-orchestrator/CLAUDE.md) for orchestrator-specific conventions.

## License

[MIT](./LICENSE) — same as upstream `anthropics/skills`, `upstash/context7`, and the rest of the open ecosystem this repo participates in.
