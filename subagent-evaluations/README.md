# Eval & testing

This folder follows the **define success → build evaluations → grade
results** loop from Anthropic's [Define success and build
evaluations](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)
guide, but applied honestly to *this* stack.

## What's here

| Doc | Applies | Substrate |
|---|---|---|
| [`success-metrics.md`](./success-metrics.md) | now | FastAPI routes, ETL row counts, vector recall |
| [`latency-budget.md`](./latency-budget.md) | now | `prometheus_client` histograms + `tests/regression/test_latency.py` |
| [`future-llm-integration.md`](./future-llm-integration.md) | when we add Claude calls | hallucination, prompt-leak, jailbreak, refusal, consistency, define-outcomes |

## What's deliberately *not* here

`gh_dump_ext` currently has zero LLM calls. The Anthropic guides on
hallucination / prompt-leak / jailbreak / streaming refusals / consistency
/ outcomes assume an app that calls `client.messages.create(...)`.
Without that substrate they're forward-looking architecture notes, not
applicable runbooks. They live under `future-llm-integration.md` so it's
clear which load-bearing piece is missing.

The regression harness in `tests/regression/` is a **regression and
latency** test — it exercises the FastAPI routes against the seeded
Postgres, asserts row counts, and asserts p50/p95/p99 against budgets.
**It is not an "eval"** in the Anthropic sense (which implies LLM
grading). Naming the test directory `regression`, not `eval`, keeps that
distinction load-bearing.
