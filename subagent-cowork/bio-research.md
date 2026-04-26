# bio-research

**Upstream:** [`anthropics/knowledge-work-plugins/bio-research`](https://github.com/anthropics/knowledge-work-plugins/tree/main/bio-research)

**Install:** `claude plugins add knowledge-work-plugins/bio-research`

## What it does

Preclinical research: literature search, genomics analysis, target prioritization, accelerating early-stage life sciences R&D.

## Connectors required

| Category | Placeholder | Included | Alternatives |
|---|---|---|---|
| Literature | `~~literature` | PubMed, bioRxiv | Google Scholar, Semantic Scholar |
| Scientific illustration | `~~scientific illustration` | BioRender | — |
| Clinical trials | `~~clinical trials` | ClinicalTrials.gov | EU Clinical Trials Register |
| Chemical database | `~~chemical database` | ChEMBL | PubChem, DrugBank |
| Drug targets | `~~drug targets` | Open Targets | UniProt, STRING |
| Data repository | `~~data repository` | Synapse | Zenodo, Dryad, Figshare |
| Journal access | `~~journal access` | Wiley Scholar Gateway | Elsevier, Springer Nature |
| AI research | `~~AI research` | Owkin | — |
| **Lab platform** | `~~lab platform` | Benchling\* | — |

\* Benchling placeholder — MCP URL not yet configured upstream.

**Connector gaps:** lab platform is the only practical gap (Benchling is the dominant tool but its MCP wasn't wired at writing time).

## Programmatic migration strategy

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/bio-research",
  skill: "<skill-id>",
  connectors: {
    "~~literature":      { server: "pubmed" },
    "~~chemical database": { server: "chembl" },
    "~~drug targets":    { server: "open-targets" },
    "~~lab platform":    { server: process.env.BENCHLING_MCP || null, required: false },
  },
  prompt: "Find recent (2024+) literature on STING agonists for solid tumors and summarize mechanism.",
  permissionMode: "plan",
});
```

This is the most domain-specific plugin in the marketplace. Most categories have unique tools (PubMed, ChEMBL, Open Targets) that don't overlap with other plugins. **If you don't work in life sciences, this plugin is irrelevant** — list it for completeness only.

## See also

- `anthropics/life-sciences` repo (separate, listed in skills.sh) — related Anthropic life-sciences work
