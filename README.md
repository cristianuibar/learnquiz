# Learn Quiz — company edition

> Quiz it, until you learn it.

Learn Quiz helps companies onboard new hires through quiz practice with their training
material. A company owner creates a job role and invites teammates with a link or QR
code. Each learner pastes the material they need to learn, takes a placement quiz, and
practises with questions matched to their level and due for review.

The company portal currently covers setup, job-role membership, invitations and
employee progress. **People** shows each person's status (invited, active or
proficient), progress toward the role benchmark and last activity; the **Overview**
counts employees, proficient employees, average days to proficiency and critical-step
errors this week. Learning paths belong to individual learners: shared company
document libraries and automatic role-to-curriculum assignment are not yet
shipped.

Built solo by Cristian Uibar for the Meta Global AI Developer Hackathon
(Oct 27 to Nov 4, 2026), Indie Developer track. The web app and API are live at https://app.learnquiz.com; the marketing site is at https://learnquiz.com.

## What works today

- **Company onboarding:** email/password accounts, company creation with a first job
  role, and invitations tied to that role. Admins share invite links or QR codes from
  **People**; invitations are not emailed. Joining members acknowledge the training
  data disclosure before continuing.
- **Learning from text:** a topic, optional goal and optional pasted source become a
  curriculum with units, concepts and prerequisites. Pasted material is limited to
  20,000 characters; document uploads and URL import are not available yet.
- **Practice:** placement, multiple-choice, fill-in-the-blank and short written
  answers, confidence ratings, corrective feedback, spaced review (FSRS) and concept
  mastery estimates (BKT). Session selection and difficulty adjustment run in code.
- **Staff administration:** the separate `/admin` area lists companies, members,
  roles, member learning documents, active learners and model spend. Staff can inspect
  company portals read-only, search users, and ban or unban accounts. This requires
  the staff `admin` role, distinct from being a company owner or admin.

## Meta models and status

| Model | Job | Status |
| --- | --- | --- |
| Muse Spark 1.3 (`muse-spark-1.3`) | Curriculum skeleton, question generation and item self-check | Shipped; default Meta Model API model with JSON-schema output |
| Muse Spark 1.3 | Short-answer grading | Shipped |
| Llama 3.3 70B Instruct on Fireworks (`accounts/fireworks/models/llama-v3p3-70b-instruct`) | Placement result text (`placement_line`) | Shipped; falls back to Muse Spark 1.3 when Fireworks fails or times out, then to a template |
| Muse Voice Transcribe 1.0 (`muse-voice-transcribe-1.0`) | Transcribe spoken text answers for editing before submission | Implemented, opt-in; disabled in the checked-in configuration |
| Muse Wonder 1.0 | Session planning with tools (coach) | Planned; current sessions use the code-based planner |
| Muse Image 1.0 | Procedure diagrams | Shipped; generated once per visual concept and shown on answer reveals and Path |

Every model call is logged to the `model_calls` table. Open **Model trace** on a
session summary or the Path screen to see each call's purpose, model, latency,
tokens and estimated USD cost, plus the total. Generated paths, questions and placement
feedback name the model that wrote them. Traces are private to the learner.
Topic links and model labels are recorded for newly generated content.

Cost estimates use the configured token price table for Spark 1.3. Models without
a known price, including Wonder, Image and voice, record `cost_usd = null` and show
**Unknown** in the trace. Totals include priced calls only; unpriced calls add no
monetary charge and still count toward the daily model-call cap. Billing rates and
units for these models will be added separately.

With `VOICE_ENABLED=true` and the voice job mapped to Meta's Muse Voice Transcribe
1.0, text-answer questions offer a
hold-to-talk button. Allow microphone access, hold to speak (up to one minute), then
release. Edit the transcript before choosing confidence and pressing Check.
Recordings are converted locally to mono 16-bit 24 kHz WAV and sent to
`/v1/asr/transcribe`; recordings are not stored. Each transcription counts toward the
daily model-call cap and logs a `voice` call. Typing remains available when recording
or transcription fails.

## Demo company walkthrough

The [Northwind Logistics seed](apps/web/seed/README.md) creates a warehouse demo with an
original SOP, generated training questions and employees at invited, onboarding
and proficient stages. Passwords are supplied from Proton Pass at runtime.

Use a fictional **Acme Support** company with **Customer support** as its first job
role. Create the company and accounts through the app; this walkthrough does not
require a preloaded demo account or a seed script.

1. Sign up at `/sign-in`, then open `/org/new`. Enter the company and first job role,
   and acknowledge **Before you start** when prompted.
2. Open **People**, enter a teammate's name and email, select the role, and choose
   **Create invite link**. Share the link or its QR code with that teammate.
3. The teammate opens the invite, creates an account or signs in with the invited
   email, joins the company and acknowledges **Before you start**.
4. On `/start`, enter **Acme Support onboarding** as the topic and paste your sample
   support handbook into **Paste your material (optional)**. Choose **Find my level**
   to generate the curriculum and begin placement. A working model API key is required.
5. After placement, use **Path** to inspect the curriculum and **Model trace** to
   inspect generation calls. Use **Today** for subsequent practice sessions.

Use fictional training material for this walkthrough. The company portal does not
automatically distribute the learner's pasted handbook to other members.

## Stack

TanStack Start (React 19) on one Cloudflare Worker, D1 (SQLite) through Drizzle,
Better Auth (guest login, email and password, organizations and invites, Facebook
login when configured), shadcn/ui and Tailwind 4. R2 stores generated procedure diagrams.

## Run locally

Use Node.js 24 and pnpm 12.14.0. The web app lives in `apps/web`; run these
commands from the repository root.

```sh
pnpm install --frozen-lockfile
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Edit `apps/web/.dev.vars`: set `LLM_API_KEY` to your Meta Model API key, replace
`BETTER_AUTH_SECRET` with a random secret of at least 32 characters, and keep
`BETTER_AUTH_URL=http://localhost:3000` for the local origin. Then run:

```sh
pnpm db:migrate:local
pnpm dev                              # http://localhost:3000
```

`apps/web/.dev.vars` is git-ignored; keep credentials out of version control. The default
model configuration is in `apps/web/wrangler.jsonc`. Local D1 data is separate from production.

| Setting | Purpose |
| --- | --- |
| `JOB_MODELS` | Provider and model for each model job |
| `LLM_PROFILE`, `LLM_BASE_URL`, `LLM_MODEL` | Legacy defaults for unmapped jobs (`meta`, `baseten`, `fireworks`, `ollama`) |
| `LLM_API_KEY`, `BASETEN_API_KEY`, `FIREWORKS_API_KEY` | Provider credentials; store as secrets |
| `VOICE_ENABLED` | Enable the voice job with Meta's transcription model; `true` in `apps/web/wrangler.jsonc`; set `false` in `apps/web/.dev.vars` to hide voice locally |
| `IMAGE_MODEL` | Legacy model for an unmapped image job |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push key pair and contact; required to enable notifications |
| `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` | App origin and authentication secret |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Optional Facebook login; both are required |

`JOB_MODELS` in `apps/web/wrangler.jsonc` maps `curriculum`, `items`, `self_check`, `plan`,
`grade`, `image`, `voice`, and the placement result's `placement_line` to a provider
and model. For example, set `self_check` to
`{ "provider": "baseten", "model": "muse-spark-open" }` and supply `BASETEN_API_KEY`
to use a second model for checking questions. Session planning remains a reserved
job for the planned coach feature. Only the Meta models listed in
`apps/web/src/lib/llm/models.ts` are accepted. Fireworks may prefix a model ID with
`accounts/fireworks/models/`.

| Provider | Base URL | Secret binding | JSON mode |
| --- | --- | --- | --- |
| `meta` | `https://api.meta.ai/v1` | `LLM_API_KEY` | Strict JSON Schema |
| `baseten` | `https://inference.baseten.co/v1` | `BASETEN_API_KEY` | JSON object with schema in the prompt |
| `fireworks` | `https://api.fireworks.ai/inference/v1` | `FIREWORKS_API_KEY` | JSON object with schema in the prompt |

All JSON output is validated locally; invalid output gets one retry. Provider and
network errors fail immediately. A failed Fireworks call is repeated once on the Meta
API with `muse-spark-1.3`. Requests, call logs and generated-content labels use the
model that made each attempt, including failures, retries and fallbacks.

`apps/web/.dev.vars` can override `JOB_MODELS` with a JSON string. Unmapped jobs retain
`LLM_PROFILE` and `LLM_MODEL` (or `IMAGE_MODEL` for images, Muse Voice Transcribe 1.0
for voice). `LLM_BASE_URL` overrides the URL for `LLM_PROFILE`; that profile may
also fall back to `LLM_API_KEY` for its secret. For the local edition, set
`JOB_MODELS={}`, `LLM_PROFILE=ollama`, `LLM_MODEL=muse-glimmer` and point
`LLM_BASE_URL` at an Ollama or llama.cpp server running Muse Glimmer. Voice and
image generation switch off; no model server is bundled.

For local staff access, sign up first, then grant that local account the staff role:

```sh
pnpm --filter @learnquiz/web exec wrangler d1 execute learnquiz --local --command "UPDATE user SET role='admin' WHERE email='you@example.com'"
```

Verify with the same Node.js version as CI:

```sh
pnpm typecheck
pnpm test
pnpm --filter @learnquiz/web test src/server/play.test.ts    # pass the touched test paths for a focused run
pnpm build
```

`pnpm test` runs the full suite in CI. The production build is a separate local check.

## Web Push

Web Push uses `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (base64url P-256 keys) and
`VAPID_SUBJECT` (a contact `mailto:` or HTTPS URL). The owner generates the key pair,
stores it in Proton Pass, and sets these Worker secrets. Keep the same pair: browser
subscriptions are bound to its public key. No Node `web-push` runtime is needed.
To generate a pair in a private owner terminal with Node WebCrypto:

```js
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')
const { d: privateKey } = await crypto.subtle.exportKey('jwk', pair.privateKey)
console.log({ publicKey, privateKey })
```

After the first finished session, account users can opt into notifications from
the summary. On iOS, add Learn Quiz to the home screen first. **Profile** also
offers browser subscription controls, an account-wide pause, and working hours
with a timezone. The sender checks these preferences before delivery.
Staff (`role=admin`) also see **Send test push**, which
sends only to their current browser. On Android Chrome, allow notifications, send
a test, then check the device notification and tap it to return to the profile.
A successful send means the push service accepted it; device delivery still depends on browser
and OS notification settings. Delivery attempts are recorded in `push_log`; HTTP
404/410 removes the expired subscription, while transient failures leave it intact.
Supported services are Chrome/FCM, Mozilla Push, and Apple Web Push.

Question reminders link to `/play/quick/$itemId`. The sender adds a `pushId` to
the link; opening it records `push_log.opened_at` and resumes a single-question
`mini` session. A missed answer gets feedback and finishes without a re-ask.

## Deploy

The checked-in Worker, database ID, bucket and custom domain target the live
`app.learnquiz.com` service; its owner handles production deployments. For your own
deployment, use your Cloudflare account, create a D1 database and R2 bucket, and
update `apps/web/wrangler.jsonc` with your Worker name, database ID, bucket name and domain.
Set `BETTER_AUTH_URL` to that domain's HTTPS origin and check the model configuration.

After verification, configure secrets interactively and apply migrations to your
own database before deploying (use its name in place of `learnquiz` if different):

```sh
pnpm --filter @learnquiz/web exec wrangler secret put LLM_API_KEY
pnpm --filter @learnquiz/web exec wrangler secret put BETTER_AUTH_SECRET
pnpm --filter @learnquiz/web exec wrangler d1 migrations apply learnquiz --remote
pnpm --filter @learnquiz/web deploy
```

Set `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` as well if using Facebook login.
In the Cloudflare dashboard, add a WAF rate limiting rule for your zone: POST
requests to the app hostname, 10 per minute per IP, block. The Worker also caps each
learner at 20 model calls per UTC day, including retries, voice transcriptions and
image generations.

`apps/web/src/worker.ts` delegates HTTP requests to TanStack Start. Queue and scheduled
handlers are empty; background processing and scheduled reminders are not shipped.

## Disclosure for the judges

All code in this repository was written during the hackathon window, starting
Oct 27, 2026. Before the kickoff only the name, the domain and an unused visual mood
board existed; that mood board was derived from a third-party site and none of its
assets, colours or copy ship here. Coding agents (Claude Code and Codex) were used
to write code under the author's direction, and Gemini and Grok agents reviewed it.

## Licence

MIT — see [LICENSE](LICENSE). Copyright © 2026 Cristian Uibar.
