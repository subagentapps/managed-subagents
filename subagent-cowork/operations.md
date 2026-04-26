# operations

**Upstream:** [`anthropics/knowledge-work-plugins/operations`](https://github.com/anthropics/knowledge-work-plugins/tree/main/operations)

**Install:** `claude plugins add knowledge-work-plugins/operations`

## What it does

Vendor management, process documentation, change management, capacity planning, compliance tracking.

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| Calendar | `~~calendar` | Google Calendar | Microsoft 365 |
| Chat | `~~chat` | Slack | Microsoft Teams |
| Email | `~~email` | Gmail, Microsoft 365 | — |
| ITSM | `~~ITSM` | ServiceNow | Zendesk, Freshservice, Jira Service Management |
| Knowledge base | `~~knowledge base` | Notion, Atlassian | Guru, Coda |
| Project tracker | `~~project tracker` | Asana, Atlassian | Linear, monday.com, ClickUp |
| **Procurement** | `~~procurement` | **— (gap)** | Coupa, SAP Ariba, Zip |
| Office suite | `~~office suite` | Microsoft 365 | Google Workspace |

**Connector gaps:** procurement has no included server.

## Programmatic migration strategy

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/operations",
  skill: "<skill-id>",
  connectors: {
    "~~ITSM":         { server: "servicenow" },
    "~~procurement":  { server: process.env.PROCUREMENT_MCP || null, required: false },
    "~~knowledge base": { server: "notion" },
  },
  prompt: "Document the new vendor onboarding process.",
  permissionMode: "plan",
});
```

## See also

- `legal` plugin — vendor management overlap
- `human-resources` plugin — change-management overlap
