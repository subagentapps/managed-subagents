# subagent-mcp-servers

Triage + install plan for MCP servers we're considering wiring into this repo's stack.

Sources reviewed:
- `npmjs.com/~fweinberger` — 49 packages under `@modelcontextprotocol/*` (note: user's paste attributed these to `pcarleton` but the canonical owner per `registry.npmjs.org/-/user/fweinberger/package` is `fweinberger`; `pcarleton` is the latest publisher on many)
- `npmjs.com/~zak-anthropic` — 35 packages under `@anthropic-ai/*`

This doc decides **which to install, why, and in what order**. Companion doc `INSTALL.md` (TBD) holds the actual `~/.claude/settings.json` `mcpServers` entries.

---

## Triage criteria

Each server scored against the 4 things this repo's vision needs:

| Criterion | Why it matters |
|---|---|
| **Orchestrator leverage** | Does it directly help `subagent-orchestrator/` dispatch / watch / review / merge faster? |
| **Crawler leverage** | Does it accelerate `subagent-typescript/` (Cloudflare crawl) or `subagent-python/` (backfill)? |
| **Cowork bridge** | Does it resolve a `~~category` placeholder used by ≥1 plugin in `subagent-cowork/`? |
| **Vision fit** | Does it fit the "CLI + Cowork + web parity, hosted on Cloudflare" trajectory in `CLI_COWORK_PLAN.md`? |

Score: **Tier 1** = install now (≥3 criteria hit). **Tier 2** = install eventually (1-2 criteria). **Tier 3** = skip (0 criteria or out of scope).

---

## Tier 1 — install now (7 servers)

These hit ≥3 criteria each. Going into `~/.claude/settings.json` `mcpServers` next tick.

| Server | Latest | Score | Why |
|---|---|---|---|
| `@modelcontextprotocol/server-filesystem` | 2026.1.14 | O,V | Structured fs access for orchestrator + crawler. Existing alternative is per-call Bash shellout. |
| `@modelcontextprotocol/server-github` | 2025.4.8 | O,C | Replaces `gh` CLI shellouts in `watch/gh.ts` and `dispatch/claude-mention.ts` with typed MCP. ~~source control~~ category for engineering plugin. |
| `@modelcontextprotocol/server-postgres` | 0.6.2 | C,V | Hits Neon / AlloyDB / RDS plan from CLI_COWORK_PLAN.md. ~~data warehouse~~ category alt. |
| `@modelcontextprotocol/server-memory` | 2026.1.26 | O,V | Knowledge-graph memory; complements `store/db.ts` telemetry with cross-session structured memory. |
| `@modelcontextprotocol/server-sequential-thinking` | 2025.12.18 | O,V | Useful for orchestrator's classify+dispatch reasoning loops on ambiguous tasks. |
| `@modelcontextprotocol/server-everything` | 2026.1.26 | O | Test harness — exercises all MCP features. Dev-only; use for orchestrator E2E testing. |
| `@anthropic-ai/sandbox-runtime` | 0.0.49 | O,V | Sandboxing for orchestrator hard rails (PROJECT_PLAN §5 M8). |

Install priority within Tier 1:
1. `server-github` — largest immediate leverage (replaces shellouts already in main)
2. `server-filesystem` — second-largest (structures the existing fs access)
3. `server-postgres` — when DB is wired (CLI_COWORK_PLAN Option C lands)
4. `server-memory` — once telemetry has rows worth memorizing
5. `server-sequential-thinking` — once classifier confidence drops trigger fallback to it
6. `server-everything` — when E2E tests need it
7. `sandbox-runtime` — when M8 rails land

---

## Tier 2 — install eventually (7 servers)

| Server | Latest | Score | Note |
|---|---|---|---|
| `@modelcontextprotocol/server-puppeteer` | 2025.5.12 | C | Crawler tier-4 alt; redundant with Cloudflare Browser Rendering. Install if going local-first for the crawler |
| `@modelcontextprotocol/server-redis` | 2025.4.25 | V | Useful when caching layer lands per CLI_COWORK_PLAN Option C |
| `@modelcontextprotocol/server-slack` | 2025.4.25 | C | Already in cowork plugin connector list; install when notifications matter |
| `@modelcontextprotocol/server-pdf` | 1.7.0 | C | Covered by `subagent-cowork/pdf-viewer` plugin (which uses this same server underneath) |
| `@anthropic-ai/mcpb` | 2.1.2 | V | MCP Bundles tooling — install when packaging our own MCP servers for distribution |
| `@anthropic-ai/claude-trace` | 0.1.2 | O | OTEL trace viewer — pair with `store/db.ts` once we have enough dispatch volume |
| `@anthropic-ai/dxt` | 0.2.6 | V | Desktop Extensions tooling — install when shipping a Claude Desktop add-on |

---

## Tier 3 — skip (most of the list)

### `ochafik`'s 1.7.0 MCP App demos (14 servers)
`server-{budget-allocator, cohort-heatmap, customer-segmentation, map, scenario-modeler, shadertoy, sheet-music, system-monitor, threejs, transcript, video-resource, wiki-explorer, debug, ext-apps}` — these are **example apps demonstrating MCP App SDK capabilities**, not infrastructure. Useful as references when we build our own MCP App; not as runtime servers.

### Framework demo scaffolds (6 servers)
`server-basic-{preact, react, solid, svelte, vanillajs, vue}` — empty starter templates. Skip.

### Out-of-scope integrations (6 servers)
`server-{gdrive, google-maps, everart, aws-kb-retrieval, brave-search, gitlab}` — useful for users who need them, but none align with this repo's vision (no GDrive in CLI_COWORK_PLAN, no Brave Search in crawler tier hierarchy, no GitLab dispatch path).

### Adapters / framework hosts (5 servers)
`@modelcontextprotocol/{express, hono, fastify, client, server, node}` — implementation pieces consumers use to build MCP servers, not servers themselves. Already implicitly used by `@modelcontextprotocol/sdk`.

### Personal / reserved (5+ packages)
- `payslips`, `cryptopals-pcarleton` — `pcarleton`'s personal projects, irrelevant
- `anthropic` (9-yr-old, empty 0.0.0) — squatted name
- `*-napi` (`audio-capture`, `color-diff`, `image-processor`, `modifiers`, `url-handler`) — reserved by `pacifier136`, no real content

### `@modelcontextprotocol/inspector*` (4 packages)
`inspector`, `inspector-cli`, `inspector-client`, `inspector-server` — dev tooling for **testing** MCP servers. Install only if we author MCP servers ourselves (not yet).

### `@modelcontextprotocol/conformance` + `create-server`
- `conformance` — protocol test framework; install if we ship our own MCP server
- `create-server` — scaffolder; install once when bootstrapping our first server

### `@anthropic-ai/claude-code*` and `@anthropic-ai/claude-agent-sdk*` platform binaries
Auto-installed with the parent packages (`claude-code` and `claude-agent-sdk`). No manual action.

### Other Anthropic SDKs we don't need
`@anthropic-ai/{aws-sdk, bedrock-sdk, vertex-sdk, foundry-sdk, universal-sdk}` — only relevant if running Claude through the named cloud providers. We're using direct Anthropic API via OAuth.

### `@anthropic-ai/tokenizer`
Useful for offline token counting; install if we need pre-flight token budget checks (potential future M3+ enhancement).

---

## Open questions before installing Tier 1

1. **Where does each server's MCP config go?** Per the cross-runtime parity story in `CLI_COWORK_PLAN.md`:
   - CLI: `~/.claude/settings.json` `mcpServers`
   - Cowork: Cowork settings UI (no API)
   - Web (`claude-code-on-the-web`): per-session `/mcp add`; servers must be reachable from the allowlist (`*.modelcontextprotocol.io` works for hosted MCPs, stdio works for npm-packaged ones)
2. **Stdio vs hosted vs SSE?** All Tier 1 are stdio (npm-installed). That works for CLI + Cowork; web sessions need them re-installed per session unless they have hosted variants.
3. **`server-postgres` connection string source?** Currently no DB exists for this repo. Don't install until CLI_COWORK_PLAN's database choice is made.

---

## Proposed install commands (CLI runtime)

After confirming the above, the install is a `~/.claude/settings.json` edit adding `mcpServers` entries. Will produce as a follow-up PR after this triage doc lands.

```jsonc
// ~/.claude/settings.json (additive merge — do not replace existing keys)
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "<from keychain>" }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem",
               "/Users/alexzh/claude-projects"]
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
    // Defer postgres + everything + sandbox-runtime to dedicated install PRs
    // when the supporting infra is ready.
  }
}
```

---

## Status

This doc is the **triage**. The actual install (settings.json edit) is the next PR.
