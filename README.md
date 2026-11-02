# Learn Quiz

> Quiz it, until you learn it.

Learn Quiz turns any topic into a personalised quiz curriculum. You name the topic, a
short placement quiz finds your level, and every session after that picks the questions
the science says you need next: retrieval practice, spaced review, corrective feedback,
and difficulty that rises as you get fluent or drops back to basics when you struggle.

Built solo by Cristian Uibar for the Meta Global AI Developer Hackathon
(Oct 27 to Nov 4, 2026), Indie Developer track. Live at https://learnquiz.com.

## Meta models in the loop

| Job | Model |
| --- | --- |
| Curriculum skeleton, question generation, self-check | Muse Spark 1.3 (Meta Model API, JSON-schema output) |
| Session planning with tools (coach), planned | Muse Wonder 1.0 |
| Diagrams and visual questions, planned | Muse Image 1.0 |
| Spoken answers | Muse Voice Transcribe 1.0 |
| Open-weights path | Muse Spark Open via Baseten, Muse Glimmer via Ollama for the local edition |

Every model call is logged to the `model_calls` table. The in-app trace is planned.

## Stack

TanStack Start (React 19) on one Cloudflare Worker, D1 (SQLite) through Drizzle, R2 for
images, Better Auth (guest login, email and password, organizations and invites, Facebook login when configured), shadcn/ui, Tailwind 4.

## Run it

```sh
pnpm install
cp .dev.vars.example .dev.vars        # set LLM_API_KEY and BETTER_AUTH_SECRET
pnpm exec wrangler d1 migrations apply learnquiz --local
pnpm dev                              # http://localhost:3000
```

The Worker entry in `src/worker.ts` delegates HTTP requests to TanStack Start and
provides empty queue and scheduled handlers. To test a scheduled event locally:

```sh
pnpm build
pnpm exec wrangler dev --local --test-scheduled --bundle
# In another terminal:
curl http://localhost:8787/__scheduled
```

`--bundle` enables Wrangler's `/__scheduled` middleware for Vite's prebuilt output.

`.dev.vars` is git-ignored. To fill the key from Proton Pass without showing it:
`pass-cli run --env-file lq.env -- sh -c 'printf "LLM_API_KEY=%s\n" "$LLM_API_KEY" >> .dev.vars'`
where `lq.env` holds only the `pass://` reference.

Deploy: create the D1 database and R2 bucket named in `wrangler.jsonc`, put the
`database_id` there, set the secrets with `wrangler secret put`, then `pnpm deploy`.
In the Cloudflare dashboard, add a WAF rate limiting rule for the same zone: POST
requests to learnquiz.com, 10 per minute per IP, block. The worker also caps each
learner at 20 model calls per day and pasted sources at 20,000 characters.

`JOB_MODELS` in `wrangler.jsonc` maps each job (`curriculum`, `items`, `self_check`,
`plan`, `grade`, `image`, `voice`, and the placement result's `placement_line`) to
`{ "provider": "meta", "model": "muse-spark-1.3" }`. Only the Meta models listed in
`src/lib/llm/models.ts` are accepted. Each request and its call-log row use the
selected model, including failed attempts and retries. Image, plan and grade
mappings reserve those jobs for their planned features.

Calls without a known price, including Wonder and Image, record `cost_usd = null`
and add no monetary charge to cost totals. They still count toward the daily
model-call cap. Billing rates and units for these models will be added separately.

| Provider | Base URL | Secret binding | JSON mode |
| --- | --- | --- | --- |
| `meta` | `https://api.meta.ai/v1` | `LLM_API_KEY` | Strict JSON Schema |
| `baseten` | `https://inference.baseten.co/v1` | `BASETEN_API_KEY` | JSON object with schema in the prompt |
| `fireworks` | `https://api.fireworks.ai/inference/v1` | `FIREWORKS_API_KEY` | JSON object with schema in the prompt |

For example, set `self_check` to `{ "provider": "baseten", "model": "muse-spark-open" }`
and supply `BASETEN_API_KEY` to use a second model for checking generated items.
Use the provider's deployed model ID; Fireworks also accepts the
`accounts/fireworks/models/` prefix. All JSON output is validated locally and
invalid output gets one retry. Provider and network errors fail immediately.

Unmapped jobs retain `LLM_PROFILE`, `LLM_MODEL` (or `IMAGE_MODEL` for images, Muse
Voice Transcribe 1.0 for voice). `LLM_BASE_URL` overrides the URL for `LLM_PROFILE`;
that profile may also fall back to `LLM_API_KEY` for its secret. `.dev.vars` can
override `JOB_MODELS` with a JSON string. Other config: `VOICE_ENABLED`,
`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`.

With `VOICE_ENABLED=true` and the voice job mapped to Meta's Muse Voice
Transcribe 1.0, text-answer questions offer a
hold-to-talk button. Allow microphone access, hold to speak (up to one minute),
then release. Edit the transcript before choosing confidence and pressing Check.
Recordings are converted locally to mono 16-bit 24 kHz WAV, as required by the
[Meta voice cookbook](https://github.com/meta-models/meta-model-cookbook/tree/main/06_muse_voice/01_voice_api_fundamentals),
and sent to `/v1/asr/transcribe`; recordings are not stored. Each transcription
counts toward the daily model-call cap and logs a `voice` call. Voice is disabled
by default; typing remains available when recording or transcription fails.

Staff (the `/admin` area, `requireStaff()`): make a user staff once they have signed up:
`pnpm exec wrangler d1 execute learnquiz --remote --command "UPDATE user SET role='admin' WHERE email='you@example.com'"`
(drop `--remote` for the local database).

Local edition: set `JOB_MODELS={}`, `LLM_PROFILE=ollama`, `LLM_MODEL=muse-glimmer`
and point `LLM_BASE_URL` at an Ollama or llama.cpp server running Muse Glimmer;
voice switches off.

## Disclosure for the judges

All code in this repository was written during the hackathon window, starting
Oct 27, 2026. Before the kickoff only the name, the domain and an unused visual mood
board existed; that mood board was derived from a third-party site and none of its
assets, colours or copy ship here. Coding agents (Claude Code and Codex) were used
to write code under the author's direction, and Gemini and Grok agents reviewed it.

## Licence

MIT.
