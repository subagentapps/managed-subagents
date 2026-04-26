# Latency budget

Following the Anthropic [reducing
latency](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency)
guidance: **engineer for correctness first, then optimize**, and pick a
budget you can hold across releases. We hold ours via assertions in
`tests/regression/test_latency.py`.

The Anthropic doc's three levers (model choice, prompt/output length,
streaming) are LLM-side. We don't have an LLM in the loop yet. Our
levers are:

- **Index choice** — BRIN on time columns, GIN-trigram on title +
  body_markdown, IVFFLAT on embeddings.
- **SQL shape** — `LIMIT` everywhere, `WHERE` predicates that hit the
  index, no `SELECT *` over JSONB columns we don't return.
- **Connection pooling** — async asyncpg engine in `apps/api/db.py`.

If we add an LLM call (e.g. summarize a job description), the Anthropic
levers re-apply — see [future-llm-integration.md](./future-llm-integration.md).

## Baseline

Measured 2026-04-26 against the warm Docker stack (`pgvector/pgvector:pg17`),
447 jobs in `fact_job_posting`, 100 sequential requests from `localhost`,
no concurrency, no NIC noise. **These are local-loop numbers; production
SLOs need a fresh measurement on the actual deploy.**

| Route | p50 | p95 | p99 | max | Notes |
|---|---:|---:|---:|---:|---|
| `/healthz` | 0.4 | 0.9 | 9.9 | 9.9 | First-request warm-up dominates p99 |
| `/jobs?limit=20` | 1.9 | 3.9 | 33.1 | 33.1 | Sorts on `first_published DESC` (BRIN-friendly) |
| `/jobs?department=Sales` | 1.6 | 2.3 | 2.6 | 2.6 | Hits `ix_fact_job_posting_department_key` |
| `/departments?days=3650` | 1.5 | 2.8 | 3.2 | 3.2 | `GROUP BY` over 447 rows is trivial |
| `/offices?days=3650` | 1.6 | 2.4 | 3.3 | 3.3 | same |
| `/search?q=performance&backend=text` | **30.3** | **76.2** | **125.3** | 125.3 | Title trigram + body ILIKE union — the hot path |
| `/jobs/4020350008` | 1.8 | 3.5 | 10.6 | 10.6 | `LEFT JOIN content_store` for the body |

All numbers in milliseconds. p99 includes the first-request warm-up,
which is why a few rows look noisy: SQLAlchemy compiles the prepared
statement on the first call after engine creation. In production, with
a hot pool, the p99 collapses toward p95.

## Budgets

Budgets are **2x baseline** — a deliberate slack so a routine schema
change or a switch to AlloyDB doesn't break CI. If a budget tightens
post-launch (e.g. we observe steady-state p95 well under 50% of
budget), tighten the assertion; don't let dead headroom drift into
real regression.

| Route | p95 budget | p99 budget | Rationale |
|---|---:|---:|---|
| `/healthz` | 5 ms | 25 ms | Cheap; if this regresses something is *very* wrong |
| `/jobs` | 50 ms | 150 ms | Read API, hot path |
| `/jobs?department=…` | 50 ms | 150 ms | Same shape, indexed predicate |
| `/jobs/{id}` | 50 ms | 150 ms | LEFT JOIN content_store (TOAST decode possible) |
| `/departments` | 30 ms | 100 ms | Aggregation over a small fact |
| `/offices` | 30 ms | 100 ms | same |
| `/search?backend=text` | 200 ms | 500 ms | Trigram + ILIKE union; biggest variance |
| `/search?backend=vector` | 800 ms | 2000 ms | Includes fastembed encode (~150ms cold) — see note |
| `/metrics` | 50 ms | 150 ms | Prometheus exposition over in-process counters |

### Vector-search special case

The `vector` backend's latency is dominated by the **fastembed encode
step** (BAAI/bge-small-en-v1.5 ONNX, 384-dim, ~150 ms cold, ~30 ms
warm). The IVFFLAT scan over 447 rows is sub-millisecond. If we
optimise this:

1. **Move the encoder into a sidecar** so the FastAPI worker doesn't
   pay the model-load cost.
2. **Switch to a query-time embedding cache** keyed on the query
   string (vector queries repeat in dashboards).
3. **Pre-encode the top-K query templates** ("performance engineer",
   "ML researcher", …) and serve them from a hash table.

Don't do any of the above until p95 actually leaves the budget. Per
the Anthropic doc: *"trying to reduce latency prematurely might
prevent you from discovering what top performance looks like."*

## How we enforce the budget

`tests/regression/test_latency.py` runs each route N=50 times against
a live API and asserts:

```python
assert p95 <= BUDGET[route]["p95"], f"{route} p95={p95:.1f}ms > budget"
assert p99 <= BUDGET[route]["p99"], f"{route} p99={p99:.1f}ms > budget"
```

The test is **opt-in via the `--latency` pytest flag** (or
`LATENCY_TEST=1` env var) so unit-test runs without a live DB don't
fail. CI runs it under the `latency` job, gated on docker-compose
having a `healthy` postgres.

## Time-to-first-byte (TTFB) vs. total latency

The Anthropic doc distinguishes **baseline latency** (full response
time) from **TTFT** (time to first token, only meaningful when
streaming). Our routes are all non-streaming JSON — TTFB ≈ TTLB ≈
total latency. If we add a streaming `/search` (e.g. server-sent
events for incremental ranking results), measure both.

## Anti-patterns we avoid

- **Pagination by `OFFSET`** — fine at 447 rows; will need keyset
  pagination at 100k+. The `/jobs` query orders by
  `first_published DESC NULLS LAST` which is BRIN-friendly but doesn't
  give a natural keyset. Migrate to `(first_published, id)` keyset
  before scaling.
- **`SELECT *`** — every router selects only the columns it returns.
  `raw_payload JSONB` (~5KB/row) is only fetched on `/jobs/{id}`.
- **Per-request engine creation** — `apps/api/db.py` caches the
  `AsyncEngine` across requests. Confirmed by the fact that
  request 100 isn't slower than request 50.

## When the budget breaks

1. **Don't widen the budget** — first investigate. The point of the
   assertion is to catch regressions early.
2. Run `EXPLAIN (ANALYZE, BUFFERS)` on the offending query.
3. Check whether the index it should hit was dropped or invalidated
   (e.g. `REINDEX` after a major version upgrade).
4. If the regression is *intentional* (new feature that genuinely
   needs more time), tighten or relax the budget in this doc and the
   assertion in the same PR — never relax silently.
