# productivity

**Upstream:** [`anthropics/knowledge-work-plugins/productivity`](https://github.com/anthropics/knowledge-work-plugins/tree/main/productivity)

**Install:** `claude plugins add knowledge-work-plugins/productivity`

## What it does

Task management, day planning, memory of important context, sync with calendar / email / chat.

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| Chat | `~~chat` | Slack | Microsoft Teams, Discord |
| Email | `~~email` | Microsoft 365 | — |
| Calendar | `~~calendar` | Microsoft 365 | — |
| Knowledge base | `~~knowledge base` | Notion | Confluence, Guru, Coda |
| Project tracker | `~~project tracker` | Asana, Linear, Atlassian, monday.com, ClickUp | Shortcut, Basecamp, Wrike |
| Office suite | `~~office suite` | Microsoft 365 | — |

**Connector gaps:** none.

## Programmatic migration strategy

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/productivity",
  skill: "<skill-id>",
  connectors: {
    "~~chat":          { server: "slack" },
    "~~email":         { server: "microsoft-365" },
    "~~calendar":      { server: "microsoft-365" },
    "~~project tracker": { server: "linear" },
  },
  prompt: "Plan tomorrow based on my calendar, open tickets, and unread chat threads.",
  permissionMode: "plan",
});
```

This plugin overlaps significantly with `enterprise-search`. The distinction: productivity is **outbound** (organize my day), enterprise-search is **inbound** (find a thing).

## See also

- `enterprise-search` plugin
