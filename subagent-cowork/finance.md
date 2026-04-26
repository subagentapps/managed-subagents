# finance

**Upstream:** [`anthropics/knowledge-work-plugins/finance`](https://github.com/anthropics/knowledge-work-plugins/tree/main/finance)

**Install:** `claude plugins add knowledge-work-plugins/finance`

## What it does

Journal entries, reconciliation, financial statements, variance analysis, audit prep, month-end close.

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| Data warehouse | `~~data warehouse` | Snowflake\*, Databricks\*, BigQuery | Redshift, PostgreSQL |
| Email | `~~email` | Microsoft 365 | — |
| Office suite | `~~office suite` | Microsoft 365 | — |
| Chat | `~~chat` | Slack | Microsoft Teams |
| **ERP / Accounting** | `~~erp` | **— (gap)** | NetSuite, SAP, QuickBooks, Xero |
| **Analytics / BI** | `~~analytics` | **— (gap)** | Tableau, Looker, Power BI |

\* Snowflake/Databricks placeholders upstream.

**Connector gaps:** ERP and Analytics/BI both lack included servers — the two most important categories for finance work. Bring your own.

## Programmatic migration strategy

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/finance",
  skill: "<skill-id>",
  connectors: {
    "~~data warehouse": { server: "bigquery" },
    "~~erp":            { server: process.env.ERP_MCP || null, required: true },  // hard-required for journal entries
    "~~analytics":      { server: process.env.BI_MCP || null, required: false },
  },
  prompt: "Run variance analysis for Q1 actuals vs budget.",
  permissionMode: "plan",
});
```

**ERP gap is load-bearing.** Without an ERP MCP, journal-entry and reconciliation skills run on pasted CSVs only. NetSuite and QuickBooks have community MCPs; SAP does not as of 2026-04.

## See also

- `data` plugin — overlapping data warehouse / analytics needs
