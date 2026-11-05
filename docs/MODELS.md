# Every model call

Verified against `apps/web/wrangler.jsonc`, `apps/web/src/lib/llm/models.ts`,
`apps/web/src/lib/llm/client.ts`, and all production callers at base commit
`d6895da784da6310fe33a38c59f3af044a8050b7`. Paths and line numbers below refer to
that revision. These are deployed defaults; `JOB_MODELS` can override them.

## Jobs and contracts

In the table, **Meta** means Meta Model API, `https://api.meta.ai/v1`;
**Fireworks** means `https://api.fireworks.ai/inference/v1`. Endpoint paths are
appended to those bases. **JSON retry** means one retry for empty, truncated,
invalid JSON or schema-invalid output; HTTP/network failures fail immediately.
Timeouts apply to each attempt, not the whole user operation. Except for image
and voice, calls use `POST /chat/completions`.

All caller paths in the table are relative to `apps/web/src/`.

| Job / purpose | Meta model and exact request ID | Provider / endpoint | Caller (file:line) | Input → output | JSON schema name | Timeout | Retry / fallback | Company roles or personal topics? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `curriculum`: build learning path | Muse Spark 1.3, `muse-spark-1.3` | Meta `/chat/completions` | `server/curriculum.ts:49`; `server/role-curriculum.ts:101` | Topic, goal, level, optional pasted text or role documents → units, concepts, prerequisites, quotes, critical flags, misconceptions | `curriculum_skeleton` | 240 s | JSON retry. Personal topics use a generic skeleton only on invalid output (422); company builds fail instead of inventing an SOP curriculum. Other errors surface. | Both |
| `items`: draft questions | Muse Spark 1.3, `muse-spark-1.3` | Meta `/chat/completions` | `server/helpers.ts:134` | Concept, misconceptions, difficulty, quote/document, stems to avoid → batch of question payloads with answers, explanations, source quotes | `item_batch` | 240 s | JSON retry; generation can make multiple rounds (personal: up to 2; company queue: up to 3). No template questions; no kept items is an error. | Both; company questions generated once and shared |
| `self_check`: review drafted questions | Muse Spark 1.3, `muse-spark-1.3` | Meta `/chat/completions` | `server/helpers.ts:165` | Indexed drafted items → per-item `index`, `keep`, `reasons` | `self_check` | 180 s | JSON retry; only explicit `keep: true` verdicts are stored. Missing/failed checks do not approve items. | Both |
| `grade`: assess a short answer | Muse Spark 1.3, `muse-spark-1.3` | Meta `/chat/completions` | `server/play.ts:711` | Question, model answer, source quote, learner text → score 0–1, feedback, missing points | `grade` | 120 s | JSON retry; on failure reveal the model answer as ungraded, with no mastery/scheduling/XP change. Objective question formats use code grading. | Personal only; role short answers are revealed ungraded |
| `placement_line`: explain placement result | Muse Spark Open, `accounts/fireworks/models/muse-spark-open` | Fireworks `/chat/completions`; fallback Meta `/chat/completions` | `server/play.ts:948` (`chatJsonWithModel`) | Topic, computed level, concepts/results/confidence → short result `line` (max 240 characters) | `placement_line` | 120 s | JSON retry at each provider; Fireworks → Meta `muse-spark-1.3` → deterministic template if still failing. Caps do not trigger a paid provider fallback. | Personal only; company roles use the template directly |
| `plan`: order session items | Muse Wonder 1.0, `muse-wonder-1.0` | Meta `/chat/completions` | `server/play.ts:400` | Rules-selected candidates, level, review/category data → same item IDs once each, with one-line reasons; closers last | `session_plan` | 4 s | `retry: false`; failure retains rules ordering. | Personal only, excluding basics and Ollama mode; company roles use rules |
| `image` (logged as `diagram`): concept diagram | Muse Image 1.0, `muse-image-1.0` | Meta `/images/generations` | `server/diagrams.ts:54` (`generateImage`) | Concept/topic/summary/quote prompt → one base64 PNG, 1024×1024, validated under 10 MB, stored in R2 | None; local response validator checks `data[0].b64_json` and PNG bytes | 120 s | No automatic retry or provider fallback; learner may explicitly retry. Cached uploads are reused. | Both, but generation requires the topic owner; employees only view stored role diagrams |
| `voice`: transcribe an answer | Muse Voice Transcribe 1.0, `muse-voice-transcribe-1.0` | Meta `/asr/transcribe` | `server/play.ts:546` (`transcribeAudio`) | Multipart JSON request (`PUSH_TO_TALK`, `WAV`) plus WAV file → trimmed nonempty transcript, max 1,000 characters | None; transcript type/length checked locally | 120 s | No automatic retry/fallback; record again or type. Requires enabled Meta transcription configuration. | Personal only, current non-MCQ question; disabled for roles |
| `procedure`: unit flowchart | Muse Spark 1.3, `muse-spark-1.3` | Meta `/chat/completions` | `server/procedure.ts:82` | Topic, unit summary and usable source documents → step/decision nodes, critical flags, yes/no edges | `procedure_graph` | 180 s | JSON retry; failure releases claim and returns an error. Cached per unit and source versions; no documents means no call. | Both, when the unit has usable cited source documents |

The schema definitions are in `lib/llm/schemas.ts`; plan and placement schemas
are defined at their callers. Meta receives strict `json_schema` response format.
Fireworks, Baseten and local Ollama receive `json_object` with the schema in the
system prompt. Every text response is validated with Zod, including cross-field
rules. No unvalidated JSON is accepted as an item.

`chatJson` delegates to `chatJsonWithModel`. The latter retries a failed Fireworks
text request on Meta Spark 1.3 for `LlmError`, except learner/company cap errors.
That is a generic text-client capability, but only `placement_line` uses Fireworks
in the checked-in mapping. A template is a caller-specific final fallback, not a
universal third provider. Image and voice do not use that text fallback.

Other accepted providers/configurations: Baseten at
`https://inference.baseten.co/v1`, and the local `ollama` profile documented in
[LOCAL-MUSE-GLIMMER.md](LOCAL-MUSE-GLIMMER.md). Only IDs in `META_MODELS` are allowed;
Fireworks' `accounts/fireworks/models/` prefix is stripped for this check.
`LLM_BASE_URL` overrides the selected provider's URL when it matches `LLM_PROFILE`.

## Ledger, limits, and visibility

All four public call helpers live in `lib/llm/client.ts`. Before each actual
attempt, `reserveModelCall` in `server/model-cap.ts` atomically inserts a pending
`model_calls` row if the applicable caps allow it. After completion, `logCall`
updates latency, prompt/completion/reasoning tokens, estimated USD cost, success,
and a bounded error. Rows carry the actual requested model, purpose, timestamp,
and available learner/session/topic/company IDs. Retries and provider fallbacks
reserve separate rows and consume separate slots. Image uses purpose `diagram`;
voice/image have no token usage, so recorded token counts are zero.

Logging is best effort: a reservation database error allows the call, then the
logger tries an insert; a logging failure goes to server logs. Thus the code
attempts to log every provider request, but does not guarantee a complete ledger
if D1 fails. Requests rejected by caps do not create new call rows. Voice logs
never contain recordings, transcripts, credentials or provider response bodies.
The ledger does not store text prompts or full responses.

Limits in `lib/limits.ts` reset at **00:00 UTC**: guest **150**, registered account
**500**, company **400** model calls per day. Missing/anonymous user rows get the
guest limit. Company counting joins calls through company topics, including
shared background generation; calls with a learner and company can count toward
both. Failed attempts and pending reservations count, as do retries/fallbacks.
Reading already-generated content does not spend another model call.

Learners open **Show model trace** on topic/session views (`components/model-trace.tsx`,
`server/model-trace.ts`). It shows model IDs, purposes, success, latency, token
counts and estimated cost, plus session planning reasons. Access is scoped to
the current learner: topic traces include curriculum/items/self-check/diagram/
procedure, while session traces use the session ID. Company background calls
with no matching learner ID are therefore not all visible in an employee trace.
Staff inspect the ledger and aggregates at **`/admin/usage`**
(`routes/admin.usage.tsx`). Only Spark 1.3 has a price entry in the client today;
other costs are unknown, and trace totals include priced calls only.

## Pipeline

SOP → curriculum (**Spark**) → grounded concepts with supporting document quotes
→ questions (**Spark**) → self-check (**Spark**) → learner sessions (**Wonder**
ordering for eligible personal topics; rules for company roles/local mode) →
grading (**Spark** for personal short answers; rules for objective answers) →
placement result (**Spark Open**, for personal topics).

This is a dependency overview, not chronological session order: placement normally
precedes practice. Company curricula reject concepts whose quotes cannot be
matched uniquely to a live source document. Self-check keeps only approved items;
model judgments still need human review for consequential SOPs.
