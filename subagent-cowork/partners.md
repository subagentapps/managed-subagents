# partner-built plugins

**Upstream:** [`anthropics/knowledge-work-plugins/partner-built/`](https://github.com/anthropics/knowledge-work-plugins/tree/main/partner-built)

Plugins authored by partner companies, distributed through the same marketplace. Each is its own subdirectory; install identically.

| Plugin | Author | Description |
|---|---|---|
| `slack-by-salesforce` | Salesforce | Slack integration for searching messages, sending communications, managing canvases |
| `apollo` | Apollo.io | Prospect, enrich leads, load outreach sequences with Apollo.io |
| `common-room` | Common Room | GTM copilot — research accounts/contacts, prep for calls, draft outreach |
| `brand-voice` | Tribe AI | Discover brand voice from existing docs, generate guidelines, validate AI-generated content |
| `zoom-plugin` | Zoom | Plan/build/debug Zoom integrations across REST APIs, SDKs, webhooks, MCP workflows |

## External plugins listed in upstream marketplace.json

These live in *other* GitHub repos but are listed in `knowledge-work-plugins/.claude-plugin/marketplace.json`:

| Plugin | Source repo | Description |
|---|---|---|
| `planetscale` | `planetscale/claude-plugin` | Authenticated hosted MCP for PlanetScale orgs/dbs/branches/schema/Insights |
| `adspirer-ads-agent` | `amekala/adspirer-mcp-plugin` | Cross-platform ad management (Google, Meta, TikTok, LinkedIn Ads). 91 tools. |
| `sanity-plugin` | (Sanity-hosted) | Sanity content platform integration with MCP, agent skills, slash commands |

## Migration strategy for partner plugins

Partner plugins follow the same `claude plugins add knowledge-work-plugins/<name>` install pattern, but their connectors and skills are partner-defined rather than category-driven. They can collide with the category-based plugins (e.g., `slack-by-salesforce` overlaps with the `~~chat: Slack` connector used by every Anthropic-authored plugin).

**Recommendation:** prefer category-driven Anthropic plugins as the default; layer partner plugins on top *only* when their domain coverage is unique (e.g., `planetscale` for PlanetScale-specific operations, `adspirer` for ads, `sanity` for Sanity CMS).

## See also

- [Connector category map](./README.md#connector-category-map-cross-plugin-reference)
