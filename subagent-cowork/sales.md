# sales

**Upstream:** [`anthropics/knowledge-work-plugins/sales`](https://github.com/anthropics/knowledge-work-plugins/tree/main/sales)

**Install:** `claude plugins add knowledge-work-plugins/sales`

## What it does

Prospecting, outreach, deal strategy, call prep, pipeline management, personalized messaging.

## Commands

| Command | Purpose |
|---|---|
| `/call-summary` | Extract action items, draft follow-up, internal summary |
| `/forecast` | Weighted forecast from CSV / pipeline description |
| `/pipeline-review` | Pipeline health, deal prioritization, weekly action plan |

## Skills

| Skill | Coverage |
|---|---|
| `account-research` | Company intel, contacts, news, hiring signals |
| `call-prep` | Account context, attendee research, agenda, discovery questions |
| `daily-briefing` | Meetings, pipeline alerts, email priorities |
| `draft-outreach` | Personalized email / LinkedIn after research |
| `competitive-intelligence` | Comparison, pricing intel, talk tracks |
| `create-an-asset` | Landing pages, decks, one-pagers tailored to a prospect |

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| Calendar | `~~calendar` | Google Calendar, Microsoft 365 | — |
| Chat | `~~chat` | Slack | Microsoft Teams |
| Competitive intelligence | `~~competitive intelligence` | Similarweb | Crayon, Klue |
| CRM | `~~CRM` | HubSpot, Close | Salesforce, Pipedrive, Copper |
| Data enrichment | `~~data enrichment` | Clay, ZoomInfo, Apollo | Clearbit, Lusha |
| Email | `~~email` | Gmail, Microsoft 365 | — |
| Knowledge base | `~~knowledge base` | Notion | Confluence, Guru |
| Conversation intelligence | `~~conversation intelligence` | Fireflies | Gong, Chorus, Otter.ai |
| Project tracker | `~~project tracker` | Atlassian | Linear, Asana |
| Sales engagement | `~~sales engagement` | Outreach | Salesloft, Apollo |

**Connector gaps:** none — every category has a default. CRM is the load-bearing one (Salesforce common alternative).

## Programmatic migration strategy

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/sales",
  skill: "draft-outreach",
  connectors: {
    "~~CRM":               { server: "hubspot" },           // or "salesforce"
    "~~data enrichment":   { server: "apollo" },
    "~~conversation intelligence": { server: "fireflies", required: false },
  },
  prompt: "Research Acme Corp; draft outreach to their VP of Engineering about our new SSO feature.",
  permissionMode: "plan",
});
```

## See also

- `partner-built/apollo` plugin — Apollo's own first-party plugin (overlapping coverage)
- `partner-built/common-room` — Common Room's GTM copilot
