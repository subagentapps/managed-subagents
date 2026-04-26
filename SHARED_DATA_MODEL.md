# SHARED_DATA_MODEL.md

Generated 2026-04-26. Shared by `subagent-typescript/` and `subagent-python/`. The data warehouse this describes is a single D1 database (initially) consumed by both subprojects via different fetcher implementations.

This file describes WHAT — the entity model, fact tables, dim tables, event log. The two subproject `PROJECT_PLAN.md` files describe HOW each language stack ingests into this shared model.

---

## 1. Design principles

| # | Principle | Why |
|---|---|---|
| 1 | **Crawler writes raw events only.** dbt builds the SCD2/SCD3 dims and the curated fact rollups. | SCD logic is fiddly; dbt does it well; keeps crawler simple and idempotent |
| 2 | **No Claude in the fetch loop.** Fetch + parse + diff is mechanical. | Cost, latency, determinism, vendor lock-in avoidance |
| 3 | **Content-addressed storage.** Every response body is hashed (SHA-256); raw body lives in R2 keyed by hash; warehouse references the hash. | Free dedup, free integrity, free history |
| 4 | **Append-only fact_crawl_event.** Every fetch attempt — successful, unchanged, failed — gets a row. | Audit trail; change-frequency learning |
| 5 | **Tier-validated discovery.** Try the cheapest fetch tier first; fall back only when the tier fails *or returns the wrong content-type*. | SPA fallback bug (sites that 200 every path) wastes downstream work |
| 6 | **Entity ≠ Page.** One entity (e.g. the Clio paper) can have N pages (arxiv + huggingface + anthropic.com + github implementation). Resolution happens in dbt, not the crawler. | Same artifact across hosts is the rule, not the exception |
| 7 | **All times in UTC, ISO 8601.** Convert at edge of warehouse, not in fetcher. | One timezone bug is one too many |

---

## 2. Five-tier fetcher hierarchy

The crawler dispatches each `fact_crawl_seed` row to the lowest-numbered tier that applies. Tier 0 is cheapest, tier 4 most expensive (browser CPU + bot-detection risk).

| Tier | Pattern | Examples | Cost per yield | Validation |
|---|---|---|---|---|
| **0** | `llms.txt` / `llms-full.txt` discovery | `claude.com/docs/llms.txt`, `code.claude.com/docs/llms-full.txt`, `platform.claude.com/llms-full.txt` (2.2M lines) | 1 fetch → 50–14,000 entities | **Must validate `Content-Type: text/plain`** (SPA fallback returns `text/html`) |
| **1** | API catalog | `registry.npmjs.org/-/user/{u}/package`, `api.github.com/orgs/{o}/repos`, `huggingface.co/api/datasets?author=Anthropic`, `export.arxiv.org/api/query`, `youtube.com/feeds/videos.xml?channel_id=UC…` | 1 fetch → N entities | `Content-Type: application/json` or `application/atom+xml` |
| **2** | sitemap.xml (recursive) | `support.claude.com/sitemap.xml` (4,124 urls), `claude.ai/sitemap.xml` (sitemap-index of 11 child sitemaps) | 1 fetch → N URLs to schedule | **Must validate `application/xml` or `text/xml`** |
| **3** | `.md` variant of HTML doc page | `code.claude.com/docs/en/skills.md`, `code.claude.com/docs/en/monitoring-usage.md` | 1 fetch, no parsing | `Content-Type: text/markdown` |
| **4** | HTML / SSR (last resort) | `claude.com/blog/*`, `skills.sh/*`, `claude.com/customers`, `red.anthropic.com`, `alignment.anthropic.com` | 1 fetch + Readability strip + HTML→md | If JS-heavy: Cloudflare Browser Rendering API |

### Tier-0 probe rule

Before crawling any new host, probe `<host>/llms.txt`, `<host>/llms-full.txt`, `<host>/sitemap.xml`, `<host>/robots.txt`. **For each, require both `200 status` AND the expected `Content-Type`** before treating the response as that tier. Flagged in plan because at least 4 known hosts (`red.anthropic.com`, `alignment.anthropic.com`, others TBD) return 200 + HTML for every probe path due to SPA fallback.

---

## 3. Three fetch strategies (`fact_crawl_seed.fetch_strategy`)

| strategy | What it does | When the seed is "done" |
|---|---|---|
| `single_page` | Fetch one URL, emit one entity (or update existing) | After one fetch |
| `sitemap_index` | Fetch sitemap → enqueue all `<loc>` URLs as new seeds (recursive if sitemap-of-sitemaps) | After all child URLs are queued |
| `api_catalog` | Fetch a paginated API endpoint → emit N entities per page | After last page |

Strategy is set at seed-creation time and rarely changes. New URL types map to a strategy by URL pattern (in `seeds.toml` rules) or are explicitly tagged.

---

## 4. Entity model

### 4.1 Entity types

Entity = canonical concept tracked over time. Identity is `(entity_type, natural_key)`. The natural_key shape varies per type.

| entity_type | natural_key shape | Example |
|---|---|---|
| `skill` | `<github_org>/<github_repo>/<skill_name>` | `anthropics/skills/algorithmic-art` |
| `plugin` | `<github_org>/<github_repo>/<plugin_name>` | `anthropics/claude-plugins-official/neon` |
| `connector` | `<connector_slug>` | `slack`, `github`, `google-drive`, `microsoft-365` |
| `blog_post` | URL canonicalized | `https://claude.com/blog/using-claude-code-session-management-and-1m-context` |
| `news_post` | URL canonicalized | `https://www.anthropic.com/news/strategic-warning-…` |
| `engineering_post` | URL canonicalized | `https://www.anthropic.com/engineering/…` |
| `research_post` | URL canonicalized | `https://www.anthropic.com/research/clio` |
| `science_post` | URL canonicalized | `https://www.anthropic.com/science/…` |
| `interpretability_paper` | URL canonicalized | `https://transformer-circuits.pub/…` |
| `alignment_post` | URL canonicalized | `https://alignment.anthropic.com/…` |
| `arxiv_paper` | arXiv ID | `2412.13678` |
| `huggingface_dataset` | `<owner>/<dataset>` | `Anthropic/hh-rlhf` |
| `huggingface_paper` | HF paper ID | (per HF API) |
| `npm_package` | `<scope>/<name>` | `@anthropic-ai/claude-code` |
| `mcp_package` | `<scope>/<name>` | `@modelcontextprotocol/sdk` |
| `github_repo` | `<owner>/<repo>` | `anthropics/claude-code` |
| `research_repo` | `<owner>/<repo>` | `safety-research/persona_vectors`, `decoderesearch/circuit-tracer` |
| `community_implementation` | `<owner>/<repo>` | `Phylliida/OpenClio` |
| `claude_artifact` | URL canonicalized | `https://claude.ai/artifacts/…` |
| `youtube_video` | YouTube video ID | `dQw4w9WgXcQ` |
| `support_article` | URL canonicalized | `https://support.claude.com/en/articles/…` |
| `doc_page` | URL canonicalized | `https://claude.com/docs/connectors/slack/index.md` |
| `cowork_doc` | URL canonicalized | `https://claude.com/docs/cowork/3p/configuration.md` |
| `use_case` | URL canonicalized | `https://claude.com/resources/use-cases/…` |
| `tutorial` | URL canonicalized | `https://claude.com/resources/tutorials/…` |
| `course` | URL canonicalized | `https://claude.com/resources/courses/…` |
| `customer` | URL canonicalized | `https://claude.com/customers/…` |
| `partner` | URL canonicalized | `https://claude.com/partners/…` |
| `model_card` | model name + version | `Claude Opus 4.7`, `Claude Sonnet 4.6` |
| `compliance_artifact` | doc title + year | `SOC 2 Type 2 (2025)`, `ISO 27001 Certificate (2025)` |
| `subprocessor` | company name | `Google Cloud Platform`, `Stripe`, `Palantir PFCS` |
| `faq_entry` | trust center FAQ slug `?s=<hash>` | `?s=nb41ha1o8bz8ceszpjvn5` |
| `security_advisory` | CVE id | `CVE-2026-22561` |
| `legal_entity` | company legal name | `Anthropic, PBC`, `Anthropic Ireland, Limited` |

**Open enum** — adding a new type does not require a schema change, just a new enum value. The crawler treats unknown types as `unknown` and emits a warning.

### 4.2 Publishers

| dim_publisher | Examples |
|---|---|
| Anthropic | `anthropics/*` (GH), `@anthropic-ai/*` (npm, owned by `zak-anthropic`), `Anthropic` (HF) |
| Model Context Protocol | `modelcontextprotocol/*` (GH), `@modelcontextprotocol/*` (npm, owned by `fweinberger`) |
| decoderesearch | `decoderesearch/*` (GH) — interpretability/SAE focus |
| safety-research | `safety-research/*` (GH) — alignment research |
| transformer-circuits | `transformer-circuits.pub` (Anthropic-affiliated, distinct site) |
| community | `agentskills/*`, `Phylliida/*`, individual contributors |

`dim_publisher` is its own SCD2 because publisher graph evolves (new orgs, owner transfers).

---

## 5. Schema (D1 / SQLite DDL)

### 5.1 Crawl-side (write path; populated by crawler)

```sql
-- One row per *canonical seed URL or catalog endpoint* the crawler should periodically check.
CREATE TABLE fact_crawl_seed (
  seed_id          INTEGER PRIMARY KEY,
  request_url      TEXT NOT NULL UNIQUE,
  fetch_strategy   TEXT NOT NULL CHECK (fetch_strategy IN ('single_page','sitemap_index','api_catalog')),
  expected_tier    INTEGER NOT NULL CHECK (expected_tier BETWEEN 0 AND 4),
  expected_content_type TEXT,                   -- e.g., 'text/plain', 'application/xml'
  publisher_id     INTEGER REFERENCES dim_publisher(publisher_id),
  default_entity_type TEXT,                     -- the type to assign to entities yielded by this seed
  cron_schedule    TEXT NOT NULL DEFAULT '0 */6 * * *',   -- when to refresh
  is_active        INTEGER NOT NULL DEFAULT 1,
  added_at         TEXT NOT NULL,
  notes            TEXT
);

-- Append-only event log. One row per fetch attempt.
CREATE TABLE fact_crawl_event (
  event_id         INTEGER PRIMARY KEY,
  seed_id          INTEGER REFERENCES fact_crawl_seed(seed_id),
  request_url      TEXT NOT NULL,
  response_url     TEXT,                         -- final URL after redirects
  status_code      INTEGER,
  content_type     TEXT,
  content_length   INTEGER,
  etag             TEXT,
  last_modified    TEXT,
  content_sha256   TEXT,                         -- key into R2 for the raw body
  was_changed      INTEGER NOT NULL,             -- 1 if hash differs from prior; 0 if 304 or hash match
  fetch_tier       INTEGER NOT NULL,
  fetch_duration_ms INTEGER,
  fetcher          TEXT NOT NULL,                -- 'crawlee-cf' or 'scrapy-py'
  fetcher_version  TEXT,
  fetched_at       TEXT NOT NULL,
  error_class      TEXT,                         -- e.g., 'timeout', 'bot_blocked', 'http_5xx'
  error_message    TEXT
);

CREATE INDEX idx_crawl_event_seed_time ON fact_crawl_event(seed_id, fetched_at DESC);
CREATE INDEX idx_crawl_event_hash      ON fact_crawl_event(content_sha256);
CREATE INDEX idx_crawl_event_changed   ON fact_crawl_event(was_changed, fetched_at DESC);

-- Raw extracted entity records, one per URL discovered. Append-only.
-- dbt resolves these into dim_entity downstream.
CREATE TABLE fact_entity_observation (
  observation_id   INTEGER PRIMARY KEY,
  event_id         INTEGER REFERENCES fact_crawl_event(event_id),
  entity_type      TEXT NOT NULL,
  natural_key      TEXT NOT NULL,
  observed_url     TEXT NOT NULL,
  title            TEXT,
  description      TEXT,
  metadata_json    TEXT,                         -- orjson-serialized; everything else
  observed_at      TEXT NOT NULL
);

CREATE INDEX idx_entity_obs_natkey ON fact_entity_observation(entity_type, natural_key);
CREATE INDEX idx_entity_obs_url    ON fact_entity_observation(observed_url);
```

### 5.2 Domain fact tables (write path; populated by crawler from typed parsers)

These are typed observations — when the parser knows enough to fill in counts, versions, or other measures, it writes here in addition to `fact_entity_observation`.

```sql
-- Snapshot fact: install count per skill, polled per crawl.
CREATE TABLE fact_skill_install_snapshot (
  snapshot_id      INTEGER PRIMARY KEY,
  event_id         INTEGER REFERENCES fact_crawl_event(event_id),
  skill_natural_key TEXT NOT NULL,
  install_count    INTEGER NOT NULL,
  observed_at      TEXT NOT NULL
);

-- Event fact: one row per npm release we observe.
CREATE TABLE fact_npm_release (
  release_id       INTEGER PRIMARY KEY,
  event_id         INTEGER REFERENCES fact_crawl_event(event_id),
  package_natural_key TEXT NOT NULL,             -- e.g. '@anthropic-ai/claude-code'
  version          TEXT NOT NULL,
  published_at     TEXT NOT NULL,
  last_publisher   TEXT,                         -- npm user who ran `npm publish`
  unpacked_size    INTEGER,
  dep_count        INTEGER,
  UNIQUE (package_natural_key, version)
);

-- Snapshot fact: GitHub repo stats per crawl.
CREATE TABLE fact_github_repo_snapshot (
  snapshot_id      INTEGER PRIMARY KEY,
  event_id         INTEGER REFERENCES fact_crawl_event(event_id),
  repo_natural_key TEXT NOT NULL,                -- 'owner/repo'
  stars            INTEGER,
  forks            INTEGER,
  open_issues      INTEGER,
  default_branch   TEXT,
  archived         INTEGER NOT NULL,
  observed_at      TEXT NOT NULL
);

-- Event fact: blog post / news post / research post — same shape, different entity_type.
CREATE TABLE fact_post_observation (
  post_obs_id      INTEGER PRIMARY KEY,
  event_id         INTEGER REFERENCES fact_crawl_event(event_id),
  entity_type      TEXT NOT NULL,                -- 'blog_post' | 'news_post' | 'engineering_post' | 'research_post' | ...
  url              TEXT NOT NULL,
  title            TEXT,
  published_at     TEXT,                         -- when the post itself was published; from page metadata
  author           TEXT,                         -- raw, normalized in dbt
  body_sha256      TEXT NOT NULL,                -- hash of extracted body markdown (stored in R2)
  word_count       INTEGER,
  observed_at      TEXT NOT NULL
);

-- HuggingFace datasets snapshot
CREATE TABLE fact_hf_dataset_snapshot (
  snapshot_id      INTEGER PRIMARY KEY,
  event_id         INTEGER REFERENCES fact_crawl_event(event_id),
  dataset_natural_key TEXT NOT NULL,             -- 'Anthropic/hh-rlhf'
  downloads        INTEGER,
  likes            INTEGER,
  observed_at      TEXT NOT NULL
);

-- arXiv enrichment (per-paper, ephemeral — usually one row per paper unless the paper gets revised)
CREATE TABLE fact_arxiv_paper_revision (
  revision_id      INTEGER PRIMARY KEY,
  event_id         INTEGER REFERENCES fact_crawl_event(event_id),
  arxiv_id         TEXT NOT NULL,                -- '2412.13678'
  version          TEXT NOT NULL,                -- 'v1', 'v2'
  title            TEXT NOT NULL,
  abstract         TEXT,
  authors_json     TEXT NOT NULL,                -- orjson-serialized list
  primary_category TEXT,
  submitted_at     TEXT NOT NULL,
  UNIQUE (arxiv_id, version)
);

-- Trust center snapshots (compliance artifacts can be added/removed/version-bumped)
CREATE TABLE fact_compliance_artifact_snapshot (
  snapshot_id      INTEGER PRIMARY KEY,
  event_id         INTEGER REFERENCES fact_crawl_event(event_id),
  artifact_title   TEXT NOT NULL,                -- '[Anthropic] 2025 Type 2 SOC 2 and CSA STAR L2 Report'
  category         TEXT NOT NULL,                -- 'SOC 2' | 'ISO' | 'HIPAA' | 'NIST' | 'FedRAMP' | …
  version_label    TEXT,                         -- 'Apr 21, 2026' or 'v1.0'
  is_locked        INTEGER NOT NULL,             -- 1 if the doc is gated behind 'request access'
  observed_at      TEXT NOT NULL
);

-- Subprocessors as observed on the trust center page.
CREATE TABLE fact_subprocessor_snapshot (
  snapshot_id      INTEGER PRIMARY KEY,
  event_id         INTEGER REFERENCES fact_crawl_event(event_id),
  company_name     TEXT NOT NULL,
  function         TEXT,                         -- 'Cloud Infrastructure' | 'Billing' | 'User support' | …
  jurisdiction     TEXT,
  applies_to_products TEXT,
  observed_at      TEXT NOT NULL
);
```

### 5.3 Reference dim tables (small lookup tables; managed by hand or by dbt)

```sql
CREATE TABLE dim_publisher (
  publisher_id     INTEGER PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE,
  homepage_url     TEXT,
  github_org       TEXT,
  npm_owner        TEXT,
  notes            TEXT
);

CREATE TABLE dim_entity_type (
  entity_type      TEXT PRIMARY KEY,
  description      TEXT NOT NULL,
  default_fetch_tier INTEGER
);

CREATE TABLE dim_page_type (
  page_type        TEXT PRIMARY KEY,
  matches_url_pattern TEXT,                      -- regex
  fetch_tier       INTEGER NOT NULL,
  parser_strategy  TEXT NOT NULL                 -- 'llms_txt' | 'sitemap' | 'json_api' | 'markdown' | 'readability_html'
);

CREATE TABLE dim_country (
  iso2             TEXT PRIMARY KEY,
  name             TEXT NOT NULL
);
```

### 5.4 dbt-built dim tables (read path; built downstream from facts)

These are *not* written by the crawler. dbt models materialize them from the fact tables. Sketched here so the contract is documented.

```sql
-- One row per canonical entity. Surrogate key. Built by dbt from fact_entity_observation
-- + bridge_entity_alias resolution.
CREATE TABLE dim_entity (
  entity_id        INTEGER PRIMARY KEY,
  entity_type      TEXT NOT NULL REFERENCES dim_entity_type(entity_type),
  natural_key      TEXT NOT NULL,
  canonical_url    TEXT,
  publisher_id     INTEGER REFERENCES dim_publisher(publisher_id),
  first_seen_at    TEXT NOT NULL,
  last_seen_at     TEXT NOT NULL,
  is_active        INTEGER NOT NULL DEFAULT 1,
  UNIQUE (entity_type, natural_key)
);

-- The alias graph. Many rows per entity_id. Resolution keys: arxiv_id, doi, github_full_name,
-- npm_package, canonical-url-slug match.
CREATE TABLE bridge_entity_alias (
  alias_id         INTEGER PRIMARY KEY,
  entity_id        INTEGER NOT NULL REFERENCES dim_entity(entity_id),
  alias_url        TEXT NOT NULL,
  alias_role       TEXT NOT NULL CHECK (alias_role IN ('canonical','mirror','citation','community_impl','hub')),
  resolution_key_kind TEXT,                      -- 'arxiv_id' | 'github_full_name' | 'url_slug' | …
  resolution_key   TEXT,
  added_at         TEXT NOT NULL
);

-- SCD2 example: skill description history
CREATE TABLE dim_skill_description_scd2 (
  scd_id           INTEGER PRIMARY KEY,
  entity_id        INTEGER NOT NULL REFERENCES dim_entity(entity_id),
  description      TEXT NOT NULL,
  valid_from       TEXT NOT NULL,
  valid_to         TEXT,                         -- NULL = current
  is_current       INTEGER NOT NULL
);

-- SCD2 example: model card per model name
CREATE TABLE dim_model_card_scd2 (
  scd_id           INTEGER PRIMARY KEY,
  model_name       TEXT NOT NULL,                -- 'Claude Opus 4.7'
  release_date     TEXT,
  artifact_url     TEXT,
  document_sha256  TEXT,
  valid_from       TEXT NOT NULL,
  valid_to         TEXT,
  is_current       INTEGER NOT NULL
);
```

`SCD3` (prior + current) used sparingly — only where downstream consumers want a single-row "what was the previous value" without a JOIN. Default is SCD2.

---

## 6. Raw body storage (R2)

| Bucket | Key pattern | Purpose |
|---|---|---|
| `subagent-raw` | `<sha256[:2]>/<sha256[2:4]>/<sha256>` | Every fetched response body (HTML, markdown, JSON, XML) — exact bytes |
| `subagent-extracted` | `<sha256[:2]>/<sha256[2:4]>/<sha256>.md` | Markdown-extracted body of HTML pages (post-Readability) |
| `subagent-snapshots` | `bloom-frontier/<run_id>.bin` | Bloom-filter snapshots (only if frontier > 100k URLs; not v0.1) |

R2 keys are content-hashed → free dedup, free integrity, immutable. The warehouse's `content_sha256` columns reference these keys.

---

## 7. Bloom filter usage

| Filter | Lifetime | Backing store | Sized for |
|---|---|---|---|
| **In-run URL frontier** | One crawl run | In-memory (Durable Object or Python process) | Expected URLs in this run × 10, 1% FP rate |
| **Cross-run content-hash dedup** | Permanent | D1 indexed `fact_crawl_event.content_sha256` | NOT a bloom filter — D1 indexed lookup is deterministic and fast enough at our scale (≤10⁵ entities) |

Bloom filter in-run is mostly for sitemap-index expansion, where the same URL may be referenced from multiple sitemaps. At our current scale, even this is borderline necessary — but it's cheap to include and earns its keep if the corpus grows.

---

## 8. Politeness + robots.txt

Every host gets:
- `robots.txt` fetched once per 24h, stored in R2
- Per-host concurrency limit (default: 2)
- Per-host minimum delay between requests (default: 1s)
- User-Agent: `subagent-crawler/<version> (+https://github.com/subagentapps/managed-subagents)`
- Conditional GET (`If-None-Match` from prior ETag, `If-Modified-Since` from prior Last-Modified) — saves bandwidth and earns goodwill

Anthropic's `anthropic.com/robots.txt` returns `User-Agent: * Allow: /` so we have full permission. We respect it anyway.

---

## 9. Deferred sources

Sources with high value but hostile fetch profiles. Captured here so the data model knows they're coming; not built in v0.1.

| Source | Why deferred | Workaround paths |
|---|---|---|
| **X / Twitter** (`x.com/AnthropicAI`, `x.com/bcherny`) | No public RSS; aggressive bot detection; API requires paid tier ($200/mo Basic); ToS prohibits scraping | Pay X Basic API; use `socialdata.tools` (~$50/mo); Nitter (unreliable); manual archive (brittle) |
| **Discord** (Anthropic Discord) | No public archive API; requires bot account in server | Use Discord bot account if added to the server; otherwise off-limits |
| **Internal-only Anthropic comms** | Not public | n/a |

---

## 10. Open decisions (deferred from prior plans)

1. **Redis: local Docker, Upstash cloud, or both?** Crawler doesn't need Redis directly (D1 + R2 are sufficient). Reserve for `subagent-docs` corpus retrieval if/when built.
2. **License?** MIT, matching upstream Anthropic skill licenses.
3. **dbt project location?** Recommend `subagent-dbt/` as a *third* sibling subdirectory under `managed-subagents/`. Both crawlers write to D1; dbt models read from D1 and produce the curated layer.
4. **Local development D1?** Use `wrangler d1 execute --local` for dev; `--remote` for prod. Same SQL, different connection.

These do not block plan-writing; they get answered once code starts.
