# human-resources

**Upstream:** [`anthropics/knowledge-work-plugins/human-resources`](https://github.com/anthropics/knowledge-work-plugins/tree/main/human-resources)

**Install:** `claude plugins add knowledge-work-plugins/human-resources`

## What it does

Recruiting, onboarding, performance reviews, compensation analysis, policy guidance.

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| **ATS** | `~~ATS` | **— (gap)** | Greenhouse, Lever, Ashby, Workable |
| Calendar | `~~calendar` | Google Calendar | Microsoft 365 |
| Chat | `~~chat` | Slack | Microsoft Teams |
| Email | `~~email` | Gmail, Microsoft 365 | — |
| **HRIS** | `~~HRIS` | **— (gap)** | Workday, BambooHR, Rippling, Gusto |
| Knowledge base | `~~knowledge base` | Notion, Atlassian | Guru, Coda |
| **Compensation data** | `~~compensation data` | **— (gap)** | Pave, Radford, Levels.fyi |

**Connector gaps:** ATS, HRIS, and compensation data — the three most HR-specific categories — all lack included servers. This plugin is largely playbook-driven without them.

## Programmatic migration strategy

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/human-resources",
  skill: "<skill-id>",
  connectors: {
    "~~ATS":              { server: process.env.ATS_MCP || null },
    "~~HRIS":             { server: process.env.HRIS_MCP || null },
    "~~compensation data": { server: process.env.COMP_DATA_MCP || null, required: false },
  },
  prompt: "Draft onboarding plan for a new senior engineer.",
  permissionMode: "plan",
});
```

**Without an ATS MCP**, recruiting workflows fall back to pasting candidate JSON or CSV.
**Without an HRIS MCP**, onboarding/performance/policy workflows fall back to pasting employee data.
**Without comp-data MCP**, compensation analysis runs on uploaded levels.fyi exports or your own market data.

## See also

- `legal` plugin — overlap on policy / compliance work
