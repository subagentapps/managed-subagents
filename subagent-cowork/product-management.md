# product-management

**Upstream:** [`anthropics/knowledge-work-plugins/product-management`](https://github.com/anthropics/knowledge-work-plugins/tree/main/product-management) · [README](https://github.com/anthropics/knowledge-work-plugins/blob/main/product-management/README.md) · [CONNECTORS](https://github.com/anthropics/knowledge-work-plugins/blob/main/product-management/CONNECTORS.md)

**Install:** `claude plugins add knowledge-work-plugins/product-management`

## What it does

PM workflow: PRDs, roadmaps, stakeholder updates, user-research synthesis, competitive analysis, metrics review, brainstorming.

## Commands

| Command | Purpose |
|---|---|
| `/write-spec` | PRD from a problem statement |
| `/roadmap-update` | Update / create / reprioritize roadmap |
| `/stakeholder-update` | Status update tailored to audience |
| `/synthesize-research` | Themes from interviews / surveys / tickets |
| `/competitive-brief` | Competitor analysis brief |
| `/metrics-review` | Trends + actionable insights from product metrics |
| `/brainstorm` | Sparring partner across PM frameworks (HMW, JTBD, First Principles, Opportunity Solution Trees) |

## Skills

| Skill | Coverage |
|---|---|
| `feature-spec` | PRD structure, user stories, acceptance criteria |
| `roadmap-management` | RICE / MoSCoW, dependency mapping |
| `stakeholder-comms` | Templates by audience, risk comms, decision docs |
| `user-research-synthesis` | Thematic analysis, affinity mapping, personas, opportunity sizing |
| `competitive-analysis` | Feature comparison matrices, positioning, win/loss |
| `metrics-tracking` | Metric hierarchy, OKRs, dashboard design, review cadences |
| `product-brainstorming` | Modes (problem exploration, solution ideation, assumption testing, strategy) |

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| Calendar | `~~calendar` | Google Calendar | Microsoft 365 |
| Chat | `~~chat` | Slack | Microsoft Teams |
| Competitive intelligence | `~~competitive intelligence` | Similarweb | Crayon, Klue |
| Design | `~~design` | Figma | Sketch, Adobe XD |
| Email | `~~email` | Gmail | Microsoft 365 |
| Knowledge base | `~~knowledge base` | Notion | Confluence, Guru, Coda |
| Meeting transcription | `~~meeting transcription` | Fireflies | Gong, Dovetail, Otter.ai |
| Product analytics | `~~product analytics` | Amplitude, Pendo | Mixpanel, Heap, FullStory |
| Project tracker | `~~project tracker` | Linear, Asana, monday.com, ClickUp, Atlassian | Shortcut, Basecamp |
| User feedback | `~~user feedback` | Intercom | Productboard, Canny, UserVoice |

**Connector gaps:** none — every category has at least one included server.

## Skill → connector matrix

Which skills depend on which categories. A skill works degraded (manual context input) when its primary category has no connector.

| Skill | Hard requirement | Soft (degrades gracefully) |
|---|---|---|
| `feature-spec` | — | knowledge base, design |
| `roadmap-management` | project tracker | knowledge base |
| `stakeholder-comms` | — | chat, email, knowledge base |
| `user-research-synthesis` | — | user feedback, meeting transcription |
| `competitive-analysis` | — | competitive intelligence |
| `metrics-tracking` | — | product analytics |
| `product-brainstorming` | — | knowledge base |

No skill is *blocked* if a connector is missing — all degrade to "paste your context manually."

## Programmatic migration strategy

To run `/write-spec` from your subagent stack:

```ts
import { ManagedSubagents } from "@subagentapps/managed-subagents";

await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/product-management",
  skill: "feature-spec",
  connectors: {
    "~~knowledge base": { server: "notion", required: false },
    "~~design":         { server: "figma",  required: false },
  },
  prompt: "Write a PRD for SSO support for enterprise customers. Audience: engineering. Format: 2-page max.",
  permissionMode: "plan",  // PRD generation should land in plan mode for review
});
```

For `/roadmap-update`, project tracker is the primary substrate — choose one:

| Project tracker available in env | Action |
|---|---|
| Linear | `connectors["~~project tracker"] = { server: "linear" }` |
| Jira (Atlassian) | `connectors["~~project tracker"] = { server: "atlassian", scopes: ["jira"] }` |
| None | `connectors["~~project tracker"] = { server: null, fallback: "paste-csv" }` |

**Cross-platform parity:** when running from `claude-code-on-the-web`, Notion / Linear / Slack remote MCPs work via the allowed `*.modelcontextprotocol.io` egress (or hosted-MCP equivalent on the connector-author's side). When running locally, prefer `stdio` MCP servers for lower latency.

## See also

- [Connector category map](./README.md#connector-category-map-cross-plugin-reference)
- Programmatic patterns in [`cli-cowork-bridge.md`](./cli-cowork-bridge.md) (TBD)
