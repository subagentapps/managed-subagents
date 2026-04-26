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

## Tier 1 — install now (9 servers)

These hit ≥3 criteria OR were explicitly upgraded by the user. Going into `~/.claude/settings.json` `mcpServers` next tick.

| Server | Latest | Score | Why |
|---|---|---|---|
| `@modelcontextprotocol/server-filesystem` | 2026.1.14 | O,V | Structured fs access for orchestrator + crawler. Existing alternative is per-call Bash shellout. |
| `@modelcontextprotocol/server-github` | 2025.4.8 | O,C | Replaces `gh` CLI shellouts in `watch/gh.ts` and `dispatch/claude-mention.ts` with typed MCP. ~~source control~~ category for engineering plugin. |
| `@modelcontextprotocol/server-postgres` | 0.6.2 | C,V | Hits Neon / AlloyDB / RDS plan from CLI_COWORK_PLAN.md. ~~data warehouse~~ category alt. |
| `@modelcontextprotocol/server-memory` | 2026.1.26 | O,V | Knowledge-graph memory; complements `store/db.ts` telemetry with cross-session structured memory. |
| `@modelcontextprotocol/server-sequential-thinking` | 2025.12.18 | O,V | Useful for orchestrator's classify+dispatch reasoning loops on ambiguous tasks. |
| `@modelcontextprotocol/server-everything` | 2026.1.26 | O | Test harness — exercises all MCP features. Dev-only; use for orchestrator E2E testing. |
| `@anthropic-ai/sandbox-runtime` | 0.0.49 | O,V | Sandboxing for orchestrator hard rails (PROJECT_PLAN §5 M8). |
| `@modelcontextprotocol/server-redis` | 2025.4.25 | C,V | **User-promoted from Tier 2.** Aligns with CLI_COWORK_PLAN Option C (Upstash Redis canonical). Useful even before Upstash lands — local Docker Redis for orchestrator queue + caching. |
| `@anthropic-ai/claude-trace` | 0.1.2 | O,V | **User-promoted from Tier 2.** OTEL trace viewer for Claude Code sessions. Trace-our-data is the priority — this lets us see exactly what every dispatched session did, with timing. Pair with `store/db.ts` for structured telemetry vs trace timelines. |

Install priority within Tier 1:
1. `server-github` — largest immediate leverage (replaces shellouts already in main)
2. `server-filesystem` — second-largest (structures the existing fs access)
3. `server-postgres` — when DB is wired (CLI_COWORK_PLAN Option C lands)
4. `server-memory` — once telemetry has rows worth memorizing
5. `server-sequential-thinking` — once classifier confidence drops trigger fallback to it
6. `server-everything` — when E2E tests need it
7. `sandbox-runtime` — when M8 rails land

---

## Tier 2 — install eventually (5 servers)

| Server | Latest | Score | Note |
|---|---|---|---|
| `@modelcontextprotocol/server-puppeteer` | 2025.5.12 | C | Crawler tier-4 alt; redundant with Cloudflare Browser Rendering. Install if going local-first for the crawler |
| `@modelcontextprotocol/server-slack` | 2025.4.25 | C | Already in cowork plugin connector list; install when notifications matter |
| `@modelcontextprotocol/server-pdf` | 1.7.0 | C | Covered by `subagent-cowork/pdf-viewer` plugin (which uses this same server underneath) |
| `@anthropic-ai/mcpb` | 2.1.2 | V | MCP Bundles tooling — install when packaging our own MCP servers for distribution |
| `@anthropic-ai/dxt` | 0.2.6 | V | Desktop Extensions tooling — install when shipping a Claude Desktop add-on |

---

## Tier 1.5 — MCP App build kit (NEW: user wants to build an MCP App)

User directive: **build an MCP App**. Per [modelcontextprotocol.io/extensions/apps/overview](https://modelcontextprotocol.io/extensions/apps/overview), MCP Apps are interactive UI applications that render inside MCP hosts like Claude Desktop. The `ext-apps` SDK + framework scaffolds + `ochafik`'s 1.7.0 demo cluster are the **build kit** for this.

Reclassified from "Tier 3 demos" to **install + study as references**:

### Core MCP App SDK
| Server | Latest | Use |
|---|---|---|
| `@modelcontextprotocol/ext-apps` | 1.7.0 | The MCP Apps SDK itself — required to build any MCP App |

### Framework starter scaffolds (pick one to fork)
| Server | Latest | Framework |
|---|---|---|
| `@modelcontextprotocol/server-basic-react` | 1.7.0 | React — best fit (matches our subagent-typescript stack) |
| `@modelcontextprotocol/server-basic-vue` | 1.7.0 | Vue — alt |
| `@modelcontextprotocol/server-basic-svelte` | 1.7.0 | Svelte — alt |
| `@modelcontextprotocol/server-basic-solid` | 1.7.0 | Solid — alt |
| `@modelcontextprotocol/server-basic-preact` | 1.7.0 | Preact — alt (lightweight) |
| `@modelcontextprotocol/server-basic-vanillajs` | 1.7.0 | Vanilla JS — alt (no framework) |

### Reference MCP Apps to study (12 examples)
For learning patterns. Not all need to be installed — study via `npm view` or GitHub source. Each maps to a publication-quality interactive content type:

| Server | Pattern it demonstrates |
|---|---|
| `server-shadertoy` | GLSL shader rendering — like the [transformer-circuits.pub/2026/emotions](https://transformer-circuits.pub/2026/emotions/index.html) interactive viz style |
| `server-threejs` | 3D scene rendering — interactive interp diagrams |
| `server-sheet-music` | ABC-notation rendering — domain-specific viz |
| `server-system-monitor` | Real-time stats — like the dispatch dashboards we'll need |
| `server-cohort-heatmap` | Retention analysis — useful for crawler analytics |
| `server-customer-segmentation` | Filtering UI — generic UX pattern |
| `server-budget-allocator` | Interactive financial sliders — applicable to /usage cost tracking |
| `server-scenario-modeler` | What-if modeling — applicable to orchestrator planning |
| `server-transcript` | Live speech transcription — applicable to recording orchestrator runs |
| `server-video-resource` | Base64 video as MCP resource — pattern for embedded media |
| `server-wiki-explorer` | Graph navigation — applicable to entity-graph exploration in SHARED_DATA_MODEL |
| `server-map` | CesiumJS 3D globe — geo viz |
| `server-debug` | Tests all SDK capabilities — sanity check our own MCP App against |

**Build plan:** fork `server-basic-react` as the seed, study `server-shadertoy` + `server-system-monitor` for interactive patterns we want, build a `subagentapps/orchestrator-dashboard` MCP App that renders dispatch-log stats + live PR status from inside Claude Desktop.

This becomes a **new milestone** in `subagent-orchestrator/PROJECT_PLAN.md` (call it M10: orchestrator-dashboard MCP App).

---

## Tier 3 — skip (much smaller now)

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
    },
    "redis": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-redis", "redis://localhost:6379"]
      // For Upstash: use the rediss://... URL from Upstash console.
    },
    "claude-trace": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/claude-trace"]
    }
    // Defer postgres + everything + sandbox-runtime to dedicated install PRs
    // when the supporting infra is ready.
    // Defer ext-apps + server-basic-react to the M10 MCP App build PR.
  }
}
```

---

## Status

This doc is the **triage**. The actual install (settings.json edit) is the next PR.
