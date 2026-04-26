# cli-cowork-bridge

How `subagent-typescript/` (the recurring crawler running on Cloudflare) and `subagent-orchestrator/` (the local orchestrator program) **call into** the knowledge-work plugins documented in this directory. This is the wrapper layer that turns each plugin's `~~category` placeholder system into resolved, programmatic invocations.

Referenced from: every `subagent-cowork/<plugin>.md` file's "Programmatic migration strategy" section.

---

## 1. The translation layer

Every cowork plugin is **tool-agnostic** at the workflow level — it talks about `~~chat`, `~~project tracker`, `~~CRM`, etc. The bridge layer **resolves** these placeholders to concrete MCP servers based on:

1. **Per-environment config** — different connectors in CLI vs Cowork vs web
2. **Per-task overrides** — a one-off task can pin a specific server
3. **Org defaults** — most likely path; comes from `connectors.toml` (proposed)

The output is a `ResolvedConnectors` map ready for the Agent SDK's `mcpServers` field.

---

## 2. Proposed `connectors.toml` shape

Lives at the repo root or `~/.claude/`. Source-of-truth for "when this plugin asks for `~~chat`, here's what to use."

```toml
# Default mappings per category. Used when no per-task override is set.
[default]
"~~chat"               = "slack"
"~~email"              = "microsoft-365"
"~~project tracker"    = "linear"
"~~knowledge base"     = "notion"
"~~design"             = "figma"
"~~CRM"                = "hubspot"
"~~product analytics"  = "amplitude"
"~~source control"     = "github"
"~~monitoring"         = "datadog"
"~~incident management" = "pagerduty"
"~~data warehouse"     = "bigquery"
"~~support platform"   = "intercom"
"~~user feedback"      = "intercom"
"~~conversation intelligence" = "fireflies"
"~~marketing automation" = "hubspot"
"~~SEO"                = "ahrefs"
"~~ITSM"               = "servicenow"
"~~e-signature"        = "docusign"
"~~office suite"       = "microsoft-365"
"~~cloud storage"      = "box"

# Per-runtime overrides. Useful when CLI talks to a different MCP than Cowork.
[runtime.cli."~~project tracker"]
server = "linear"
config_ref = "user.mcpServers.linear"

[runtime.cowork."~~project tracker"]
server = "linear"

[runtime.web."~~project tracker"]
server = "linear"
note = "Linear's hosted MCP rides *.modelcontextprotocol.io which is allowlisted"

# Per-plugin overrides. e.g., legal needs a different chat (more formal channel)
[plugin.legal."~~chat"]
server = "slack"
channel = "#legal-counsel-only"

# Categories with no MCP server today — bridge falls back to "paste manually"
[unconfigured]
"~~CLM"               = { fallback = "paste-contract-text" }
"~~ATS"               = { fallback = "paste-candidate-json" }
"~~HRIS"              = { fallback = "paste-employee-csv" }
"~~ERP"               = { fallback = "paste-csv" }
"~~CI/CD"             = { fallback = "use-source-control-actions" }
"~~procurement"       = { fallback = "manual" }
"~~lab platform"      = { fallback = "manual" }
"~~compensation data" = { fallback = "paste-levels-export" }
```

The bridge reads this file, applies precedence (per-plugin > per-runtime > default), and emits the `ResolvedConnectors` map.

---

## 3. The TypeScript signature

```ts
// subagent-orchestrator/src/cowork-bridge.ts (or shared in subagent-typescript)

import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

export type Runtime = "cli" | "cowork" | "web";

export interface PluginInvocation {
  /** Plugin name, e.g. "knowledge-work-plugins/legal" */
  plugin: string;
  /** Skill ID within the plugin, e.g. "contract-review" */
  skill: string;
  /** The user's request */
  prompt: string;
  /** Per-task overrides for category resolution */
  connectorOverrides?: Record<string, string | null>;
  /** Files to attach (paths relative to repo root) */
  attachments?: string[];
  /** Permission mode for the resulting Agent SDK call */
  permissionMode?: "default" | "acceptEdits" | "plan" | "auto" | "dontAsk" | "bypassPermissions";
  /** Where this invocation runs (affects connector resolution) */
  runtime: Runtime;
}

export interface ResolvedConnectors {
  /** Map of category → resolved MCP server config (or null if fallback) */
  resolved: Record<string, { server: string; config: McpServerConfig } | { fallback: string }>;
  /** Categories that fell through to a fallback because no MCP exists */
  fallbacks: string[];
}

/**
 * Read connectors.toml, apply precedence, return the resolved map for this invocation.
 */
export function resolveConnectors(
  invocation: PluginInvocation,
  connectorsConfig: ConnectorsConfig,
): ResolvedConnectors;

/**
 * Build the Agent SDK options for a plugin invocation.
 * Wraps resolveConnectors() and sets the right model + allowedTools.
 */
export function buildPluginOptions(
  invocation: PluginInvocation,
  connectorsConfig: ConnectorsConfig,
): ClaudeAgentOptions;

/**
 * Run a plugin invocation end-to-end. Returns the result message body.
 */
export async function runPlugin(
  invocation: PluginInvocation,
  connectorsConfig: ConnectorsConfig,
): Promise<string>;
```

---

## 4. End-to-end example

Calling the `legal/contract-review` skill from the orchestrator:

```ts
import { runPlugin, loadConnectorsConfig } from "./cowork-bridge.js";

const config = loadConnectorsConfig();   // reads connectors.toml

const result = await runPlugin({
  plugin: "knowledge-work-plugins/legal",
  skill: "contract-review",
  prompt: "Review against playbook. We are the customer. Focus: data protection + liability.",
  attachments: ["./contracts/inbound-vendor-msa.pdf"],
  connectorOverrides: {
    "~~cloud storage": "box",
    "~~e-signature":   "docusign",
    "~~CLM":           null,  // explicitly skip; will fallback
  },
  permissionMode: "plan",
  runtime: "cli",
}, config);

console.log(result);
```

Internally:
1. `resolveConnectors()` walks the precedence chain (plugin override → runtime override → default → unconfigured fallback) for each `~~category` the `legal` plugin's `contract-review` skill mentions
2. `buildPluginOptions()` constructs the `ClaudeAgentOptions` with `mcpServers`, `allowedTools`, `permissionMode`
3. `runPlugin()` calls the Agent SDK's `query()` and collects the result

---

## 5. Cross-runtime resolution rules

| Runtime | Resolution behavior |
|---|---|
| **CLI** | Reads from `~/.claude/settings.json` `mcpServers`. If a plugin needs a server not registered there, the bridge errors with "register `<server>` in ~/.claude/settings.json or pass `connectorOverrides`" |
| **Cowork** | Resolves to the equivalent server registered in Cowork settings UI. Currently no programmatic way to *write* Cowork settings; bridge only reads what's there and errors if missing |
| **web** | Resolution must use **only servers reachable from the [claude-code-on-the-web allowlist](https://code.claude.com/docs/en/claude-code-on-the-web.md)**. The bridge has a built-in deny list of categories that don't have a hosted MCP on an allowlisted host (e.g., a self-hosted Linear MCP at `linear.example.com` won't resolve in web runtime). |

The web-runtime-deny-list lives in `subagent-cowork/web-allowlist-resolved.ts` (TBD), generated from the Cloud's allowed-domains plus a hand-curated mapping of category → known-hosted MCPs that pass through it.

---

## 6. Example: same skill, three runtimes

`product-management/competitive-brief` skill needs `~~competitive intelligence`.

| Runtime | Resolved server | Config source |
|---|---|---|
| CLI | `similarweb` | local stdio MCP at `~/.local/bin/similarweb-mcp` |
| Cowork | `similarweb` | Cowork-registered hosted endpoint |
| web | **fallback to manual** (no allowlisted Similarweb hosted MCP at writing) | bridge prompts user to paste the competitor list |

The bridge handles this divergence transparently — the calling code just says `runPlugin({ plugin, skill, prompt, runtime })`.

---

## 7. Status

This document is **specification only**. Implementation lives in:
- `subagent-orchestrator/src/cowork-bridge.ts` — the runtime
- `connectors.toml` at repo root — the config (not yet created)
- `subagent-cowork/web-allowlist-resolved.ts` — the web-runtime registry (not yet created)

Built as M3+ of `subagent-orchestrator/PROJECT_PLAN.md` (when `dispatch/local.ts` lands and needs to invoke plugins).

---

## 8. See also

- [`README.md`](./README.md) — index + cross-plugin connector category map
- Each `subagent-cowork/<plugin>.md` — references this doc from its "Programmatic migration strategy" section
- `../subagent-orchestrator/PROJECT_PLAN.md` — the orchestrator that consumes this bridge
- `../CLI_COWORK_PLAN.md` — the deployment plan that picks the actual MCP servers per environment
