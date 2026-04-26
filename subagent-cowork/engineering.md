# engineering

**Upstream:** [`anthropics/knowledge-work-plugins/engineering`](https://github.com/anthropics/knowledge-work-plugins/tree/main/engineering) · [README](https://github.com/anthropics/knowledge-work-plugins/blob/main/engineering/README.md) · [CONNECTORS](https://github.com/anthropics/knowledge-work-plugins/blob/main/engineering/CONNECTORS.md)

**Install:** `claude plugins add knowledge-work-plugins/engineering`

## What it does

Standups, code review, debugging, ADRs, incident response, deploy checklists. Everything works **standalone** (paste / describe) and **supercharged** with MCP connectors.

## Commands

| Command | Purpose |
|---|---|
| `/standup` | Standup from commits + PRs + tickets + chat |
| `/review` | Security / performance / style / correctness review |
| `/debug` | Reproduce → isolate → diagnose → fix |
| `/architecture` | ADR with trade-off analysis |
| `/incident` | Triage → communicate → mitigate → postmortem |
| `/deploy-checklist` | Pre-deploy verification checklist |

## Skills

| Skill | Coverage |
|---|---|
| `code-review` | Bugs, security, performance, maintainability |
| `incident-response` | Status updates, runbooks, postmortems |
| `system-design` | Architecture diagrams, API design, data modeling |
| `tech-debt` | Identify, categorize, prioritize, remediation plan |
| `testing-strategy` | Unit / integration / e2e plans |
| `documentation` | READMEs, API docs, runbooks, onboarding |

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| Chat | `~~chat` | Slack | Microsoft Teams |
| Source control | `~~source control` | GitHub | GitLab, Bitbucket |
| Project tracker | `~~project tracker` | Linear, Asana, Atlassian | Shortcut, ClickUp |
| Knowledge base | `~~knowledge base` | Notion | Confluence, Guru, Coda |
| Monitoring | `~~monitoring` | Datadog | New Relic, Grafana, Splunk |
| Incident management | `~~incident management` | PagerDuty | Opsgenie, Incident.io, FireHydrant |
| **CI/CD** | `~~CI/CD` | **— (gap)** | CircleCI, GitHub Actions, Jenkins, BuildKite |

**Connector gaps:** CI/CD has no included server. GitHub Actions is reachable through the GitHub MCP for runs+logs; for CircleCI/Jenkins you bring your own.

## Skill → connector matrix

| Skill | Hard requirement | Soft (degrades gracefully) |
|---|---|---|
| `code-review` | — | source control (auto-pull diff) |
| `incident-response` | — | monitoring, incident management, chat |
| `system-design` | — | knowledge base (find prior ADRs) |
| `tech-debt` | — | source control, project tracker |
| `testing-strategy` | — | source control |
| `documentation` | — | knowledge base, source control |

## Settings file

The plugin reads `engineering/.claude/settings.local.json`:

```json
{
  "name": "alexzh",
  "title": "Software Engineer",
  "team": "your-team",
  "company": "your-company",
  "techStack": ["Python", "TypeScript", "PostgreSQL", "AWS"],
  "defaultBranch": "main",
  "deployProcess": "canary"
}
```

## Programmatic migration strategy

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/engineering",
  skill: "code-review",
  connectors: {
    "~~source control": { server: "github" },
    "~~chat":           { server: "slack", required: false },
  },
  prompt: "/review https://github.com/subagentapps/managed-subagents/pull/123",
  permissionMode: "plan",
});
```

This plugin overlaps heavily with this repo's own use case — `subagent-typescript/` and `subagent-python/` are themselves engineering work, so `/review` and `/standup` against this repo are useful as dogfooding.

## See also

- `../subagent-skills/skill-creator.md` — the meta-skill for authoring new skills (use it if you want to extend `engineering` with project-specific patterns)
- `../subagent-evaluations/` — your eval substrate; `/review` results are a good input to the success metrics
