# Production benchmarks

These are production observations, not a controlled lab benchmark. The supplied
production `model_calls` snapshot covers 472 calls from **2026-10-28 23:26 to
2026-11-05 00:37 UTC**. Prompts, workloads, provider conditions and deployed client
versions vary within that window. The figures below were measured by the
submission orchestrator; this document does not claim a fresh production query.

| Job | Model | Calls | Failures | Fail % | Avg latency s | Avg output tokens | Avg reasoning tokens | Cost USD |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| items | muse-spark-1.3 | 198 | 3 | 1.5 | 56.9 | 6765 | 5614 | 5.92 |
| self_check | muse-spark-1.3 | 193 | 1 | 0.5 | 8.5 | 782 | 663 | 0.97 |
| grade | muse-spark-1.3 | 25 | 0 | 0 | 3.8 | 283 | 230 | 0.04 |
| curriculum | muse-spark-1.3 | 24 | 10 | 41.7 | 89.4 | 4955 | 3635 | 0.52 |
| placement_line | accounts/fireworks/models/muse-spark-open | 5 | 2 | 40 | 41.7 | 605 | 577 | 0 (unpriced) |
| placement_line | muse-spark-1.3 (fallback) | 3 | 0 | 0 | 4.5 | 268 | 229 | 0 |
| plan | muse-wonder-1.0 | 5 | 5 | 100 | 4.0 | 0 | 0 | 0 |
| procedure | muse-spark-1.3 | 3 | 0 | 0 | 24.7 | 2465 | 2112 | 0.04 |
| voice | muse-voice-transcribe-1.0 | 1 | 0 | 0 | 5.6 | 0 | 0 | 0 |

**Coverage caveat:** these supplied rows sum to 457 calls, whereas the supplied
snapshot total is 472. The remaining calls are not classified in the supplied
breakdown. Do not treat this table as a complete reconciliation or infer their
jobs, outcomes or costs. At the same production observation, there were **697
active questions** and **301 concepts**, **78** grounded with a document quote.
Those are content counts, not accuracy or learning-outcome scores.

## Method and exact reproduction SQL

The ledger schema is in [schema.ts](../apps/web/src/db/schema.ts); logging,
pricing, retries and provider selection are in
[client.ts](../apps/web/src/lib/llm/client.ts). A row represents an attempted
provider call, not a learner session or a completed user action. JSON/schema
validation failures can cause another attempt; HTTP and transport errors fail
fast on that provider. A failed Fireworks call can create a separate Spark 1.3
fallback row. The ledger stores the actual model, without the display suffix
`(fallback)`.

`created_at` is Unix milliseconds. `latency_ms` measures a single attempt from
before fetch through response parsing and validation, before its final log write;
it excludes queue wait and earlier attempts. Missing usage is logged as zero.
Output (`completion_tokens`) **already includes reasoning tokens**; do not add
`reasoning_tokens` to output for cost or throughput. Failure means `ok = 0`, not
necessarily failure of the user action. Exclude pending reservations from settled
results, as the staff usage endpoint does.

Save this exact SQLite/D1 query as `benchmark.sql` outside the repository and run
it against an authorized snapshot, for example:

```sh
pnpm --filter @learnquiz/web exec wrangler d1 execute learnquiz --remote --file /absolute/path/benchmark.sql
```

```sql
WITH cohort AS (
  SELECT *
  FROM model_calls
  WHERE created_at >= unixepoch('2026-10-28 23:26:00') * 1000
    AND created_at <  unixepoch('2026-11-05 00:38:00') * 1000
    AND NOT (ok = 0 AND coalesce(error, '') = 'pending')
)
SELECT
  purpose AS job,
  model,
  count(*) AS calls,
  sum(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failures,
  round(100.0 * sum(CASE WHEN ok = 0 THEN 1 ELSE 0 END) / count(*), 1) AS fail_pct,
  round(avg(latency_ms) / 1000.0, 1) AS avg_latency_s,
  round(avg(completion_tokens), 0) AS avg_output_tokens,
  round(avg(reasoning_tokens), 0) AS avg_reasoning_tokens,
  round(sum(cost_usd), 2) AS cost_usd,
  sum(CASE WHEN cost_usd IS NULL THEN 1 ELSE 0 END) AS unpriced_calls,
  (SELECT count(*) FROM cohort) AS cohort_calls
FROM cohort
GROUP BY purpose, model
ORDER BY calls DESC, job, model;
```

This is a reproducible reconstruction query, not a claim to possess the original
measurement SQL. The reported timestamps have minute precision, so the upper
bound includes the full final minute. Averages above are defined by this query
across settled attempts, including failures; successful-only averages require an
explicit `ok = 1` filter and are a different measure. An immutable export and the
original measurement query would be needed to establish exact historical parity.
Run all groups to reconcile the coverage gap rather than filtering to the listed
jobs. Later writes, deployment differences and rounding may change results.

`sum(cost_usd)` intentionally stays null for an entirely unpriced group. The
supplied table's zeros preserve its reported presentation; they are not evidence
that unpriced models are free. Current client estimates use `PRICES` and prompt
plus completion tokens; reasoning is billed within completion tokens. A rounded
zero for a priced group can hide a small nonzero estimate. Unknown voice usage
also makes its token zeros unsuitable for a text-token efficiency comparison.

## Placement A/B: Fireworks Spark Open and Spark 1.3

This is an observational comparison of the same job, **not a randomized A/B
experiment**. Fireworks Spark Open had 5 attempts, 40% failures and 41.7 s average
latency, with 605 output and 577 reasoning tokens on average. Spark 1.3 fallback
had 3 attempts, no observed failures and 4.5 s average latency, with 268 output and
229 reasoning tokens on average. These are small, unequally selected samples:
fallback calls follow a failure, and the aggregate does not establish matched
prompts or explain why fallback counts differ from Fireworks failures. Do not
infer statistical superiority, equal output quality or a fallback success
guarantee. Missing usage on failed attempts can affect token averages.

The latency figures describe individual attempts. A user who encounters fallback
waits for both the failed primary and the fallback, plus application overhead.
Fireworks failures were HTTP 503, “service overloaded”; the app automatically
fell back to Spark 1.3. The [recorded replay](TRACE-REPLAY.md) shows this behavior
and the result caption's actual-model attribution.

## Reliability and session cost

- The 10 curriculum failures were client timeouts at 120 s. [PR #1042](https://github.com/cristianuibar/learnquiz/pull/1042)
  raised long-generation timeouts to 240 s. The current client gives curriculum
  and items that budget, with self-check and procedure at 180 s and a default
  of 120 s unless the caller overrides it. The window mixes deployment versions;
  these aggregates do not measure the fix's effectiveness.
- On 2026-11-04 the Meta API was slow: about 80% of Spark 1.3 output was reasoning
  tokens, at about 120–130 tokens/s. This is a dated operational observation,
  not a guaranteed throughput rate or a separate benchmark of visible text.
- Wonder's `plan` failures reflect its deliberate 4 s budget. The application
  falls back to the rules planner; the 100% model-attempt failure rate does not
  mean sessions could not start.

A defensible cost per learner session is **not derivable from these aggregates**:
there is no session denominator, and topic creation and shared company question
generation are not necessarily session-scoped. To measure it, join an authorized
session cohort to `model_calls.session_id`, sum known `cost_usd` per session
including failed attempts and fallbacks, count unpriced calls separately, and
include sessions with no calls via a left join. Divide the known-cost sum by all
sessions in that cohort, labeling it a partial estimated model cost. Report topic
creation separately, or explicitly amortize it over documented reuse; do not
silently assign shared generation to each learner. This is not provider-invoice
or total hosting cost.

## Reproducible harness and next measurements

No benchmark runner is added here. A repeatable harness can use the existing app
flows and client rather than a separate raw API path:

1. Pin the git revision, environment and `JOB_MODELS` mapping. Record timeout,
   `reasoningEffort`, `maxTokens`, schema and retry settings at each call site.
   Use fixed, non-sensitive topic prompts, an SOP fixture and answer sequences;
   start with a fresh dataset and repeat separately with pre-generated content.
2. Exercise topic creation → placement → summary, then a company role document
   build → cron drain → practice. Capture topic/session IDs and UTC run boundaries.
   For the provider comparison, use the same placement-line input under each
   mapping, randomize order and report primary attempts separately from fallbacks.
3. Use `chatJsonWithModel` behavior as shipped: Meta strict JSON schema versus
   Fireworks JSON object plus schema in the prompt, validation, bad-output retries,
   and provider fallback. Record those differences rather than claiming identical
   provider requests. Keep credentials and learner content out of published traces.
4. Export scoped settled ledger rows and run the SQL above with the run's bounds.
   Measure end-to-end wall time separately: summing call latencies is misleading
   for concurrent generation. Preserve unpriced counts and all failed attempts.
5. Next, measure latency percentiles, user-visible fallback time, timeout rates
   before/after the fix, cold versus reused question pools, blinded grounding and
   question-quality review, and complete per-session costs. Larger paired provider
   samples and measured learner outcomes are needed before making efficacy claims.
