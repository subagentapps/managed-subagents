# design

**Upstream:** [`anthropics/knowledge-work-plugins/design`](https://github.com/anthropics/knowledge-work-plugins/tree/main/design)

**Install:** `claude plugins add knowledge-work-plugins/design`

## What it does

Design critique, design system management, UX writing, accessibility audits, research synthesis, dev handoff.

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| Chat | `~~chat` | Slack | Microsoft Teams |
| Design tool | `~~design tool` | Figma | Sketch, Adobe XD, Framer |
| Knowledge base | `~~knowledge base` | Notion | Confluence, Guru, Coda |
| Project tracker | `~~project tracker` | Linear, Asana, Atlassian | Shortcut, ClickUp |
| User feedback | `~~user feedback` | Intercom | Productboard, Canny, UserVoice, Dovetail |
| **Product analytics** | `~~product analytics` | **— (gap)** | Amplitude, Mixpanel, Heap, FullStory |

**Connector gaps:** product analytics is unconfigured. Bring Amplitude / Mixpanel MCP if usage data matters to your design work.

## Programmatic migration strategy

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/design",
  skill: "<skill-id>",
  connectors: {
    "~~design tool":     { server: "figma" },
    "~~user feedback":   { server: "intercom", required: false },
    "~~product analytics": { server: process.env.PRODUCT_ANALYTICS_MCP || null, required: false },
  },
  prompt: "Audit accessibility on the checkout flow.",
  permissionMode: "plan",
});
```

## See also

- `../subagent-skills/canvas-design.md`, `algorithmic-art.md`, `theme-factory.md`, `web-artifacts-builder.md`, `brand-guidelines.md` — Anthropic's standalone design skills (not in this plugin; use both)
