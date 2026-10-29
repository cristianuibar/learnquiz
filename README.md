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
| Spoken answers, planned | Muse Voice Transcribe 1.0 |
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

`.dev.vars` is git-ignored. To fill the key from Proton Pass without showing it:
`pass-cli run --env-file lq.env -- sh -c 'printf "LLM_API_KEY=%s\n" "$LLM_API_KEY" >> .dev.vars'`
where `lq.env` holds only the `pass://` reference.

Deploy: create the D1 database and R2 bucket named in `wrangler.jsonc`, put the
`database_id` there, set the secrets with `wrangler secret put`, then `pnpm deploy`.
In the Cloudflare dashboard, add a WAF rate limiting rule for the same zone: POST
requests to learnquiz.com, 10 per minute per IP, block. The worker also caps each
learner at 20 model calls per day and pasted sources at 20,000 characters.

Config (`wrangler.jsonc` vars and secrets): `LLM_PROFILE` (`meta`, `baseten`, `ollama`),
`LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `IMAGE_MODEL`, `VOICE_ENABLED`,
`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`.

Staff (the `/admin` area, `requireStaff()`): make a user staff once they have signed up:
`pnpm exec wrangler d1 execute learnquiz --remote --command "UPDATE user SET role='admin' WHERE email='you@example.com'"`
(drop `--remote` for the local database).

Local edition: point `LLM_PROFILE=ollama` and `LLM_BASE_URL` at an Ollama or llama.cpp
server running Muse Glimmer; images and voice switch off.

## Disclosure for the judges

All code in this repository was written during the hackathon window, starting
Oct 27, 2026. Before the kickoff only the name, the domain and an unused visual mood
board existed; that mood board was derived from a third-party site and none of its
assets, colours or copy ship here. Coding agents (Claude Code and Codex) were used
to write code under the author's direction, and Gemini and Grok agents reviewed it.

## Licence

MIT.
