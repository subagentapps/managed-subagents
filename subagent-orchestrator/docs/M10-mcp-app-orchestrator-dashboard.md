# M10 spec — orchestrator-dashboard MCP App

**New milestone**, added after the Tier 1 MCP server triage in `subagent-mcp-servers/README.md`. Per [`modelcontextprotocol.io/extensions/apps/overview`](https://modelcontextprotocol.io/extensions/apps/overview), MCP Apps are interactive UI applications that render inside MCP hosts (Claude Desktop, Claude.ai, future Cowork). M10 builds the first such app for this repo.

## What it does

A dashboard MCP App that renders inside Claude Desktop (or any MCP host with apps support) showing **live orchestrator state**:

- Recent dispatches from `~/.claude/orchestrator.db` (the M7 telemetry table)
- Open PRs across `subagentapps/*` repos (via the github MCP server installed in PR #19)
- Cost-burn over time (chart from dispatch_log.cost_usd_estimate)
- Currently-running monitors (from the Monitor tool's TaskList)
- Failed dispatches with one-click "retry" buttons that fire the right dispatch path

## Why an MCP App and not a CLI

The orchestrator's CLI (M1+M2 today, M3+ landing) is fine for "what would you do with this task TOML?" inspection. The CLI is bad at:

- **Glanceable state** — humans want a dashboard, not a flat table
- **Drill-in** — clicking a failed dispatch to see its prompt + finding details is hard in the CLI
- **Live updates** — terminal redraws are choppy; MCP App can stream

An MCP App rendered inside Claude Desktop gets all three for free.

## Stack

| Layer | Choice | Why |
|---|---|---|
| MCP Apps SDK | `@modelcontextprotocol/ext-apps` | The whole reason this is possible; install via Tier 1 follow-up |
| Framework | React (via `@modelcontextprotocol/server-basic-react` as the seed) | Matches `subagent-typescript/` and the rest of this repo's TS stack |
| Charting | TBD — `chart.js` or `recharts` | Need only line + bar; recharts is React-native |
| Data source | Read-only access to `~/.claude/orchestrator.db` via better-sqlite3 + `subagent-orchestrator/src/store/db.ts` | Same store the orchestrator writes to |
| Live updates | MCP `instance-supersession` per spec | Standard MCP App pattern |
| Theming | Match Claude's variables per [`transparent-theming`](https://claude.com/docs/connectors/building/mcp-apps/transparent-theming.md) | Native look |

## Reference apps to study

From `ochafik`'s 1.7.0 `@modelcontextprotocol/*` cluster:

- **`server-system-monitor`** — closest analog (real-time stats grid). Read its source first.
- **`server-cohort-heatmap`** — useful pattern for the "dispatch outcomes by disposition" view
- **`server-budget-allocator`** — pattern for the cost-burn slider/chart
- **`server-shadertoy`** — confirms heavy GLSL works inside an MCP App (publication-quality interactive viz like [transformer-circuits.pub/2026/emotions](https://transformer-circuits.pub/2026/emotions/index.html))
- **`server-debug`** — exercises every SDK capability; sanity check our app against it

## Repo layout

```
subagent-orchestrator/
├── apps/
│   └── dashboard/                  # the new MCP App (M10)
│       ├── package.json
│       ├── vite.config.ts
│       ├── src/
│       │   ├── App.tsx
│       │   ├── views/
│       │   │   ├── RecentDispatches.tsx
│       │   │   ├── OpenPrs.tsx
│       │   │   ├── CostBurnChart.tsx
│       │   │   └── ActiveMonitors.tsx
│       │   ├── data/
│       │   │   ├── useDispatchLog.ts   # reads from db.ts via MCP resource
│       │   │   ├── useOpenPrs.ts       # reads from github MCP server
│       │   │   └── useMonitors.ts
│       │   └── theme.css               # Claude variables
│       └── tests/
└── apps/dashboard.mcp.json         # MCP App registration
```

## Milestones

| # | Deliverable | Estimated |
|---|---|---|
| M10.0 | Bootstrap by forking `server-basic-react`; `npm install`, `npm run build` produces a renderable App | 2h |
| M10.1 | One view: `RecentDispatches.tsx` reading from local sqlite via better-sqlite3 | 3h |
| M10.2 | `OpenPrs.tsx` via github MCP server | 3h |
| M10.3 | `CostBurnChart.tsx` (recharts) | 2h |
| M10.4 | `ActiveMonitors.tsx` polling Monitor tool | 2h |
| M10.5 | Claude theme integration + responsive layout | 2h |
| M10.6 | Register as MCP App; confirm renders in Claude Desktop | 1h |

Total: ~15h. Larger than M3 (~4h) because UI work is inherently slower than CLI.

## Open decisions

1. **Where does the App live in the package tree?** Options: (a) inside `subagent-orchestrator/apps/dashboard/` as a sibling workspace, (b) its own top-level `subagent-orchestrator-dashboard/` directory. Recommend (a) for v0.1 (workspace is simpler), (b) if it grows.
2. **Build tool: Vite vs the basic-react template's default?** Read the template first.
3. **Data freshness: poll vs push?** Poll for v0.1 (every 5s), push via Cloudflare D1 changefeed if/when we move telemetry off local sqlite (post-CLI_COWORK_PLAN Option C).
4. **Auth surface for the github MCP server?** Reuse the same `GITHUB_PERSONAL_ACCESS_TOKEN` env var; resolve via `subagent-orchestrator/src/store/auth.ts` extension.

## Status

Spec only. No code. Implementation is a separate PR sequence (one per milestone), starting after PR #19 (Tier 1 install) merges.

## See also

- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- [`subagent-mcp-servers/README.md`](../../subagent-mcp-servers/README.md) — Tier 1.5 MCP App build kit section
- [`PROJECT_PLAN.md`](../PROJECT_PLAN.md) — full milestone roadmap (M10 added at the end)
