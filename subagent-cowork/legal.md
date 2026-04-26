# legal

**Upstream:** [`anthropics/knowledge-work-plugins/legal`](https://github.com/anthropics/knowledge-work-plugins/tree/main/legal) · [README](https://github.com/anthropics/knowledge-work-plugins/blob/main/legal/README.md) · [CONNECTORS](https://github.com/anthropics/knowledge-work-plugins/blob/main/legal/CONNECTORS.md)

**Install:** `claude plugins add knowledge-work-plugins/legal`

**Disclaimer (per upstream):** assists with legal workflows, does not provide legal advice. Default playbook reflects U.S. positions (DE/NY/CA). Customize `legal.local.md` for other jurisdictions before relying on output.

## What it does

Contract review, NDA triage, compliance, briefings, templated responses — configurable to your organization's playbook.

## Target personas

Commercial Counsel · Product Counsel · Privacy/Compliance · Litigation Support.

## Commands

| Command | Purpose |
|---|---|
| `/review-contract` | Review against playbook, flag deviations, generate redlines |
| `/triage-nda` | GREEN / YELLOW / RED classification |
| `/vendor-check [vendor]` | Status of agreements with a vendor |
| `/brief daily \| topic [query] \| incident` | Contextual briefings |
| `/respond [inquiry-type]` | Generate templated response |

## Skills

| Skill | Coverage |
|---|---|
| `contract-review` | Playbook-based clause analysis, deviation classification, redline generation |
| `nda-triage` | Screening criteria, classification rules, routing |
| `compliance` | GDPR / CCPA, DPA review, data subject requests |
| `canned-responses` | Template management, escalation triggers |
| `legal-risk-assessment` | Risk severity framework, classification levels, escalation criteria |
| `meeting-briefing` | Prep methodology, context gathering, action items |

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| Calendar | `~~calendar` | Google Calendar | Microsoft 365 |
| Chat | `~~chat` | Slack | Microsoft Teams |
| Cloud storage | `~~cloud storage` | Box, Egnyte | Dropbox, SharePoint, Google Drive |
| **CLM** | `~~CLM` | **— (gap)** | Ironclad, Agiloft |
| **CRM** | `~~CRM` | **— (gap)** | Salesforce, HubSpot |
| Email | `~~email` | Gmail | Microsoft 365 |
| E-signature | `~~e-signature` | DocuSign | Adobe Sign |
| Office suite | `~~office suite` | Microsoft 365 | Google Workspace |
| Project tracker | `~~project tracker` | Atlassian (Jira/Confluence) | Linear, Asana |

**Connector gaps:** CLM and CRM ship with no included server — bring your own MCP from the alternatives list.

## Skill → connector matrix

| Skill | Hard requirement | Soft (degrades gracefully) |
|---|---|---|
| `contract-review` | playbook file (`legal.local.md`) | cloud storage, e-signature, CLM |
| `nda-triage` | playbook file | CRM (counterparty lookup), e-signature |
| `compliance` | — | knowledge base, cloud storage |
| `canned-responses` | template config | email, chat |
| `legal-risk-assessment` | — | knowledge base |
| `meeting-briefing` | — | calendar, knowledge base, chat |

The **playbook file (`legal.local.md`)** is the load-bearing input. Without it, every skill produces generic output. Save it to a Cowork-shared folder, or to `.claude/legal.local.md` for Claude Code.

## Programmatic migration strategy

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/legal",
  skill: "contract-review",
  connectors: {
    "~~cloud storage": { server: "box", required: false },
    "~~e-signature":   { server: "docusign", required: false },
    "~~CLM":           { server: process.env.CLM_MCP || null, required: false },
  },
  attachments: ["./contracts/inbound-vendor-msa.pdf"],
  context: { playbookPath: ".claude/legal.local.md" },
  prompt: "Review against playbook. We are the customer. Focus: data protection + liability. Deadline: end of quarter.",
  permissionMode: "plan",
});
```

**Bringing your own CLM MCP:** if you use Ironclad or Agiloft, point at their MCP server. If neither has an MCP server today, omit the connector — the skill falls back to "paste contract text manually."

**Cross-platform parity:** the playbook file is local-only by default. For `claude-code-on-the-web` you'll need to either commit it to the repo (visible to all collaborators — fine for non-sensitive playbooks) or use Cowork's shared-folder sync.

## See also

- [Connector category map](./README.md#connector-category-map-cross-plugin-reference)
- The [Anthropic Trust Center](https://trust.anthropic.com/) for Anthropic's own legal/compliance posture (relevant when reviewing DPAs that reference Anthropic services)
