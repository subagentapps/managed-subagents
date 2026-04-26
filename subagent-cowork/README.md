# subagent-cowork

Generated 2026-04-26. One markdown file per plugin in `anthropics/knowledge-work-plugins`, documenting commands, skills, included MCP servers, alternative connectors, and a programmatic migration strategy for using each skill from this repo's stack.

The upstream marketplace lives at `https://github.com/anthropics/knowledge-work-plugins`. This directory is **a curated reference**, not a fork — for canonical content always read upstream. Each file here adds the *migration strategy* that's missing from the upstream README.

## Why these plugins matter to this repo

Cowork knowledge-work plugins are the **end-user surface** that your data warehouse (`SHARED_DATA_MODEL.md`) and crawler (`subagent-typescript/`, `subagent-python/`) ultimately serve. Every skill here is a function shape: `(category-resolved-MCP-server, user-prompt) → outcome`. Our job is to (a) decide which connector to use per category for each context (CLI vs Cowork vs web), and (b) be ready to swap the connector if the included one is unavailable.

## Index

### Anthropic-authored plugins (16)

| Plugin | Heaviest categories | Connector gaps (no included server) |
|---|---|---|
| [bio-research](./bio-research.md) | literature, clinical trials, chemical database | lab platform |
| [cowork-plugin-management](./cowork-plugin-management.md) | meta — no connectors of its own | — |
| [customer-support](./customer-support.md) | support platform, CRM, knowledge base | — |
| [data](./data.md) | data warehouse, notebook, product analytics | — |
| [design](./design.md) | design tool, project tracker | product analytics |
| [engineering](./engineering.md) | source control, monitoring, incident management | CI/CD |
| [enterprise-search](./enterprise-search.md) | chat, email, cloud storage, knowledge base | CRM |
| [finance](./finance.md) | data warehouse, office suite | ERP/Accounting, Analytics/BI |
| [human-resources](./human-resources.md) | calendar, knowledge base | ATS, HRIS, compensation data |
| [legal](./legal.md) | cloud storage, project tracker | CLM, CRM |
| [marketing](./marketing.md) | design, marketing automation, SEO, email marketing | — |
| [operations](./operations.md) | ITSM, knowledge base, project tracker | procurement |
| [pdf-viewer](./pdf-viewer.md) | local PDF MCP only | — |
| [product-management](./product-management.md) | project tracker, product analytics, knowledge base | — |
| [productivity](./productivity.md) | chat, project tracker, knowledge base | — |
| [sales](./sales.md) | CRM, sales engagement, conversation intelligence | — |

### Partner-built plugins (in upstream repo, summarized in [partners.md](./partners.md))

`slack-by-salesforce`, `apollo`, `common-room`, `brand-voice`, `zoom-plugin` (all under `partner-built/`).

### External plugins listed in upstream marketplace.json

`planetscale`, `adspirer-ads-agent`, `sanity-plugin` (sourced via URL from external repos).

## Connector category map (cross-plugin reference)

The `~~category` placeholder system is the load-bearing abstraction. Same category appears in many plugins; the connector you pick once should be reused. This table consolidates every category seen across all 16 plugins:

| Category | Used by plugins | Standard included server | Common alternatives |
|---|---|---|---|
| Calendar | hr, operations, pm, productivity, sales | Google Calendar | Microsoft 365 |
| Chat | almost all | Slack | Microsoft Teams, Discord |
| Cloud storage | customer-support, enterprise-search, legal | Microsoft 365 / Box / Egnyte | Dropbox, SharePoint, Google Drive |
| CRM | customer-support, enterprise-search, legal, sales | HubSpot, Close (sales), none (legal) | Salesforce, Pipedrive, Copper |
| Data warehouse | data, finance | Snowflake\*, Databricks\*, BigQuery | Redshift, PostgreSQL |
| Design / Design tool | design, marketing, pm | Figma (Canva for marketing) | Sketch, Adobe XD, Framer, Adobe CC |
| Email | almost all | Gmail / Microsoft 365 | — |
| Knowledge base | most | Notion (sometimes Confluence/Guru) | Confluence, Guru, Coda, Help Scout |
| Marketing automation | marketing | HubSpot | Marketo, Pardot, Mailchimp |
| Meeting transcription / Conv. intel | pm, sales | Fireflies | Gong, Chorus, Otter.ai, Dovetail |
| Monitoring | engineering | Datadog | New Relic, Grafana, Splunk |
| Office suite | customer-support, enterprise-search, finance, legal, operations, productivity | Microsoft 365 | Google Workspace |
| Product analytics | data, design, marketing, pm | Amplitude, Pendo | Mixpanel, Heap, FullStory, GA |
| Project tracker | most | Linear / Asana / monday.com / ClickUp / Atlassian | Shortcut, Basecamp, Wrike |
| SEO | marketing | Ahrefs, Similarweb | Semrush, Moz |
| Source control | engineering | GitHub | GitLab, Bitbucket |
| Support platform | customer-support | Intercom | Zendesk, Freshdesk |
| User feedback | design, pm | Intercom | Productboard, Canny, UserVoice, Dovetail |

Categories with **no standard included server** (you must bring your own MCP):

- ATS, HRIS, compensation data (HR)
- ERP/Accounting, Analytics/BI (finance)
- CLM (legal)
- CI/CD (engineering)
- Procurement (operations)
- Lab platform (bio-research, Benchling placeholder only)

\* Placeholder in upstream — MCP URL not yet configured.

## Programmatic migration strategy (high-level)

For every skill in every plugin, a programmatic wrapper looks like:

```ts
runSkill({
  plugin: "<plugin-name>",
  skill: "<skill-id>",
  // Resolve every ~~category placeholder the skill mentions
  connectors: {
    "~~chat":            { mcpServer: "slack", configRef: "user.mcpServers.slack" },
    "~~project tracker": { mcpServer: "linear", configRef: "user.mcpServers.linear" },
    // ...
  },
  prompt: "<the user request>",
  permissionMode: "acceptEdits",
});
```

The per-plugin docs in this directory enumerate exactly which `~~category` placeholders need resolving, which categories in your environment already have a connector, and which need a fallback. See `cli-cowork-bridge.md` (in this directory, written below) for the orchestration layer that drives this from `subagent-typescript/`.

## See also

- `../INFRASTRUCTURE_PLAN.draft.md` — superseded by `../CLI_COWORK_PLAN.md` (next plan)
- `../subagent-skills/` — Anthropic skill catalog (10 standalone skills, separate from these plugins)
- `../subagent-plugins/plugins-reference.md` — full plugin spec
