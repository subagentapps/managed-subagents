# pdf-viewer

**Upstream:** [`anthropics/knowledge-work-plugins/pdf-viewer`](https://github.com/anthropics/knowledge-work-plugins/tree/main/pdf-viewer)

**Install:** `claude plugins add knowledge-work-plugins/pdf-viewer`

## What it does

PDF viewing and annotation. Local-only — no remote connector.

## Connectors required

| Category | Server | How it runs |
|---|---|---|
| PDF viewer & annotator | `@modelcontextprotocol/server-pdf` | Local stdio via `npx` (auto-installed) |

**Requirements:**
- Node.js ≥ 18
- Internet access for remote PDFs (arXiv, bioRxiv, etc.)
- No API keys, no auth

## Programmatic migration strategy

This is the simplest plugin in the marketplace — single local MCP server, no choices to make. Either it works (Node 18+ is installed) or it doesn't.

```ts
await orchestrator.runPlugin({
  plugin: "knowledge-work-plugins/pdf-viewer",
  prompt: "Summarize https://arxiv.org/pdf/2412.13678",
  permissionMode: "default",
});
```

**Cross-platform parity:** the `npx` install runs on both CLI and `claude-code-on-the-web` (Node is preinstalled in the web sandbox). For arXiv URLs the egress allowlist needs to permit `arxiv.org`; check the [Default allowed domains](https://code.claude.com/docs/en/claude-code-on-the-web#default-allowed-domains) before assuming it works.

## See also

- `bio-research` plugin — typical companion (PDFs of papers from PubMed, ChEMBL, etc.)
- `legal` plugin — typical companion (contract PDFs)
