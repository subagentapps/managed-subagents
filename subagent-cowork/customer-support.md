# customer-support

**Upstream:** [`anthropics/knowledge-work-plugins/customer-support`](https://github.com/anthropics/knowledge-work-plugins/tree/main/customer-support)

**Install:** `claude plugins add knowledge-work-plugins/customer-support`

## What it does

Ticket triage, response drafting, escalation, knowledge-base building, customer-context research, self-service content from resolved issues.

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| Chat | `~~chat` | Slack | Microsoft Teams |
| Email | `~~email` | Microsoft 365 | — |
| Cloud storage | `~~cloud storage` | Microsoft 365 | — |
| Support platform | `~~support platform` | Intercom | Zendesk, Freshdesk, HubSpot Service Hub |
| CRM | `~~CRM` | HubSpot | Salesforce, Pipedrive |
| Knowledge base | `~~knowledge base` | Guru, Notion | Confluence, Help Scout |
| Project tracker | `~~project tracker` | Atlassian | Linear, Asana |

**Connector gaps:** none.

## Programmatic migration strategy

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/customer-support",
  skill: "<skill-id>",
  connectors: {
    "~~support platform": { server: "intercom" },  // or "zendesk"
    "~~CRM":              { server: "hubspot", required: false },
    "~~knowledge base":   { server: "guru" },
  },
  prompt: "Triage the last 50 open tickets and surface the top 3 themes.",
  permissionMode: "plan",
});
```

**Support-platform choice is load-bearing.** Intercom and Zendesk both have first-party MCPs; Freshdesk and HubSpot Service Hub require community MCPs.

## See also

- `enterprise-search` plugin — overlapping search-everything pattern when triaging across sources
