# marketing

**Upstream:** [`anthropics/knowledge-work-plugins/marketing`](https://github.com/anthropics/knowledge-work-plugins/tree/main/marketing)

**Install:** `claude plugins add knowledge-work-plugins/marketing`

## What it does

Content creation, campaign planning, performance analysis, brand voice, competitor tracking.

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| Chat | `~~chat` | Slack | Microsoft Teams |
| Design | `~~design` | Canva, Figma | Adobe Creative Cloud |
| Marketing automation | `~~marketing automation` | HubSpot | Marketo, Pardot, Mailchimp |
| Product analytics | `~~product analytics` | Amplitude | Mixpanel, Google Analytics |
| Knowledge base | `~~knowledge base` | Notion | Confluence, Guru |
| SEO | `~~SEO` | Ahrefs, Similarweb | Semrush, Moz |
| Email marketing | `~~email marketing` | Klaviyo | Mailchimp, Brevo, Customer.io |
| Marketing analytics | `~~marketing analytics` | Supermetrics | Google Analytics, Mailchimp, Semrush |

**Connector gaps:** none — every category has a default.

## Programmatic migration strategy

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/marketing",
  skill: "<skill-id>",
  connectors: {
    "~~marketing automation": { server: "hubspot" },
    "~~SEO":                  { server: "ahrefs" },
    "~~design":               { server: "canva", required: false },
  },
  prompt: "Plan a Q3 launch campaign for the new pricing page.",
  permissionMode: "plan",
});
```

## See also

- `partner-built/brand-voice` plugin — Tribe AI's brand-voice plugin pairs well here
