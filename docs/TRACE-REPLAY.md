# Recorded trace replay

This is a written replay of a real cactus personal-topic run on **2026-11-05
UTC**, supplied from production observations. It is not a synthetic benchmark or
a promise that a new run will have the same timings. Approximate times remain
approximate; no unrecorded prompt text, question wording or trace IDs are invented.
See [BENCHMARKS.md](BENCHMARKS.md) for the production snapshot and its limitations.

## Cactus: topic to placement result

| UTC time / stage | Observed event |
| --- | --- |
| 00:01:09 — curriculum | Spark 1.3 (`muse-spark-1.3`) generated the curriculum in 71 s, with 7,898 output tokens. |
| About 00:02 — placement preparation | Spark 1.3 generated placement items for 3 concepts, taking about 42–70 s per items call. Spark 1.3 self-check calls followed, taking 4–11 s. These are per-call durations, not a claim that all calls ran sequentially. |
| Placement answers | The learner answered 7 of 8 correctly. This is one placement result, not an evaluation of model accuracy or learning gains. |
| Placement result — primary attempt | `placement_line` on Fireworks `accounts/fireworks/models/muse-spark-open` failed fast with HTTP 503, “service overloaded.” |
| Placement result — fallback | Spark 1.3 returned the line in 3.2 s: 235 input tokens, 274 output tokens, including 237 reasoning tokens. The result caption names the model that actually wrote it. |

The placement continued through a provider failure. In
[client.ts](../apps/web/src/lib/llm/client.ts), a Fireworks transport/HTTP failure
returns immediately from that provider attempt and triggers the Meta Spark 1.3
fallback. Each attempt has its own ledger row. `chatJsonWithModel` returns the
successful model identity along with the data, so the caption attributes this
result to Spark 1.3 rather than the configured Fireworks primary. The 3.2 s is
fallback latency alone, not the whole wait experienced by the learner. Reasoning
tokens are already included in the 274 output tokens.

## Northwind: SOP to grounded questions

The recorded Northwind role build follows the document-backed company path:

1. An SOP provides the source material for the role's curriculum.
2. Curriculum generation produces concepts grounded in the document, retaining
   source quotes so a reader can inspect the evidence behind the training.
3. Concepts enter the background question-generation queue. The scheduled cron
   calls `drainConceptQueue`; each claimed concept generates its shared question
   pool independently of the initial document-build request.
4. Generated questions go through self-check before usable items are retained.
   The resulting role content supports later learner practice.

The implementation path is
[concept-gen.ts](../apps/web/src/server/concept-gen.ts) →
[helpers.ts](../apps/web/src/server/helpers.ts), driven by
[worker.ts](../apps/web/src/worker.ts). The queue is represented by concept status
and claimed atomically, so overlapping drains do not intentionally generate the
same concept simultaneously. A curriculum being visible does not imply that
all background question generation has finished. Quotes provide inspectable
provenance; they do not by themselves prove every generated question is correct.
No per-stage Northwind timing or token totals were supplied, so none are asserted.

## See the trace in the live app

The demo video shows the Summary and Path trace screens. To inspect the same
recorded cactus trace, use the learner account that owns that topic/session:

1. Open the completed placement's **Summary** and choose **Show model trace**.
   The **Model trace** panel shows session-linked calls, including the failed
   `placement_line` attempt and its successful fallback. Inspect purpose, actual
   model, success/failure, latency, input/output/reasoning tokens and cost.
2. Open the cactus topic's **Path**, then **Show model trace**. This is the
   topic-generation view for curriculum, items, self-check, diagram and procedure
   calls; it is not the same scope as the Summary's placement/session calls.
3. A staff user can open **`/admin/usage`**, select the relevant UTC date range,
   and inspect job/model aggregates and failures. For the cactus run, include
   2026-11-05. For the Northwind build, inspect the company usage and generation
   failures as well as the SOP quotes in the role content.

Traces are access-controlled. Another learner cannot open the original cactus
session just by knowing its topic; creating a new cactus topic produces a new
trace. Topic traces filter to the current learner's calls. Company background
question generation can be logged with no learner ID and therefore may be absent
from that panel; staff usage is the appropriate view for those calls.

The panel displays unknown model prices as **Unknown** and totals priced calls
only. Token zeros may mean usage was not returned. The staff failure view can
expose the logged error, while the learner trace shows failure status without
provider error bodies. Neither view exposes hidden reasoning text: reasoning is
a token count, not a chain-of-thought replay. Reopening the panel reloads the
ledger; retained history remains inspectable, but new live runs can differ as
provider load, content reuse and deployment settings change.
