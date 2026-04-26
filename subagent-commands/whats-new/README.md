# What's new in Claude Code

Per-week deep-dive notes on Claude Code releases as they apply to *this*
repo's workflow. Each week file is structured ROLE-first: it tells
Claude (the agent reading these docs in a future session) the posture
to adopt that week, the table of contents, and the shared TypeScript
primitives the rest of the doc references. Sources are cited inline
to `code.claude.com/docs/en/whats-new/...` for traceability.

| Week | File | Themes |
|---|---|---|
| 2026-W13 | [`2026wk13/claude-code-week13.md`](./2026wk13/claude-code-week13.md) | auto mode, desktop computer use, PR auto-fix, transcript search, PowerShell tool, conditional hooks |
| 2026-W14 | [`2026wk14/claude-code-week14.md`](./2026wk14/claude-code-week14.md) | CLI computer use, `/powerup`, flicker-free rendering, MCP result-size override, plugin executables on `$PATH` |
| 2026-W15 | [`2026wk15/claude-code-week15.md`](./2026wk15/claude-code-week15.md) | `/ultraplan`, `Monitor` tool, `/autofix-pr`, `/team-onboarding` |

## Cross-references with the rest of this repo

Some Claude Code features map directly onto patterns in this stack:

- **W13 — Conditional hooks (`PostToolUse.duration_ms`).** Pairs with
  the latency budget in
  [`docs/eval-and-testing/latency-budget.md`](../../eval-and-testing/latency-budget.md):
  a hook can flag any `Bash` invocation that runs `make seed` slower
  than the budget headroom before the user pushes.
- **W14 — Computer Use in the CLI.** Hooks the React dashboard at
  `:3000` into a visual-regression layer alongside the
  `tests/regression/` API harness — the harness asserts numbers; CU
  asserts that the rendered KPIs match those numbers.
- **W14 — MCP result-size override.** Useful when we add a Postgres or
  DuckDB introspection MCP server; raise `maxOutputBytes` per-server
  rather than globally.
- **W15 — `Monitor` tool.** Replaces the `nohup uvicorn ... &` +
  `tail /tmp/api.log` pattern the harness currently uses to read live
  API logs during regression runs.
- **W15 — `/ultraplan`.** This is the same shape as the plan that
  produced the gh_dump_ext stack
  (`/Users/alexzh/.claude/plans/ultrathink-i-just-created-rosy-liskov.md`):
  bind a wide JD wishlist to a single coherent deliverable.

When you adopt one of these features in this repo's
`.claude/settings.json`, hooks, or skills, drop a one-line note in the
relevant week file's "How we're using this" section so future-you can
trace why a config exists.
