# Future: LLM-integration playbook

`gh_dump_ext` does not call Claude today. The Anthropic guides on
hallucination, prompt-leak, jailbreak, refusal-handling, consistency,
and outcomes assume an app that does. This doc collects the guidance
in one place so that *when* we add an LLM call, we don't have to
re-read every doc — we apply the relevant section.

## Likely first-use cases

Two integrations are plausible, in order of value:

1. **`POST /jobs/{id}/summarize`** — given the raw HTML body in
   `content_store.body_html`, return a 3-bullet TL;DR. Useful in the
   React dashboard; obvious latency-sensitive surface.
2. **LLM-as-judge for `/search` relevance** — given a query and the
   top-N results, ask Claude to grade whether the ranking makes
   sense. Used in `tests/regression/` as a *consistency* eval (not in
   the hot path).

Each of those triggers a different subset of the guidance below.

## Latency

[reduce-latency.md source](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency)

- **Choose the right model.** Claude Haiku 4.5 (`claude-haiku-4-5`)
  for the summarize route — speed-first; we don't need Opus tier
  intelligence to summarise a 4kB job description.
- **`max_tokens` is a hard cap.** For 3-bullet TL;DR set
  `max_tokens=200`; cuts both latency and cost ceiling.
- **Stream the response** when the user is waiting on it. The
  summarise route is a JSON return — wrap it in SSE and the dashboard
  can render the first bullet while the second is still being
  generated. See `streaming.md` link below.
- **TTFT vs. baseline latency.** TTFT is the metric users feel; total
  baseline latency is the metric we bill against. Measure both —
  tag the Prometheus histogram with `phase={ttft,total}`.

## Streaming

[streaming source](https://platform.claude.com/docs/en/build-with-claude/streaming)

- The Anthropic SDK stream returns events: `message_start`,
  `content_block_delta` (TextDelta / InputJSONDelta / ThinkingDelta),
  `message_delta`, `message_stop`.
- For the summarize route: surface text deltas to the SSE channel as
  they arrive; ignore thinking deltas (they're for telemetry, not
  end-users).
- Error recovery: per Claude 4.6, if the stream errors mid-response
  the client should reset and retry from the last persisted text
  delta — don't blindly continue.

## Streaming refusals

[handle-streaming-refusals source](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/handle-streaming-refusals)

- `stop_reason == "refusal"` arrives on `message_delta`. **Reset the
  conversation context** — drop the offending turn, don't continue.
- We're billed for output tokens up to the refusal; budget for that
  in the cost dashboard.
- For the summarize route, a refusal on a benign job description is
  unlikely. Log the request with the job id and the partial body
  hash so we can audit later — *don't* log the full body.

## Reduce hallucinations

[reduce-hallucinations source](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations)

- **Allow Claude to say "I don't know."** The summarize prompt should
  end with: *"If the job description is truncated or unclear, say
  so explicitly rather than inventing detail."*
- **Direct quotes for grounding.** Greenhouse job descriptions are
  short (< 8 KB) so we don't need the "extract quotes first" pattern
  the doc uses for 20K+ documents. But for the LLM-as-judge eval, ask
  it to cite the search-result fields it's grading.
- **External knowledge restriction.** The summarize route gets
  *only* the job description — no system-level facts, no role
  memory. Pin this in the system prompt: *"Use only the text in
  &lt;job_description&gt;. Do not bring in outside knowledge about
  the company."*

## Reduce prompt leak

[reduce-prompt-leak source](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-prompt-leak)

- Per the doc: try monitoring + post-processing *first*, before
  leak-resistant prompt engineering. We have nothing proprietary in
  the system prompt yet — keep it that way and there's nothing to
  leak.
- If we add a proprietary scoring formula (e.g. "match score =
  function of mentions × salary band"), don't put it in the system
  prompt; compute it in Python and pass the result.

## Mitigate jailbreaks

[mitigate-jailbreaks source](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)

The summarize route accepts the *job description body*, not user
text — that's a closed input distribution we control. The LLM-as-
judge route accepts the *user search query*, which is open. For the
judge route:

- **Harmlessness pre-screen** with Haiku 4.5 + structured output.
- **Input validation** at the FastAPI layer — refuse search queries
  that look like prompt-injection (`"ignore previous instructions"`,
  base64 blobs, etc.) before they reach the LLM.
- **Continuous monitoring**: log refusal rate per route; alert if it
  spikes.

## Increase consistency

[increase-consistency source](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/increase-consistency)

For the summarize route the output shape matters: same bullets every
time so the React component can render them.

- **Use Structured Outputs** for guaranteed JSON conformance — the
  doc explicitly recommends them over prompt engineering for "always
  valid JSON".
- For the LLM-as-judge eval: structured `{"score": 0..1,
  "reasoning": "..."}` and discard `reasoning` after logging.

## Define outcomes (Managed Agents preview)

[define-outcomes source](https://platform.claude.com/docs/en/managed-agents/define-outcomes)

Not applicable to the summarize route (it's a single-turn function).
*Could* apply to a "find me 5 roles that match my CV" feature — frame
it as: *outcome = "5 jobs ranked with a 1-paragraph justification each,
each citing two specific skills from the CV"*; pass that as
`user.define_outcome` with a markdown rubric; let the harness iterate.

That feature is hypothetical. Don't build it before there's a user
asking for it.

## Wiring it into our stack

When we add the first LLM call:

1. **Anthropic SDK** as a runtime dep — pin in `pyproject.toml`.
2. **`ANTHROPIC_API_KEY`** as a secret — `.env` for local, secret
   manager for prod, never `.claude/settings.json` (per the
   subagent-crawls CLAUDE.md rule).
3. **Per-route Prometheus counters** — `gh_dump_ext_llm_requests_total`,
   `gh_dump_ext_llm_refusals_total`, `gh_dump_ext_llm_tokens_total`,
   `gh_dump_ext_llm_request_duration_seconds`.
4. **OpenLineage events** in `dim_lineage_event` for the summarize
   batch backfill so we have a queryable history of which jobs got
   summarised when, with which prompt version.
5. **Eval harness extension**: `tests/regression/test_llm_*.py`, with
   golden inputs in `contracts.jsonl`, graded by exact match on the
   structured-output fields and by an LLM-as-judge for the prose
   bullet text. The judge runs *only* on PRs labelled `eval-judge`
   so we don't burn tokens on every push.
