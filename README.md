# Learn Quiz

**Learn any topic or train your team from real documents with adaptive quizzes powered by Meta Muse models.**

Demo video: [Learn Quiz: your SOPs become the training (YouTube, 2:59)](https://youtu.be/-jNl_HLRJ7Q) · live app https://app.learnquiz.com · site https://learnquiz.com · Android APK https://github.com/cristianuibar/learnquiz/releases/latest/download/learnquiz.apk

## Hackathon entry

**Meta AI Developer Hackathon** (building period Oct 27 – Nov 4, 2026). Track:
**Indie Developer**. Problem statement: **Build for Your World**. Built solo by
Cristian Uibar.

## Built from scratch during the hackathon

- First commit: `a9778b0`, on **2026-10-27 at 16:55 UTC**, “Initial project setup”.
- **495 commits on main, 474 merged PRs, and 550 closed issues**, all between
  Oct 27 and Nov 4, 2026.
- All commits were authored by Cristian Uibar.
- Before kickoff, only the name, the domain and an unused mood board existed;
  none of their assets ship.
- Claude Code and Codex agents wrote and reviewed the code under Cristian's
  direction. See the [full disclosure](#disclosure-for-the-judges) below.

Check the repository history with `git log --reverse` to verify the starting point,
commit dates and authorship.

## Bonus prizes we are entering

- **Best Build on Meta Open Weight Models:** Muse Spark Open runs on
  partner-provided inference (Fireworks,
  `accounts/fireworks/models/muse-spark-open`) as the placement-result stage of
  every personal-topic placement, with Spark 1.3 as a fallback. The open-source
  build also runs fully on **Muse Glimmer** on your own hardware through Ollama or
  llama.cpp. See the [model documentation](docs/MODELS.md) and
  [fully local Muse Glimmer guide](docs/LOCAL-MUSE-GLIMMER.md).
- **Best Creative Build:** Muse Image draws concept diagrams for visual concepts,
  and Muse Wonder orders personal-topic sessions, with a rules fallback. See the
  [model documentation](docs/MODELS.md).
- **Most Viral Project:** the demo video is posted on X; the post link is in the submission.
  See the [model documentation](docs/MODELS.md) for what powers the project.
- **Community Vote.** See the [model documentation](docs/MODELS.md) for the build's
  use of Meta models.

## For judges: try it in 2 minutes, no sign-up needed

### (a) Learner

Open https://app.learnquiz.com and choose **Continue as guest**: no account, no
email. Type any topic at [/start](https://app.learnquiz.com/start), for example
“How to keep a cactus alive”, and choose **Find my level**. Generation can take
**1–4 minutes** when the Meta API is busy. Answer the placement, then open
**Model trace** to see every Muse call: model, latency, tokens and cost.
Guests have **150 model calls a day**; email accounts have **500**.

### (b) Company portal (HR)

Demo HR login (a public demo account; no sign-up): `judge@northwind.learnquiz.test` / `LearnQuiz-Judge-2026` at https://app.learnquiz.com/sign-in. It is an admin of the fictional Northwind Logistics demo company; choose **Got it** on **Before you start** the first time.

Sign in at https://app.learnquiz.com/sign-in to explore the **Northwind Logistics**
demo company:

1. **Overview** for the company training summary.
2. **Roles → Warehouse picker** for a curriculum with SOP quotes and critical steps.
3. **Questions** for the role's question bank.
4. **People → Morgan Chen → Training progress** for an employee's learning progress.
5. **Roles → Create role → upload a PDF → Build curriculum** to try your own material.

### (c) Android

Install the [Android APK](https://github.com/cristianuibar/learnquiz/releases/latest/download/learnquiz.apk);
sign in with a web account or open an invite. See [Android app](#android-app) for
invite details.

Facebook login is in Meta Development mode, so use **email or guest**.

## Quick start (self-host, step by step)

Use Node.js 24 and pnpm 12.14.0, then:

```sh
git clone https://github.com/cristianuibar/learnquiz.git
cd learnquiz
pnpm install
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Fill the keys in `apps/web/.dev.vars`: set `LLM_API_KEY` to your Meta Model API key,
replace `BETTER_AUTH_SECRET` with a random secret of at least 32 characters, and
keep `BETTER_AUTH_URL=http://localhost:3000`. For Fireworks placement results, also
set `FIREWORKS_API_KEY`. Then run:

```sh
pnpm db:migrate:local
pnpm dev
```

Open http://localhost:3000. See [Run locally](#run-locally) for full configuration
and [fully local Muse Glimmer mode](docs/LOCAL-MUSE-GLIMMER.md) to run inference
on your own hardware. The root [.env.example](.env.example) lists variable names;
the web app reads `apps/web/.dev.vars`.

## Docs index

- [Model map](docs/MODELS.md): every model call.
- [Benchmarks](docs/BENCHMARKS.md): production latency, failure and cost per model.
- [Trace replay](docs/TRACE-REPLAY.md): a recorded end-to-end run.
- [Local Muse Glimmer](docs/LOCAL-MUSE-GLIMMER.md): fully local inference.
- [Fine-tuning](docs/FINETUNE.md): LoRA guide for Muse Glimmer.

## Product overview

> Quiz it, until you learn it.

Learn Quiz helps companies onboard new hires through quiz practice with their training
material. A company owner creates a job role and invites teammates with a link or QR
code. The owner uploads role documents and builds a shared curriculum. Learners take
a placement quiz and practise with questions matched to their level and due for review.

The company portal currently covers setup, job-role membership, invitations and
employee progress. **People** shows each person's status (invited, active or
proficient), progress toward the role benchmark and last activity; the **Overview**
counts employees, proficient employees, average days to proficiency and critical-step
errors this week. Each role has a shared curriculum and question bank; each learner
has their own progress. Personal topics are also available at `/start`.

## Try it

- **Web:** at https://app.learnquiz.com/sign-in choose **Create an account** with
  email and password, then open https://app.learnquiz.com/start. Enter a topic,
  optionally paste your material, and choose **Find my level**. An account has a
  higher daily model-call cap than a guest.
- **Company portal:** on https://learnquiz.com choose **Create a company account**,
  create the company and its first role, then open the role under **Roles**. Upload
  a PDF or paste text and choose **Build curriculum**. Invite learners by link or
  QR code from **People**; their training uses the role's shared curriculum.
- **Android:** follow the [Android app](#android-app) instructions below.

Use email to sign in. Facebook login is in Meta's Development mode and works only
for the app's roles and test users.

## Android app

Install the [Android APK](https://github.com/cristianuibar/learnquiz/releases/latest/download/learnquiz.apk).
Sign in with an account created on the web, or open a company invite on your phone
and tap **Open in the app** below the web form to create the invited account in
Android. The Android sign-in screen has no sign-up option; use the invite's app
link before completing the web join form if you want to create the account in Android.

## What works today

- **Company onboarding:** email/password accounts, company creation with a first job
  role, and invitations tied to that role. Admins share invite links or QR codes from
  **People**; invitations are not emailed. Joining members acknowledge the training
  data disclosure before continuing.
- **Learning from documents and text:** company roles accept PDFs with a text layer
  (up to 10 MB per file) or pasted text. Each role document is limited to 60,000
  characters, including extracted PDF text. Personal topics accept a topic,
  optional goal and up to 20,000 pasted characters to build a curriculum with
  units, concepts and prerequisites.
- **Practice:** placement, multiple-choice, fill-in-the-blank and short written
  answers, confidence ratings, corrective feedback, spaced review (FSRS) and concept
  mastery estimates (BKT). Short written answers and voice input are for personal
  topics. Code selects session items and adjusts difficulty; Wonder can order
  personal-topic sessions, with a rules fallback.
- **Staff administration:** the separate `/admin` area lists companies, members,
  roles, member learning documents, active learners and model spend. Staff can inspect
  company portals read-only, search users, and ban or unban accounts. This requires
  the staff `admin` role, distinct from being a company owner or admin.

## Meta models and status

| Model | Job | Status |
| --- | --- | --- |
| Muse Spark 1.3 (`muse-spark-1.3`) | Curriculum skeleton, question generation and item self-check | Shipped; default Meta Model API model with JSON-schema output |
| Muse Spark 1.3 | Short-answer grading | Shipped for personal topics |
| Muse Spark Open on Fireworks (`accounts/fireworks/models/muse-spark-open`) | Placement result text (`placement_line`) for personal topics | Configured; falls back to Muse Spark 1.3 when Fireworks fails or times out, then to a template; company roles use a template |
| Muse Voice Transcribe 1.0 (`muse-voice-transcribe-1.0`) | Transcribe spoken answers for editing before submission | Shipped for personal-topic written answers; `VOICE_ENABLED=true` in the checked-in configuration |
| Muse Wonder 1.0 (`muse-wonder-1.0`) | Order selected session items and explain the order | Optional for personal topics, with a rules fallback; company roles use the rules planner |
| Muse Image 1.0 | Diagrams for visual concepts | Shipped for personal topics; company role topics do not generate diagrams |

Every model call is logged to the `model_calls` table. For personal topics on the
web, open **Model trace** on a session summary or the Path screen to see each call's
purpose, model, latency, tokens and estimated USD cost, plus the total. Generated paths, questions and placement
feedback name the model that wrote them. Traces are private to the learner.
Topic links and model labels are recorded for newly generated content. Android
shows model attribution but has no model-call trace.

Cost estimates use the configured token price table for Spark 1.3. Models without
a known price, including Wonder, Image and voice, record `cost_usd = null` and show
**Unknown** in the trace. Totals include priced calls only; unpriced calls add no
monetary charge and still count toward the daily model-call cap. Billing rates and
units for these models will be added separately.

With the checked-in `VOICE_ENABLED=true` and the voice job mapped to Meta's Muse
Voice Transcribe 1.0, personal-topic written-answer questions on the web offer a
record button. Allow microphone access, tap to record (up to one minute), then tap
to stop. Edit the transcript before choosing confidence and pressing Check.
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
2. Open the role under **Roles**. Upload a PDF with a text layer or paste a fictional
   support handbook, then choose **Build curriculum**. Questions generate in the
   background for the role.
3. Open **People**, choose **Invite people**, enter a teammate's name and email,
   select their job role, and choose **Create invite links**. Share the link or its
   QR code with that teammate.
4. The teammate opens the invite, creates an account or signs in with the invited
   email, joins the company and acknowledges **Before you start**.
5. Once the role's training is ready, the teammate opens **Today** to begin placement
   and practice. Use **Path** to inspect the curriculum and **Today** for subsequent
   sessions. A working model API key is required to generate training content.

Use fictional training material for this walkthrough. The company role curriculum
is shared; a personal topic created at `/start` belongs to its learner.

## Stack

TanStack Start (React 19) on one Cloudflare Worker, D1 (SQLite) through Drizzle,
Better Auth (guest login, email and password, organizations and invites, Facebook
login when configured), shadcn/ui and Tailwind 4. The Android app uses Expo and
React Native. R2 stores original role PDFs and generated diagrams.

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
to use a second model for checking questions. The `plan` job can order personal-topic
sessions; company roles use the rules planner. Only the Meta models listed in
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
requests to the app hostname, 10 per minute per IP, block. The Worker also caps model
calls per UTC day: **150 per guest**, **500 per account**, and **400 per company**.
Retries, voice transcriptions and image generations count toward the applicable caps.

### Apex domain cutover

`learnquiz.com` is served by the marketing site Worker (`learnquiz-site`, `apps/site`);
the web app Worker (`learnquiz`) serves only `app.learnquiz.com`. To move the apex
from the web app to the site, in this order:

1. In the Cloudflare dashboard, detach the `learnquiz.com` custom domain from Worker `learnquiz`.
2. `pnpm deploy:web`
3. `pnpm deploy:site`
4. Check that an old app link follows the site's redirect to the app host; the final
   URL must be `https://app.learnquiz.com/join/x`, not only a success status:

```sh
curl -sIL -o /dev/null -w '%{url_effective}\n' https://learnquiz.com/join/x
```

`apps/web/src/worker.ts` delegates HTTP requests to TanStack Start. In production the
per-minute cron (the scheduled handler) drains concept question generation and sends
learning pushes on the quarter hour; under `vite dev`, where no cron fires, the request
that queues concepts drains them itself. The queue handler is empty.

## Disclosure for the judges

All code in this repository was written during the hackathon window, starting
Oct 27, 2026. Before the kickoff only the name, the domain and an unused visual mood
board existed; that mood board was derived from a third-party site and none of its
assets, colours or copy ship here. Claude Code and Codex agents wrote and reviewed
the code under Cristian Uibar's direction, with Grok as a fallback and second reviewer.

## Licence

MIT — see [LICENSE](LICENSE). Copyright © 2026 Cristian Uibar.
