# subagent-docs — Project Plan

Generated 2026-04-26. A retrieval-ready mirror of Anthropic + Claude Code documentation, scoped for injection into Claude Code subagent prompts at runtime.

> **STATUS (2026-04-27):** This plan describes the **subagent-docs subproject** specifically — a docs-corpus mirror. The repo `managed-subagents` evolved during the day-1 speed-run to encompass much more (orchestrator, crawlers, cowork plugins, MCP servers). The patterns in this file (JSONL + Redis two-tier store, Context7 ingestion, llms.txt sources) remain the canonical design for the docs-corpus subproject *when it is built*. No `subagent-docs/` directory exists today — work absorbs into related subprojects. See `CLAUDE_CLI_MAX_PLAN_AGENT_AS_AUTONOMOUS_WEB_PR_ORCHESTRATOR_PLAN.md` for the orchestrator design that took priority. All §11 decisions settled.

---

## 0. Why this repo exists

Subagents (Explore, Plan, Agent SDK verifiers, code-architect, etc.) routinely need fresh, accurate information about: the Anthropic API, Claude Code CLI, Agent SDK, prompt-engineering best practices, and Skills. Three problems with the current state:

| Problem | Today | With this repo |
|---|---|---|
| Training-data drift | Models cite APIs that no longer exist | Snippets are dated and source-cited |
| Tool dependency | Every subagent re-queries Context7 (rate limits, latency, vendor risk) | Local Redis hit in <2ms, no network |
| Lossy retrieval | Context7's top-k may miss what you need | We hold the whole corpus and do our own ranking |
| No reproducibility | Two subagent runs return different snippets for the same query | Snapshot per ingestion run, immutable |

This is **not** a replacement for Context7 — it's a local cache + canonical store. Context7 is the upstream; we treat it as one of several sources, alongside Anthropic's own `llms.txt` and the raw GitHub repos.

---

## 1. Naming decision (recorded)

Considered: `subagent-memories`, `subagent-docs`, `subagent-prompts`.

**Picked: `subagent-docs`.**

- The artifact is a documentation corpus. Name what it is.
- `subagent-memories` collides with the existing `~/.claude/projects/<id>/memory/MEMORY.md` system. Two "memory" stores answering different questions = guaranteed confusion in agent prompts.
- `subagent-prompts` describes the consumer (prompt templates), not the data (context to inject). Wrong layer.
- Leaves namespace open for sibling repos: future `subagent-prompts` can hold reusable prompt templates that *consume* `subagent-docs`.

If the repo ends up serving non-subagent code paths too (orchestrator, main agent), rename to `agent-docs`. Decision deferred until at least one consumer outside Claude Code subagents exists.

---

## 2. Scope

### In scope (v0.1)

- Markdown snippet corpus from these sources:
  - **Context7** (REST `/api/v1/<libraryId>?type=txt`) — 11 Anthropic-relevant library IDs, listed in §5.
  - **Anthropic `llms-full.txt`** mirrors at `platform.claude.com` and `code.claude.com`.
  - **`anthropics/claude-code` GitHub repo** — source-of-truth for CLI behavior, especially `/docs/**` if/when it has one.
- A loader that splits snippets on the standard separator and indexes them into Redis (or SQLite for local dev).
- A retrieval CLI: `subagent-docs query "<question>" --library /anthropics/claude-code` returns top-k snippets in markdown.
- A weekly cron that re-pulls and diffs.

### Out of scope (for now)

- Embedding/vector search. v0.1 uses BM25 over snippet bodies, plus exact-match on `Source:` URLs. Vector search is v0.2 — see §10.
- Non-Anthropic libraries. Add later if a use case demands it.
- Web UI. CLI + library access only.
- Mirroring back into Context7 via `POST /v2/add/*`. Possible v0.3 — see §10.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ INGESTION (cron, weekly)                                         │
│                                                                  │
│  ┌─────────────┐   ┌──────────────────┐   ┌──────────────────┐   │
│  │ Context7    │   │ platform.claude  │   │ github.com/      │   │
│  │ /api/v1/... │   │ .com/llms-full   │   │ anthropics/...   │   │
│  └──────┬──────┘   └────────┬─────────┘   └────────┬─────────┘   │
│         │                   │                      │              │
│         ▼                   ▼                      ▼              │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  fetcher.py  — downloads, dedupes, normalizes to        │    │
│  │  Snippet { id, source_url, library_id, title, body,     │    │
│  │            fetched_at, sha256 }                         │    │
│  └────────────────────────────┬─────────────────────────────┘    │
│                               ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  store/  — JSONL files, one per library, content-hashed │    │
│  │  filename. Git-tracked. snapshots/YYYY-MM-DD/<lib>.jsonl│    │
│  └────────────────────────────┬─────────────────────────────┘    │
│                               ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  loader.py  — reads JSONL, writes to Redis              │    │
│  │  Redis keys:                                             │    │
│  │    snippet:{sha256}            → JSON snippet           │    │
│  │    library:{id}                → SET of snippet hashes  │    │
│  │    bm25:{library}              → RediSearch FT.SEARCH   │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ RETRIEVAL (live, from subagent prompt construction)              │
│                                                                  │
│  subagent → MCP tool / CLI → query.py → Redis FT.SEARCH         │
│           → top-k snippets → returned to subagent as XML        │
│             <documents><document><source>... (matches the      │
│             format from GIT_SETUP_REFERENCE.md §0)              │
└──────────────────────────────────────────────────────────────────┘
```

### Two-tier storage rationale

- **Git-tracked JSONL** is the canonical store. Survives if Redis is wiped, machine is rebuilt, or you migrate hosts. Diffs are reviewable in PRs.
- **Redis** is the hot index. Rebuilt from JSONL on demand. Holds BM25 indexes and small enough to fit in your existing Upstash Redis or a local instance.

Files in `snapshots/` are content-addressed by snippet hash, so the diff between two ingestion runs is a clean set-add / set-remove. Lets you `git log` the *upstream* changing.

---

## 4. Repo layout

```
subagent-docs/
├── README.md                  # short pitch + quickstart
├── PROJECT_PLAN.md            # this file
├── pyproject.toml             # uv-managed; deps: httpx, redis, click, structlog
├── .python-version            # 3.13
├── src/subagent_docs/
│   ├── __init__.py
│   ├── fetcher.py             # the 3 ingestion paths
│   ├── snippet.py             # the Snippet dataclass + parser
│   ├── store.py               # JSONL read/write
│   ├── loader.py              # JSONL → Redis
│   ├── query.py               # Redis FT.SEARCH wrapper
│   └── cli.py                 # `subagent-docs <subcommand>`
├── snapshots/
│   └── 2026-04-26/
│       ├── _anthropics_claude-code.jsonl
│       ├── _websites_platform_claude_en.jsonl
│       └── ...
├── tests/
│   ├── test_snippet_parser.py
│   ├── test_fetcher_recordings.py   # vcrpy cassettes
│   └── test_loader.py
├── scripts/
│   ├── backfill.sh            # one-shot full pull (the script from research)
│   └── refresh.sh             # incremental, called by cron
└── .github/workflows/
    └── refresh.yml            # weekly cron, opens PR with diff
```

Stack choice: Python 3.13 + uv (matches your existing patterns per `aliases.zsh:54` `pip='uv pip'`). Redis with the RediSearch module for BM25. If RediSearch isn't available, fall back to SQLite FTS5 — the loader is a 30-line swap.

---

## 5. Ingestion sources (v0.1 manifest)

Stored as `src/subagent_docs/sources.toml`:

```toml
[[context7]]
id = "/anthropics/claude-code"
priority = "high"

[[context7]]
id = "/anthropics/claude-agent-sdk-python"
priority = "high"

[[context7]]
id = "/anthropics/anthropic-sdk-python"
priority = "high"

[[context7]]
id = "/anthropics/anthropic-sdk-typescript"
priority = "high"

[[context7]]
id = "/anthropics/courses"
priority = "medium"

[[context7]]
id = "/anthropics/skills"
priority = "medium"

[[context7]]
id = "/anthropics/anthropic-quickstarts"
priority = "low"

[[context7]]
id = "/websites/platform_claude_en"
priority = "high"
note = "14,985 snippets, 2.6M tokens — the big one"

[[context7]]
id = "/websites/code_claude"
priority = "high"
note = "5,601 snippets, 530k tokens — Claude Code docs"

[[context7]]
id = "/websites/platform_claude_en_agents-and-tools"
priority = "high"

[[context7]]
id = "/websites/anthropic_engineering_advanced-tool-use"
priority = "medium"

[[llmstxt]]
url = "https://platform.claude.com/llms-full.txt"
priority = "high"

[[llmstxt]]
url = "https://code.claude.com/llms-full.txt"
priority = "high"

[[github]]
repo = "anthropics/claude-code"
paths = ["docs/**", "*.md"]
priority = "high"
```

Total estimated payload: **~3.5–4M tokens, <20 MB compressed**. Trivial.

---

## 6. Snippet schema

The Context7 separator `--------------------------------` already gives us a clean split. Each chunk has the shape:

```
### {title}

Source: {source_url}

{body, often a code block}
```

We normalize to:

```python
@dataclass(frozen=True)
class Snippet:
    sha256: str               # content hash, stable id
    library_id: str           # e.g. "/anthropics/claude-code"
    title: str
    source_url: str | None    # exact URL from the snippet, when present
    body: str                 # raw markdown body
    fetched_at: datetime      # ingestion time
    fetched_from: str         # "context7" | "llmstxt" | "github"
    fetch_run_id: str         # ULID, ties to a snapshots/ directory
```

`sha256` is over `title + body` (excluding `fetched_at`), so the same snippet across two runs is the same id. Lets the loader do a clean set-diff in Redis.

---

## 7. Retrieval API

### CLI

```bash
# Index all snapshots into Redis
subagent-docs reindex

# Query
subagent-docs query "long context prompt engineering" --library /websites/platform_claude_en --top 5

# Output: 5 markdown snippets, separated by ---, with Source: headers preserved.
# Designed to be paste-able into a prompt under <documents>.
```

### As a Python library (for in-process subagents)

```python
from subagent_docs import query

snippets = query.search(
    "credential helper macos osxkeychain",
    libraries=["/anthropics/claude-code", "/websites/code_claude"],
    top=5,
)
prompt_block = query.format_xml(snippets)   # returns <documents>...</documents>
```

### As an MCP server (v0.2)

A thin wrapper exposing `subagent-docs.query` and `subagent-docs.list-libraries` as MCP tools, registerable in `~/.claude/settings.json` like the existing Context7 server. Lets every subagent get docs without going to the network.

---

## 8. Operational concerns

| Concern | Mitigation |
|---|---|
| **Context7 rate limits** | API key in `CONTEXT7_API_KEY` env var (you already have one if you ran `npx ctx7 setup`). 1s sleep between library pulls in `backfill.sh`. |
| **Stale data** | Weekly cron via GitHub Actions. Opens a PR with the JSONL diff so you can review what changed before merging. |
| **Secrets in fetched content** | Snippets sometimes contain example API keys (real or placeholder). The loader runs a regex scrub for `gho_*`, `sk-ant-*`, `ghp_*`, etc. before writing JSONL. |
| **Redis unavailability** | CLI falls back to SQLite FTS5 over the same JSONL. Slower (~50ms instead of ~2ms) but functional. |
| **Vendor risk (Context7 changes API)** | Version-pin the API path. If `/v1/` deprecates, keep working from the JSONL snapshots until updated. |

---

## 9. Milestones

| # | Deliverable | Definition of done | Estimated |
|---|---|---|---|
| M0 | Repo bootstrap | `pyproject.toml`, `src/`, `tests/` skeleton, CI lint+typecheck passing | 1h |
| M1 | Backfill script (Option A from research) | `scripts/backfill.sh` produces 11 JSONL files in `snapshots/{date}/`. Total under 20MB. | 2h |
| M2 | Snippet parser + tests | Round-trip test: parse → serialize → parse identical. ≥95% coverage on `snippet.py`. | 2h |
| M3 | Redis loader + BM25 index | `subagent-docs reindex` populates Redis; `query` returns >0 results for "extended thinking" against the platform_claude_en library. | 3h |
| M4 | CLI ergonomics | `subagent-docs --help` lists all subcommands; `--format xml` returns `<documents>` block ready for prompt injection. | 2h |
| M5 | Weekly refresh workflow | GitHub Actions runs `refresh.sh`, commits new snapshot, opens PR. | 2h |
| M6 | MCP server wrapper | Registered in `~/.claude/settings.json`, subagent can call `subagent-docs.query` natively. | 4h |

Total: ~16h to working v0.1, ~20h with M6.

---

## 10. Future (not in v0.1)

- **Embedding-based ranking.** Generate embeddings (Voyage AI for highest quality with Anthropic, or Upstash Vector since the corpus is Upstash-style). Hybrid BM25+vector. Graduates to v0.2 when BM25 alone misses too many queries — measure before adding.
- **Cross-repo `agent-docs` consolidation.** If orchestrator and other non-subagent paths want this corpus, rename + add a stable HTTP API.
- **Push-to-Context7.** `POST /v2/add/repo/github` to mirror your *own* private repos into Context7's format, then ingest them back. Useful if/when you accumulate internal docs worth indexing.
- **Diff-aware re-embedding.** Only re-embed snippets whose `sha256` changed. Once embeddings exist, re-embedding is the expensive step.

---

## 11. Decisions (settled 2026-04-27)

| # | Decision | Resolution |
|---|---|---|
| 1 | Redis: local Docker, Upstash cloud, or both? | **Both.** Local Docker for dev (fast, free, RediSearch included); Upstash for shared/prod. Loader is the same code; only the connection string differs. Aligns with the Tier 1 MCP install of `server-redis` (PR #19). |
| 2 | Snapshots in git LFS? | **No.** 20MB total, 11 files — commit directly. Re-evaluate at >100MB. |
| 3 | License? | **MIT.** Settled in PR #31; matches Anthropic skills + Context7. |
| 4 | Repo location? | **Settled** at `github.com/subagentapps/managed-subagents`. Repo name (`managed-subagents`) intentionally encompasses more than this plan's `subagent-docs` scope — see STATUS header below. |

---

## 12. Bootstrap checklist

Repo is at `~/claude-projects/github-organizations/subagentapps/managed-subagents` (org `subagentapps`, repo `managed-subagents`). Currently contains only `README.md` (20 B) and this `PROJECT_PLAN.md`.

- [ ] `cd ~/claude-projects/github-organizations/subagentapps/managed-subagents`
- [ ] `uv init --python 3.13 && uv add httpx redis click structlog vcrpy`
- [ ] Resolve §11 open decisions (Redis target, license) and commit answers to `DECISIONS.md`.
- [ ] Implement M0–M3 in order; M4–M6 are independent and parallelizable.
