# Run LearnQuiz locally with Muse Glimmer

The existing `ollama` profile routes supported text jobs to an OpenAI-compatible
server. This name is also used for llama.cpp; there is no separate `llamacpp`
profile. No weights, model server, downloader, converter or GPU runtime are
bundled. These instructions describe the code at
`d6895da784da6310fe33a38c59f3af044a8050b7`; they are not a claim that we have tested
a particular Glimmer weight release or backend version.

## Prerequisites and weights

- Node.js **24**, pnpm **12.14.0**, and a platform supported by Wrangler.
- An approximately **24 GB GPU** as a planning starting point for Glimmer. Actual
  fit depends on weight format/quantization, context length and KV cache; training
  requires additional memory. CPU/offload may work but can exceed app timeouts.
- Ollama or a llama.cpp build that explicitly supports your Glimmer architecture
  and weight format, plus enough RAM/disk for the weights.
- Obtain **Muse Glimmer** from Meta's official release/distribution channel under
  its applicable license. Verify publisher, revision and checksums. This repo has
  no official download URL, Hugging Face repository ID, license copy or tested
  quantization; do not substitute a similarly named community model blindly.
  If the official weights or backend support are unavailable to you, this setup
  is blocked at that prerequisite. The app accepting an ID does not supply weights.

For an official Hugging Face release, an illustrative download command is:

```sh
# Replace OFFICIAL_GLIMMER_REPO with the verified publisher/repository ID.
hf download OFFICIAL_GLIMMER_REPO --local-dir "$HOME/models/muse-glimmer"
```

This is a placeholder, not a known published repository ID. Use the publisher's
required authentication/license acceptance and conversion procedure. Keep model
files outside the LearnQuiz checkout.

## Serve an OpenAI-compatible endpoint

Choose one backend. The request model ID **must be `muse-glimmer`**, because
`lib/llm/models.ts` allowlists it. Arbitrary local model names are rejected.
Commands below assume you already have a compatible GGUF; conversion from other
formats is backend/architecture-specific and is not implemented by LearnQuiz.

For Ollama, start `ollama serve` (or its installed service), then create an alias
using a Modelfile outside the repo:

```text
FROM /absolute/path/to/official-compatible-glimmer.gguf
```

```sh
ollama create muse-glimmer -f /absolute/path/to/Modelfile
curl http://127.0.0.1:11434/v1/models
```

Use the publisher's required chat template if GGUF metadata does not provide it;
an incorrect template can produce valid-looking but poor or malformed answers.
Ollama must support the architecture; importing GGUF alone cannot add support.

Alternatively, with a compatible llama.cpp build:

```sh
llama-server -m /absolute/path/to/official-compatible-glimmer.gguf \
  --alias muse-glimmer --host 127.0.0.1 --port 8080 -ngl 99 -c 16384
curl http://127.0.0.1:8080/v1/models
```

These are backend CLI options, not LearnQuiz flags; check your installed version.
Increase context if prompts plus output do not fit, within available GPU memory.
The app requests up to 16,000 output tokens for curriculum/items, so this sample
16,384-token context may need enlargement for long source documents. Bind to
loopback for a single-machine setup. LearnQuiz needs `/v1/chat/completions` with
`response_format: {"type":"json_object"}` and a string message content reply.

## Configure and start the app

From the repository root:

```sh
pnpm install --frozen-lockfile
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Edit **`apps/web/.dev.vars`**, preserving it as an untracked local file:

```dotenv
JOB_MODELS={}
LLM_PROFILE=ollama
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=muse-glimmer
LLM_API_KEY=
BASETEN_API_KEY=
FIREWORKS_API_KEY=
IMAGE_MODEL=muse-image-1.0
VOICE_ENABLED=false
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS
```

For llama.cpp, change only the base URL to `http://127.0.0.1:8080/v1`.
Generate the authentication secret privately, for example with
`openssl rand -hex 32`, and replace the placeholder. If your local server requires
a bearer key, put it in `LLM_API_KEY`. Leave optional Facebook/Web Push bindings
empty unless you configure those services.

**`JOB_MODELS={}` is essential.** Otherwise Wrangler's per-job mapping continues
to select hosted models. `.dev.vars` supports a JSON string override; do not add
`"provider":"ollama"` entries to `JOB_MODELS`, whose entry validator only accepts
`meta`, `baseten` or `fireworks`. Empty mapping makes jobs use `LLM_PROFILE` and
`LLM_MODEL` defaults instead. No tracked configuration edit is needed.

```sh
pnpm db:migrate:local
pnpm dev
```

Open `http://localhost:3000`. This runs the existing local Cloudflare Worker/D1/R2
emulation, not a production database. The migration script applies existing D1
migrations; do not create new migrations for this setup. In Vite development,
request-triggered background work drains company questions because the production
per-minute cron is not fired by `vite dev` (`server/env.ts`). Local model latency
and request lifetime can still affect long builds; no local queue daemon is
provided.

## What changes locally

- Curriculum, items, self-check, personal short-answer grading, personal placement
  text and source-backed procedure graphs use Glimmer through the local endpoint.
- Session ordering uses rules: `play.ts` explicitly skips the `plan` call for
  `ollama`. It does not run a local Wonder replacement.
- Voice is off: the gate requires `VOICE_ENABLED=true` **and** the Meta provider
  with `muse-voice-transcribe-1.0`. Typed answers remain available.
- Image generation is off: `isImageEnabled` rejects the `ollama` provider even if
  `IMAGE_MODEL` is set. Text procedure graphs are a separate supported feature.
- Company-role sessions retain their existing rules-only planning/grading and
  template placement result behavior; they use shared stored questions.

This is the whole app with local text inference, not feature parity for hosted
voice/image or optional external login/notification services. No model-server
startup, automatic download, training, adapter flag or offline asset packaging
is implemented in LearnQuiz.

## Verify in Model trace

Create a **new personal topic**, then open **Show model trace** on its topic view.
Curriculum, question and self-check calls should show `muse-glimmer`; check success
and latency. Play a session/placement and inspect its session trace as well.
“planned by rules” is expected. Existing topics can display older hosted calls or
reuse stored questions without making any new call. Unknown USD cost is expected
for Glimmer; the ledger currently prices only Spark 1.3. For local staff access,
sign up, then use the README's local D1 admin-role command and visit `/admin/usage`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Meta/Fireworks still appears | Restart dev after changing `.dev.vars`; confirm `JOB_MODELS={}` and use newly generated content, not cached items. |
| `Invalid model configuration` | Use exact `LLM_MODEL=muse-glimmer`, `LLM_PROFILE=ollama`, empty `JOB_MODELS`; no invented profile or alias in the app. |
| 404/model not found | Confirm `/v1/models`, alias, port and the `/v1` suffix. The client appends `/chat/completions` itself. |
| Network failure | Reach the endpoint from the machine running `pnpm dev`; loopback inside a container refers to that container. Check backend logs and GPU availability. |
| Invalid JSON / no questions kept | Verify backend JSON-object support, correct chat template and adequate context/output budget; inspect server logs and trace failures. Zod and self-check still run locally. |
| Timeout or out-of-memory | Reduce source size, use a supported quantization or lower backend context/concurrency, and check GPU offload. App timeouts remain 240 s curriculum/items, 180 s self-check/procedure, 120 s other text jobs. There is no timeout environment flag. |
| No voice or image button | Expected in local profile; these jobs are deliberately unavailable. |
| Missing tables / auth origin error | Apply local migrations and verify `BETTER_AUTH_URL=http://localhost:3000` plus a real random secret; local data is separate from remote D1. |
| Daily limit reached | Local calls still reserve ledger slots: guest 150/account 500/company 400 per UTC day. Local mode does not bypass caps. |
