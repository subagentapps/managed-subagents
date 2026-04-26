# Success metrics

Following the [Define success
criteria](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests#define-your-success-criteria)
guide: success criteria are **specific, measurable, achievable,
relevant**. We pick numbers we can defend, not "the system is fast and
correct."

## Multidimensional criteria

A single accuracy number is the wrong mental model — we evaluate along
several axes simultaneously, each with its own threshold. Bad: "the API
returns the right jobs." Good: the table below.

| Axis | Metric | Target | How we measure | Where it's enforced |
|---|---|---|---|---|
| ETL completeness | Row counts after `make seed` | jobs=447, depts=20, offices=23, content_store=447 | `psql -c "SELECT count(*) ..."` | `tests/regression/test_contracts.py::test_seed_row_counts` |
| Schema integrity | Foreign keys + unique constraints hold | 0 orphans | `LEFT JOIN ... WHERE rhs IS NULL` | same |
| Faceted-query correctness | `/jobs?department=Sales` returns the count seen in `/departments` | exact equality against the dept aggregate | `httpx` assertion against the seeded DB | `test_contracts.py::test_jobs_by_department_matches_aggregate` |
| Search recall (text) | "Performance Engineer" job ID 4020350008 in top-5 of `/search?q=performance&backend=text` | rank ≤ 5 | golden-query fixtures in `tests/regression/contracts.jsonl` | `test_contracts.py::test_search_recall` |
| Search recall (vector) | After `make embed`, the same query ranks the same canonical job ≤ 5 | rank ≤ 5 | same fixture, `backend=vector` | `test_contracts.py::test_vector_search_recall` (skipped until embeddings present) |
| Latency (read API) | p95 latency for `/jobs?limit=20` over 100 sequential requests against a warm cache | < 50 ms | `time.perf_counter` around `httpx.get` | `tests/regression/test_latency.py` (see [latency-budget.md](./latency-budget.md)) |
| Observability | `/metrics` exposes `gh_dump_ext_api_requests_total{route,status}` and the histogram bucket `gh_dump_ext_api_request_duration_seconds_bucket` for every route hit | 100% of routes labelled | Prometheus scrape + assert presence in test | `test_contracts.py::test_metrics_surface_complete` |
| Lineage capture | Every `make seed` / `make embed` / `make parquet` writes a START + COMPLETE pair to `dim_lineage_event` | 2 events per run | SQL count grouped by `run_id` | `test_contracts.py::test_lineage_pair_per_run` |

## Why this shape

**Specific**: every row names the exact route, the exact rubric (p95,
exact equality, top-5 recall), and the exact assertion location.

**Measurable**: code-graded (counts and string-match) wherever possible,
which is fastest and most reliable per the Anthropic
[grading guide](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests#grade-your-evaluations).
No human-graded or LLM-graded steps — there's no LLM in the loop *yet*.

**Achievable**: the latency targets come from a one-shot baseline run
(see [latency-budget.md § baseline](./latency-budget.md#baseline)), not
aspiration. Recall targets are based on the trigram + IVFFLAT indexes
the schema already has — if we drop those indexes the targets need to
move, not the assertions.

**Relevant**: every metric maps to a query the React frontend issues
during normal use. We're not measuring `/healthz` p99 because nobody
notices.

## What we don't measure (yet)

- **Tone, style, refusal-rate, hallucination-rate** — no LLM in the
  loop. These become first-class when we add Claude calls. See
  [future-llm-integration.md](./future-llm-integration.md).
- **End-to-end web → API → DB latency** — we measure API → DB only.
  When we have a real React deploy with client-side telemetry, add a
  Core Web Vitals panel.
- **Cost / token-spend** — see ditto re: no LLM in the loop.

## Anchoring on real numbers

Per the Anthropic guide ("Even 'hazy' topics ... can be quantified"):
even the soft criterion `"the dashboard feels snappy"` becomes
`"95th-percentile time-to-interactive < 200ms on the JobsList page,
including the network round-trip to /jobs?limit=50"`. We don't enforce
that one yet because the React side isn't deployed — but the *shape*
of the criterion is the same: specific, measurable, defensible.
