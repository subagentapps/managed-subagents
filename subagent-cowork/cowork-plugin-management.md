# cowork-plugin-management

**Upstream:** [`anthropics/knowledge-work-plugins/cowork-plugin-management`](https://github.com/anthropics/knowledge-work-plugins/tree/main/cowork-plugin-management)

**Install:** `claude plugins add knowledge-work-plugins/cowork-plugin-management`

## What it does

The **meta-plugin**. Creates, customizes, and manages other plugins. Configures MCP servers, adjusts plugin behavior, adapts templates to match how your team works.

It has skills only — no `commands/`, no `.mcp.json`, no `CONNECTORS.md`. The skills are about authoring/managing plugins, not about consuming a connector category.

## Why this matters for the migration strategy

Every other plugin in this directory is something you *use*. This one is what you use to **customize** the others. If you fork `legal` and tighten the playbook for your jurisdiction, or add a new skill to `engineering` for your CI/CD MCP — you do that with `cowork-plugin-management` skills.

## Programmatic migration strategy

Use this plugin's skills programmatically when you want to:

1. Generate a *new* knowledge-work plugin tailored to a domain not yet covered (e.g., "policy-research", "investor-relations")
2. Bulk-customize templates across all plugins (e.g., switch every `~~chat` default from Slack to Teams in a Teams-first org)
3. Audit which plugins are installed and which connectors they want vs which are configured

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/cowork-plugin-management",
  skill: "<plugin-authoring-skill>",
  prompt: "Audit all installed knowledge-work plugins; report which `~~category` placeholders have no MCP configured.",
  permissionMode: "plan",
});
```

This is the practical pair of `subagent-skills/skill-creator.md` (the meta-skill for authoring individual *skills*). cowork-plugin-management operates at the *plugin* level — one tier higher.

## See also

- `../subagent-skills/skill-creator.md` — for authoring individual skills (one tier below this)
- `../subagent-plugins/plugins-reference.md` — full plugin spec
