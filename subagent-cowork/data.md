# data

**Upstream:** [`anthropics/knowledge-work-plugins/data`](https://github.com/anthropics/knowledge-work-plugins/tree/main/data) · [README](https://github.com/anthropics/knowledge-work-plugins/blob/main/data/README.md) · [CONNECTORS](https://github.com/anthropics/knowledge-work-plugins/blob/main/data/CONNECTORS.md)

**Install:** `claude plugins add knowledge-work-plugins/data`

## What it does

SQL authoring, dataset exploration, insights, visualizations, dashboards, stakeholder narratives.

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| Data warehouse | `~~data warehouse` | Snowflake\*, Databricks\*, BigQuery, Definite | Redshift, PostgreSQL, MySQL |
| Notebook | `~~notebook` | Hex | Jupyter, Deepnote, Observable |
| Product analytics | `~~product analytics` | Amplitude | Mixpanel, Heap |
| Project tracker | `~~project tracker` | Atlassian | Linear, Asana |

\* Snowflake/Databricks are placeholders upstream — MCP URL not yet configured. BigQuery is the safe default.

**Connector gaps:** none have an empty `Included` column, but Snowflake/Databricks aren't fully wired upstream.

## Programmatic migration strategy

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/data",
  skill: "<skill-id>",  // skill list per upstream README
  connectors: {
    "~~data warehouse":   { server: "bigquery" },  // safest default; swap to neon-postgres-mcp for this repo's stack
    "~~notebook":         { server: "hex", required: false },
    "~~product analytics": { server: "amplitude", required: false },
  },
  prompt: "Build a daily-active-users trend over the last 90 days, broken down by signup channel.",
  permissionMode: "plan",
});
```

**For this repo's stack:** point `~~data warehouse` at the Postgres 18 instance you'll pick in `CLI_COWORK_PLAN.md` (Neon / AlloyDB / RDS). The Postgres MCP is in the alternatives column.

## See also

- [Connector category map](./README.md#connector-category-map-cross-plugin-reference)
- `../SHARED_DATA_MODEL.md` — the warehouse this plugin would query in your stack
