# subagent-orchestrator

CLI orchestrator program. Lives on the user's MacBook. Reads tasks from `tasks.toml`, classifies disposition (local / ultraplan / autofix / web / @claude-mention), dispatches via the Claude Agent SDK, watches the resulting PR, runs `/review`, posts findings.

**v0.1 status:** scaffold only. See [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) for the milestones (M0 through M9).

**Auth:** reads `CLAUDE_CODE_OAUTH_TOKEN` from the macOS keychain. Per `../subagent-commands/whats-new/2026wk13/claude-code-week13.md`, generated once via `claude setup-token`.
