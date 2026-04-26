# subagent-typescript — Project Plan

Generated 2026-04-26. The TypeScript crawler. Runs on Cloudflare. Writes to the shared warehouse described in `../SHARED_DATA_MODEL.md`. Pairs with `../subagent-python/PROJECT_PLAN.md` (different stage, same warehouse).

---

## 0. Role

This subproject owns **the recurring crawl**. It runs autonomously on Cloudflare, scheduled via Cron Triggers, and incrementally refreshes every seed in `seeds.toml` based on each seed's per-source cadence. Claude is **not** in the fetch loop. Output: rows in `fact_crawl_event`, `fact_entity_observation`, and the typed fact tables.

The Python sibling (`subagent-python/`) handles **backfills, exploratory crawls, and analytics** — different role, same warehouse, complementary not redundant.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript 5.x | Cloudflare Workers + Crawlee + npm ecosystem |
| Crawler | [Crawlee](https://crawlee.dev/) (`@crawlee/core`, `@crawlee/cheerio`, `@crawlee/playwright`) | Battle-tested, exponential backoff, request queue, robots.txt support, polite throttling all built-in |
| Browser fetch | [Cloudflare Browser Rendering API](https://developers.cloudflare.com/browser-rendering/) | Native CF integration; no Playwright in Workers; Browser Rendering handles JS-heavy pages |
| Runtime | Cloudflare Workers (Cron Triggers) + Durable Objects (frontier state) + Queues (fan-out) | Serverless, scheduled, stateful where needed |
| Storage | R2 (raw bodies, content-addressed) + D1 (warehouse, SQLite) | All Cloudflare-native; cheap; D1 fits ≤10M rows trivially |
| JSON serialization | Native `JSON.stringify` (V8 is fast) + `safe-stable-stringify` for content hashing (deterministic key order so hash stable) | TS equivalent of orjson |
| Hashing | Web Crypto API `crypto.subtle.digest('SHA-256', …)` | Native to Workers |
| Bloom filter (in-run) | [`bloom-filters`](https://www.npmjs.com/package/bloom-filters) npm package | Maintained, supports counting bloom + classic |
| HTML→markdown | [`turndown`](https://www.npmjs.com/package/turndown) + [`@mozilla/readability`](https://www.npmjs.com/package/@mozilla/readability) | Standard pair; readability strips chrome, turndown converts |
| Markdown→AST | [`unified`](https://unifiedjs.com/) + `remark-parse` | For when we need to extract structured snippets |
| Sitemap parsing | [`fast-xml-parser`](https://www.npmjs.com/package/fast-xml-parser) | Fast, no DOM dependency |
| `llms.txt` parsing | Custom — the format is simple markdown-list with a header | One file in `src/parsers/llmstxt.ts` |

---

## 2. Cloudflare topology

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        cron-trigger Worker                                │
│  triggered: every 10 min for high-priority seeds, hourly for medium,     │
│             daily for low (per-seed cron in fact_crawl_seed.cron_schedule)│
│  job: query D1 for seeds whose schedule fires now → enqueue to Queue     │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     ▼
                        ┌─────────────────────┐
                        │   crawl-queue       │  Cloudflare Queue
                        │   (per-seed jobs)   │
                        └────────┬────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       crawl-worker (consumer)                             │
│  for each queue message:                                                  │
│    1. read seed row from D1                                               │
│    2. resolve fetch tier (0–4) from seed.expected_tier + page_type       │
│    3. tier 0–3: plain fetch() with conditional headers                    │
│       tier 4 dynamic: fetch() if static, else CF Browser Rendering API   │
│    4. content-type validate; if wrong tier, fall back                     │
│    5. hash body → look up in D1 fact_crawl_event by content_sha256       │
│       if exists & matches: write event row with was_changed=0; stop      │
│    6. write body to R2 (key = sha256-prefixed path)                       │
│    7. dispatch to per-page-type parser:                                   │
│         - llms_txt → enqueue child URLs as new seeds (or just observe)   │
│         - sitemap_index → enqueue child URLs                              │
│         - api_catalog → loop pagination, emit one fact_entity_observation│
│           per item, plus typed fact rows                                  │
│         - markdown → emit one entity observation                          │
│         - readability_html → strip → markdown → emit observation         │
│    8. write fact_crawl_event + fact_entity_observation rows in one tx    │
└──────────────────────────────────────────────────────────────────────────┘

  ┌───────────────────────────┐    ┌────────────────────────────┐
  │  FrontierDO (Durable      │    │  R2 buckets:                │
  │  Object, one per crawl    │    │   subagent-raw              │
  │  run): in-mem bloom filter│    │   subagent-extracted        │
  │  for URL dedup; flushes   │    │  D1 database:               │
  │  to R2 if run >100k URLs  │    │   subagent_warehouse.db     │
  └───────────────────────────┘    └────────────────────────────┘
```

### Why hybrid (not pure Workers, not pure Containers)

- **Workers** are the right unit for stateless per-URL fetches. CPU-time is bounded but our fetch+parse is bounded too.
- **Browser Rendering API** is the only Cloudflare-native way to render JS-heavy pages. Used only when tier-3 (`.md` variant) doesn't exist and the HTML is JS-only.
- **Durable Objects** hold the in-run frontier bloom filter and per-host rate-limit state — the bits that need to span many requests in one run.
- **Queues** decouple cron-fan-in from per-page work so a slow page doesn't block the cron Worker.
- **D1** for warehouse rows; **R2** for blobs. Standard CF data layout.

We considered Cloudflare Containers (with Crawlee + Playwright in a long-lived container). Decision: **don't, in v0.1.** Containers are great for the Python sibling (which uses Scrapy and a long-lived process is natural), but for the TypeScript path, Browser Rendering + Workers cleanly avoids container ops. Containers documented as v0.2 escape hatch if Browser Rendering hits scaling limits.

---

## 3. Repo layout

```
subagent-typescript/
├── README.md
├── PROJECT_PLAN.md             # this file
├── package.json
├── tsconfig.json
├── wrangler.jsonc              # Cloudflare config: cron triggers, bindings, queues
├── src/
│   ├── workers/
│   │   ├── cron.ts             # cron-trigger Worker entrypoint
│   │   ├── consumer.ts         # crawl-queue consumer
│   │   └── frontier-do.ts      # FrontierDO Durable Object
│   ├── fetchers/
│   │   ├── tier0-llmstxt.ts
│   │   ├── tier1-api.ts        # npm registry, GitHub API, HF API, arXiv API, YouTube RSS
│   │   ├── tier2-sitemap.ts
│   │   ├── tier3-markdown.ts
│   │   ├── tier4-html.ts
│   │   └── tier4-browser.ts    # Browser Rendering API client
│   ├── parsers/
│   │   ├── llmstxt.ts
│   │   ├── sitemap.ts
│   │   ├── npm-package.ts
│   │   ├── github-repo.ts
│   │   ├── huggingface.ts
│   │   ├── arxiv-atom.ts
│   │   ├── youtube-rss.ts
│   │   ├── readability-html.ts
│   │   └── trust-center.ts     # parses red.anthropic.com etc.
│   ├── store/
│   │   ├── d1.ts               # typed D1 wrapper, prepared statements
│   │   ├── r2.ts               # R2 put-if-not-exists by sha256
│   │   └── bloom.ts            # in-mem bloom filter; serialize to R2 if needed
│   ├── seeds/
│   │   ├── seeds.toml          # the source-of-truth seed list (~50 entries)
│   │   └── load.ts             # parse seeds.toml → D1 fact_crawl_seed rows
│   ├── shared/
│   │   ├── content-type.ts     # validation rules per tier
│   │   ├── hash.ts             # SHA-256 helpers
│   │   ├── politeness.ts       # robots.txt + per-host limits
│   │   └── time.ts             # UTC ISO-8601 helpers
│   └── index.ts
├── tests/
│   ├── parsers/                # one test per parser, with fixture files
│   ├── fixtures/               # captured response bodies
│   └── e2e/                    # full crawl → D1 → assertion
└── migrations/
    ├── 0001_init.sql           # the DDL from SHARED_DATA_MODEL.md §5.1–5.3
    └── 0002_seed_dim.sql       # populate dim_entity_type, dim_page_type, dim_publisher
```

---

## 4. seeds.toml manifest

The full seed list lives in `src/seeds/seeds.toml`, not in this plan. New URLs = one TOML block. Loader (`src/seeds/load.ts`) upserts into `fact_crawl_seed`.

```toml
[[seed]]
request_url = "https://platform.claude.com/llms-full.txt"
fetch_strategy = "single_page"
expected_tier = 0
expected_content_type = "text/plain"
publisher = "Anthropic"
default_entity_type = "doc_page"
cron_schedule = "0 */6 * * *"
notes = "2.2M lines, refreshed daily"

[[seed]]
request_url = "https://support.claude.com/sitemap.xml"
fetch_strategy = "sitemap_index"
expected_tier = 2
expected_content_type = "application/xml"
publisher = "Anthropic"
default_entity_type = "support_article"
cron_schedule = "0 6 * * *"

[[seed]]
request_url = "https://registry.npmjs.org/-/user/zak-anthropic/package"
fetch_strategy = "api_catalog"
expected_tier = 1
expected_content_type = "application/json"
publisher = "Anthropic"
default_entity_type = "npm_package"
cron_schedule = "0 */12 * * *"

# … one block per source; ~50 blocks total at v0.1 launch
```

`seeds.toml` is the **only place** new URLs land. Adding a URL never requires plan changes.

---

## 5. Per-tier fetcher contracts

Each fetcher exports the same shape:

```ts
interface FetcherResult {
  responseUrl: string;
  statusCode: number;
  contentType: string | null;
  contentLength: number | null;
  etag: string | null;
  lastModified: string | null;
  bodyBytes: Uint8Array;
  bodySha256: string;
  fetchTier: 0 | 1 | 2 | 3 | 4;
  fetchDurationMs: number;
  errorClass?: 'timeout' | 'bot_blocked' | 'http_5xx' | 'wrong_content_type' | 'unknown';
}

interface Fetcher {
  fetch(seed: Seed, priorEvent: CrawlEvent | null): Promise<FetcherResult>;
}
```

Conditional GET headers (`If-None-Match`, `If-Modified-Since`) are added automatically by the orchestrator from `priorEvent`. A 304 response is treated as `was_changed=0` with no body write.

---

## 6. Change-detection rules

In priority order (cheapest first):

1. **HTTP 304 Not Modified** → `was_changed=0`, no body write, no parse
2. **ETag match** → same
3. **Last-Modified ≤ priorEvent.last_modified** → same
4. **Content-Length match + sha256 match** → same
5. **Hash differs** → `was_changed=1`, write body to R2, parse, emit observation

This pipeline saves ~90%+ of parse cost on stable corpora (which most of these are).

---

## 7. Per-tier validation rules (the SPA-fallback guard)

Before treating a response as a given tier, validate `Content-Type`:

| Tier | Required `Content-Type` substring | If wrong | Action |
|---|---|---|---|
| 0 | `text/plain` | site is doing SPA fallback | downgrade to tier 4, mark seed `actual_tier=4` for next run |
| 1 | `application/json` or `application/atom+xml` | API broken or 404 | log error, retry with backoff |
| 2 | `application/xml` or `text/xml` | sitemap missing | downgrade to tier 4 (HTML index page) |
| 3 | `text/markdown` | `.md` variant doesn't exist | fall back to tier 4 of the same URL minus `.md` |
| 4 | `text/html` | binary or unexpected | log error |

The orchestrator updates the seed's `expected_tier` after a successful tier-N fetch so we don't keep re-probing failed tiers.

---

## 8. Observability

| Signal | Where | Used for |
|---|---|---|
| `fact_crawl_event` rows | D1 | Authoritative log of every fetch — counts, status, change rate per seed |
| Cloudflare Workers Analytics | CF dashboard | Per-Worker invocations, CPU time, errors |
| Cloudflare Logpush → R2 | R2 bucket `subagent-logs/` | Raw log bodies for forensic debugging |
| OpenTelemetry → external collector | optional, off by default | Distributed traces if we ever need them; matches the pattern in `code.claude.com/docs/en/monitoring-usage.md` |

---

## 9. Milestones

| # | Deliverable | Done when | Estimated |
|---|---|---|---|
| M0 | `wrangler init`, D1 + R2 + Queue + DO bindings, migrations 0001 + 0002 applied | `wrangler deploy --dry-run` passes; D1 has empty tables | 2h |
| M1 | `seeds.toml` with all currently-known sources (~50 entries); `load.ts` upserts | `SELECT COUNT(*) FROM fact_crawl_seed` returns ~50 | 2h |
| M2 | Tier 1 fetcher (npm + GitHub APIs) + parsers; emits `fact_npm_release` + `fact_github_repo_snapshot` rows | Querying D1 returns at least 84 npm package rows + ~150 GitHub repo rows | 4h |
| M3 | Tier 0 fetcher (`llms.txt` / `llms-full.txt`) + parser; content-type validated | Crawling `platform.claude.com/llms-full.txt` yields 14k+ entity observations | 3h |
| M4 | Tier 2 fetcher (sitemap, recursive); enqueues child URLs | Crawling `support.claude.com/sitemap.xml` yields 4,124 child seed URLs in queue | 3h |
| M5 | Tier 3 + Tier 4 fetchers; readability + turndown for HTML | Crawling `claude.com/blog/*` yields markdown bodies in R2 | 4h |
| M6 | Tier 4 dynamic via Browser Rendering API (for `claude.com/blog/*` JS pages) | Same blog page yields the same markdown via Browser Rendering as via static fetch (when both work) | 4h |
| M7 | FrontierDO + bloom filter + per-host politeness + robots.txt fetch | Two concurrent crawl runs against `support.claude.com` don't double-fetch any URL | 3h |
| M8 | Cron triggers wired up; per-seed schedules respected | Seeds with `0 */6 * * *` get fetched at 00:00, 06:00, 12:00, 18:00 UTC | 2h |
| M9 | Smoke-test E2E: full run completes, D1 has rows, R2 has bodies | Single deploy + 24h soak; no error spike in Workers Analytics | 2h |

Total to v0.1: **~29h**. Most expensive items are M5–M7 (HTML rendering + politeness — the parts that fight back).

---

## 10. Out of scope (v0.1)

- Entity resolution / `bridge_entity_alias` building — that's dbt's job (separate `subagent-dbt/` subproject).
- The retrieval API for subagents (the "subagent-docs" use case from the earlier `PROJECT_PLAN.md` at repo root) — that consumes this warehouse but is built separately.
- X / Twitter, Discord — see `../SHARED_DATA_MODEL.md` §9 deferred sources.
- Containers + headless Playwright — escape hatch if Browser Rendering proves insufficient. Decision deferred until M6 surfaces a real failure case.

---

## 11. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cloudflare Workers free tier limits (100k req/day, 30s CPU/req) | Med | Move to paid Workers ($5/mo) before launch; CPU is the real constraint and rare |
| D1 single-region latency from Cron Worker | Low | D1 reads are local-region in the cron's nearest CF colo; writes batched per Worker invocation |
| Browser Rendering API rate limits | Med | Use sparingly; tier 4 only when 0–3 unavailable; monitor via Workers Analytics |
| Bot-blocked tier 4 fetches (Cloudflare-on-Cloudflare paradox) | Low | Most target sites are Anthropic-owned and on Cloudflare; same-CDN politeness usually fine |
| `seeds.toml` drift vs D1 `fact_crawl_seed` | Med | `load.ts` is idempotent; CI runs `load.ts --dry-run --check` to fail PRs that diverge |
| Parser breakage when upstream changes HTML/JSON shape | High (this is a permanent risk) | Fixture-based tests in `tests/parsers/`; alert when a parser yields 0 entities for a seed that historically yielded N |

---

## 12. Bootstrap checklist

- [ ] `cd ~/claude-projects/github-organizations/subagentapps/managed-subagents/subagent-typescript`
- [ ] `npm init -y && npm i -D typescript @cloudflare/workers-types wrangler vitest`
- [ ] `npm i crawlee @crawlee/cheerio @mozilla/readability turndown unified remark-parse fast-xml-parser bloom-filters safe-stable-stringify`
- [ ] `wrangler init` → set up D1, R2, Queue, Durable Object bindings in `wrangler.jsonc`
- [ ] M0 → M9 in order; M5+M6 can run in parallel.
- [ ] Decide on dbt subproject naming + scope (proposal: `subagent-dbt/` as a third sibling).
