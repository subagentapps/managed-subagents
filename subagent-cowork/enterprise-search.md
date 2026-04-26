# enterprise-search

**Upstream:** [`anthropics/knowledge-work-plugins/enterprise-search`](https://github.com/anthropics/knowledge-work-plugins/tree/main/enterprise-search) · [README](https://github.com/anthropics/knowledge-work-plugins/blob/main/enterprise-search/README.md) · [CONNECTORS](https://github.com/anthropics/knowledge-work-plugins/blob/main/enterprise-search/CONNECTORS.md)

**Install:** `claude plugins add knowledge-work-plugins/enterprise-search`

## What it does

One query searches every connected source. Decomposes the question, runs parallel targeted searches per source, synthesizes a single answer with attribution.

## Commands

| Command | Purpose |
|---|---|
| `/enterprise-search:search` | Search across all connected sources |
| `/enterprise-search:digest --daily \| --weekly` | Cross-source activity digest |

Filters: `from:`, `in:`, `after:`, `before:`, `type:` — translated to each source's native query syntax.

## Skills

| Skill | Coverage |
|---|---|
| `search-strategy` | Query decomposition, source-specific translation, fallbacks |
| `source-management` | Knows what's connected, guides connecting new sources, rate-limit handling |
| `knowledge-synthesis` | Cross-source dedup, source attribution, freshness/authority confidence scoring |

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| Chat | `~~chat` | Slack | Microsoft Teams, Discord |
| Email | `~~email` | Microsoft 365 | — |
| Cloud storage | `~~cloud storage` | Microsoft 365 | Dropbox |
| Knowledge base | `~~knowledge base` | Notion, Guru | Confluence, Slite |
| Project tracker | `~~project tracker` | Atlassian, Asana | Linear, monday.com |
| **CRM** | `~~CRM` | **— (gap)** | Salesforce, HubSpot |
| Office suite | `~~office suite` | Microsoft 365 | Google Workspace |

**Connector gaps:** CRM is not pre-configured. Add Salesforce or HubSpot MCP if you need CRM data in search results.

## Skill → connector matrix

This plugin is unusual — **every skill scales linearly with connector count**. More connected sources = more complete results. Zero connectors = zero useful output.

| Skill | Minimum useful connectors |
|---|---|
| `search-strategy` | ≥1 source |
| `source-management` | n/a (always works — it's the meta-skill) |
| `knowledge-synthesis` | ≥2 sources (otherwise nothing to synthesize) |

## Programmatic migration strategy

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/enterprise-search",
  skill: "search-strategy",
  connectors: {
    "~~chat":          { server: "slack" },
    "~~email":         { server: "microsoft-365" },
    "~~cloud storage": { server: "microsoft-365" },
    "~~knowledge base": { server: "notion" },
    "~~project tracker": { server: "linear" },
    // No CRM — leave it out, search degrades gracefully
  },
  prompt: "What did we decide about the API redesign?",
  permissionMode: "default",  // Search is read-only; no edits to gate
});
```

**Anti-pattern:** running this skill from `claude-code-on-the-web` against connectors hosted on `*.neon.tech`, `*.supabase.co`, etc. won't work because those hosts aren't on the web allowlist. Either use the official-MCP variants (Slack, Microsoft 365, Notion all have remote MCPs that ride `*.modelcontextprotocol.io`) or run from CLI.

**The output structure (`~~chat:`, `~~email:` source labels)** is intentionally generic so the same skill answer renders identically regardless of which actual servers are wired up.

## See also

- [Connector category map](./README.md#connector-category-map-cross-plugin-reference)
- `productivity` plugin — uses overlapping categories (chat, email, project tracker, knowledge base) but for inbox-zero workflows rather than cross-source search
