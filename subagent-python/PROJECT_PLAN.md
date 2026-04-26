# subagent-python — Project Plan

Generated 2026-04-26. The Python crawler. Runs locally (or in a Cloudflare Container). Writes to the same shared warehouse described in `../SHARED_DATA_MODEL.md`. Pairs with `../subagent-typescript/PROJECT_PLAN.md` (different stage, same warehouse, complementary).

---

## 0. Role

This subproject owns **backfills, exploratory crawls, deep extraction, and analytics**. Different role from the TypeScript sibling:

| Concern | TypeScript subproject | This subproject |
|---|---|---|
| Where it runs | Cloudflare (Workers + DO + Queue) | Local laptop, or Cloudflare Container, or any Linux box |
| Trigger | Cron Triggers (every N minutes) | Ad-hoc CLI, or a one-shot scheduled job |
| Volume per run | ~1k–10k URLs (incremental) | 100k+ URLs (full backfills, historical sweeps) |
| Sophistication | Surface-level: hash, parse, store | Deep: schema inference, NLP enrichment, analytics |
| Data ecosystem | None — straight to D1/R2 | Polars, DuckDB, dbt, Jupyter, matplotlib |

The TS sibling keeps the warehouse fresh. This sibling does the things you *can't* do well in 10s of CPU on a Worker: backfilling 4,124 support articles in one shot, computing a per-domain change-frequency histogram, generating embeddings for retrieval, and producing dbt seeds.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | Python 3.13 (matches `aliases.zsh:54` `pip='uv pip'` pattern from your shell setup) | uv-managed; fast; same python you already run |
| Crawler | [Scrapy 2.13+](https://scrapy.org/) | Mature, async, item pipelines, middlewares, robots.txt + politeness built-in |
| HTTP | Scrapy's built-in (Twisted-based) + [`httpx`](https://www.python-httpx.org/) for ad-hoc API fetches outside spiders | Scrapy for crawls, httpx for one-offs |
| JSON | [`orjson`](https://github.com/ijl/orjson) (per your spec) | 3–10× faster than `json`; deterministic key order option for hashing |
| Browser fetch | [`scrapy-playwright`](https://github.com/scrapy-plugins/scrapy-playwright) | Standard Scrapy Playwright integration for JS pages |
| Storage | Same D1 + R2 as the TS sibling, accessed via Cloudflare API | Single warehouse; no second store |
| D1 client | Cloudflare REST API (`/d1/{db}/query`) wrapped in a thin client | D1 has no Python driver; REST works |
| R2 client | `boto3` against the R2 S3-compatible endpoint | Standard pattern |
| Bloom filter | [`pybloom-live`](https://pypi.org/project/pybloom-live/) | Maintained, scalable bloom variants |
| HTML→markdown | [`readability-lxml`](https://github.com/buriy/python-readability) + [`markdownify`](https://github.com/matthewwithanm/python-markdownify) | Same role as the JS pair |
| Sitemap | [`ultimate-sitemap-parser`](https://pypi.org/project/ultimate-sitemap-parser/) | Handles index-of-sitemaps recursively, lastmod-aware |
| Atom/RSS (arXiv, YouTube) | [`feedparser`](https://feedparser.readthedocs.io/) | Standard |
| `llms.txt` | Custom parser, ~50 LoC | Same shape as TS parser, mirrored |
| Analytics | [`polars`](https://pola.rs/), [`duckdb`](https://duckdb.org/), [`great-tables`](https://posit-dev.github.io/great-tables/) | Modern data stack; faster than pandas; SQL where convenient |
| Dev | `uv`, `ruff`, `pyright`, `pytest`, `vcrpy` | Standard 2026 Python toolchain |

---

## 2. Deployment shape

Two deployment modes, both written from the same code:

### Mode A — local CLI (default)

```bash
$ subagent-py crawl --strategy=backfill --seed=support.claude.com/sitemap.xml
$ subagent-py crawl --strategy=incremental --max-urls=10000
$ subagent-py analyze --domain=anthropic.com --since=2026-04-01
```

Runs on your laptop. Reads `seeds.toml` (the same one the TS sibling uses), writes to D1/R2 over CF REST. Useful for: backfills, debugging, ad-hoc queries.

### Mode B — Cloudflare Container

```dockerfile
FROM python:3.13-slim
COPY . /app
RUN uv sync
CMD ["uv", "run", "subagent-py", "crawl", "--strategy=backfill"]
```

Deployed to Cloudflare Containers (now GA per your earlier message, scheduled by Cron Triggers). Useful for: scheduled deep backfills (weekly/monthly), running long Playwright sessions that would exceed Worker CPU limits.

**v0.1 ships Mode A only.** Mode B documented as a 2-hour follow-up once the local code is solid.

---

## 3. Repo layout

```
subagent-python/
├── README.md
├── PROJECT_PLAN.md
├── pyproject.toml              # uv-managed; ruff + pyright + pytest config inline
├── .python-version             # 3.13
├── src/subagent_py/
│   ├── __init__.py
│   ├── cli.py                  # `subagent-py <subcommand>`
│   ├── spiders/
│   │   ├── llmstxt_spider.py
│   │   ├── sitemap_spider.py
│   │   ├── api_catalog_spider.py    # npm, GH, HF, arXiv, YouTube
│   │   ├── markdown_spider.py
│   │   ├── html_spider.py
│   │   └── browser_spider.py        # scrapy-playwright
│   ├── parsers/                     # one per page type, mirroring TS sibling
│   │   ├── llmstxt.py
│   │   ├── sitemap.py
│   │   ├── npm_package.py
│   │   ├── github_repo.py
│   │   ├── huggingface.py
│   │   ├── arxiv_atom.py
│   │   ├── youtube_rss.py
│   │   ├── readability_html.py
│   │   └── trust_center.py
│   ├── pipelines/
│   │   ├── content_hash.py          # compute SHA-256, set was_changed
│   │   ├── r2_upload.py
│   │   └── d1_upsert.py
│   ├── store/
│   │   ├── d1_client.py             # CF REST wrapper for D1
│   │   ├── r2_client.py             # boto3 S3-compatible
│   │   └── bloom.py                 # pybloom-live; serialize to R2 on demand
│   ├── seeds/
│   │   └── load.py                  # reads ../subagent-typescript/src/seeds/seeds.toml (single source of truth)
│   ├── analytics/
│   │   ├── change_frequency.py      # per-seed empirical refresh cadence
│   │   ├── corpus_stats.py          # entity counts by type/publisher/domain
│   │   └── notebooks/               # jupyter; great-tables outputs
│   ├── shared/
│   │   ├── content_type.py
│   │   ├── hash.py
│   │   ├── politeness.py
│   │   └── time.py
│   └── settings.py                  # Scrapy settings
├── tests/
│   ├── parsers/
│   ├── fixtures/
│   └── e2e/
└── scripts/
    ├── backfill-support-claude.sh   # one-shot full backfill of all 4,124 support articles
    └── refresh-snapshot.sh          # weekly snapshot for diffing
```

**Note:** `seeds.toml` is read from the TypeScript sibling's location, not duplicated. One source of truth, two consumers. CI verifies both subprojects parse it without error.

---

## 4. Scrapy item pipelines

Scrapy's pipeline pattern fits the data flow exactly:

```
Spider yields RawResponseItem
  ↓
ContentHashPipeline       → adds sha256, looks up D1, sets was_changed
  ↓ (if was_changed=0, drop here)
R2UploadPipeline          → puts body to R2 keyed by sha256
  ↓
ParsePipeline             → dispatches to typed parser, yields TypedItem(s)
  ↓
D1UpsertPipeline          → batches inserts to D1 via REST (batched per spider close)
```

`ITEM_PIPELINES` in `settings.py` defines the order. Drop in `ContentHashPipeline` short-circuits unchanged content — same change-detection rules as TS sibling §6.

---

## 5. seeds.toml — shared source of truth

Reads `../subagent-typescript/src/seeds/seeds.toml` directly. Same TOML, same fields, same semantics. The TS sibling is responsible for upserting into `fact_crawl_seed`; this subproject reads from `fact_crawl_seed` directly via D1 query (or from the TOML for offline operation).

If a backfill needs seeds the TS sibling doesn't know about (e.g., a one-time historical sweep), they go in `subagent-python/src/subagent_py/seeds/backfill-only.toml` — separate file, not synced to D1.

---

## 6. Specific Python-only capabilities

### 6.1 Polars/DuckDB analytics

Pull all `fact_crawl_event` rows from D1 once a week, hand to Polars/DuckDB for:

- Per-seed change-frequency histogram (informs `cron_schedule` tuning)
- Per-host failure-rate dashboard (which sites bot-block us; which need Browser Rendering)
- Entity-type growth curves (how fast is the skill catalog growing?)
- Snippet token-count distribution (useful for the docs-corpus retrieval consumer)

These outputs land in `analytics/notebooks/` as Jupyter notebooks rendered to HTML for review.

### 6.2 Embedding pipeline (v0.2, not v0.1)

Once the warehouse has stable rows, run `voyage-3-large` (or your chosen embedding model) over snippet bodies. Polars handles the batched embedding, DuckDB stores vectors locally for fast experimentation, then snapshot to R2 for production. Defer to v0.2 — not needed until the docs-corpus retrieval is real.

### 6.3 Deep parsers Scrapy is good at

| Source | Why Python is better here |
|---|---|
| `support.claude.com/sitemap.xml` (4,124 URLs) | Scrapy's request queue + `AUTOTHROTTLE` handles polite crawling at scale better than Workers |
| Trust center HTML scraping | Compliance docs need careful structure extraction; iterative dev easier in Jupyter |
| arXiv full-text PDF extraction | PyMuPDF / pdfplumber are Python-native; no good TS equivalent |
| YouTube transcript extraction (if/when in scope) | `youtube-transcript-api` is Python-only |

### 6.4 dbt-driven backfills

When dbt models surface a gap (e.g., "we have 50 references to arxiv:2412.13678 but no `fact_arxiv_paper_revision` row"), this subproject can be invoked to fill the gap:

```bash
$ subagent-py crawl --strategy=backfill --arxiv-id=2412.13678
```

This is the canonical "fill in missing data" tool. The TS sibling never does this — it only does the recurring crawl.

---

## 7. Milestones

| # | Deliverable | Done when | Estimated |
|---|---|---|---|
| M0 | `uv init`, `pyproject.toml`, ruff + pyright passing on empty project | `uv run pyright` exits 0 | 1h |
| M1 | D1 + R2 clients (`d1_client.py`, `r2_client.py`); CF API key in env | Round-trip test: write a row to D1, fetch it back | 2h |
| M2 | `seeds/load.py` reads shared TOML; emits Scrapy start_urls | `subagent-py seeds list` prints all ~50 entries | 1h |
| M3 | API-catalog spider + parsers (npm, GH, HF, arXiv, YouTube) | Backfilling Anthropic + MCP npm scopes yields 84 npm package rows in D1 | 5h |
| M4 | llms.txt + sitemap spiders | Backfilling `platform.claude.com/llms-full.txt` + `support.claude.com/sitemap.xml` yields 14k + 4,124 entity observations | 4h |
| M5 | Markdown + HTML spiders + readability/markdownify | Backfilling `claude.com/blog/` yields markdown bodies in R2 | 3h |
| M6 | scrapy-playwright spider for JS pages | Backfilling 5 JS-heavy `claude.com/blog/*` pages succeeds end-to-end | 4h |
| M7 | ContentHashPipeline (the change-detection short-circuit) | Re-running an unchanged backfill emits 0 R2 writes | 2h |
| M8 | Polars analytics: per-seed change-frequency table | `subagent-py analyze --change-frequency` prints a great-tables HTML | 3h |
| M9 | E2E backfill of support.claude.com (4,124 URLs) | All 4,124 land in D1 + R2; total time <30min; politeness respected (≥1s between requests per host) | 2h |

Total to v0.1: **~27h**. Independent of the TS sibling's timeline; both can be developed in parallel.

---

## 8. Out of scope (v0.1)

- Cloudflare Container deployment — Mode B above. Documented; not built.
- Embedding pipeline — §6.2.
- Mirroring our own private docs into Context7 (`POST /v2/add/repo/github`) — separate concern; deferred.
- Scheduling. This subproject is invoked manually or by external cron; it does not schedule itself.

---

## 9. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| D1 REST API rate limits when batching 4,124 inserts | Med | Batch size 100/request; `D1UpsertPipeline.close_spider()` handles flushing |
| scrapy-playwright + headless Chrome resource use | Med | Cap concurrent contexts at 4; respect per-host AUTOTHROTTLE |
| `seeds.toml` shape drift between this and TS sibling | Med | Shared schema test in CI runs against both subprojects |
| Python 3.13 + Scrapy compatibility | Low | Scrapy 2.13 supports 3.13; pin in `pyproject.toml` |
| Bot detection on long Scrapy runs | Low | Most target hosts are Anthropic-owned + Cloudflare-fronted; user-agent transparency |
| Cloudflare Container learning curve (when v0.2 happens) | Med | Mode A first; Mode B only after Mode A stabilizes |

---

## 10. Bootstrap checklist

- [ ] `cd ~/claude-projects/github-organizations/subagentapps/managed-subagents/subagent-python`
- [ ] `uv init --python 3.13 && uv add scrapy scrapy-playwright httpx orjson readability-lxml markdownify ultimate-sitemap-parser feedparser polars duckdb great-tables pybloom-live boto3`
- [ ] `uv add --dev ruff pyright pytest vcrpy`
- [ ] Implement M0 → M9 in order; M3 + M4 can run in parallel after M2.
- [ ] Confirm `seeds.toml` path resolution to TS sibling works in CI.

---

## 11. Inter-project contract with subagent-typescript

| Concern | Owner | Consumer |
|---|---|---|
| `fact_crawl_seed` writes (the seed list) | TS sibling (loads from `seeds.toml` on cron deploy) | Both |
| `fact_crawl_event` writes | Both (each tagged with `fetcher='crawlee-cf'` or `'scrapy-py'`) | dbt downstream |
| `fact_entity_observation` writes | Both | dbt builds `dim_entity` |
| `fact_*` typed snapshot writes | Both | dbt builds curated `*_current` views |
| `seeds.toml` source of truth | TS sibling repo | Read by Python at runtime |
| R2 raw body uploads | Both | dbt + retrieval consumers |
| Schema migrations | TS sibling owns `migrations/` | Python runs against migrated DB |

If we discover a divergence in observed-event semantics between fetchers (e.g., one of them sets `content_length` differently for chunked-encoded responses), reconciliation goes in dbt models, not in either crawler.
