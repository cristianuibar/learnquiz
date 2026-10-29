# AGENTS.md - learnquiz

Codebase for Learn Quiz. Product context, the spec and research live one level up in
the project root (`../IDEA.md`, `../AGENTS.md`, `../context/spec/SPEC.md`, `../context/`).

- Stack: TanStack Start (React) on one Cloudflare Worker, D1 + Drizzle, R2, Better Auth.
  Read `README.md` for how to run it and `../context/spec/SPEC.md` for what to build.
- Only `src/server/env.ts` imports `cloudflare:workers`. Build db and auth per request.
- D1 has no transactions: use `db.batch()`. Migrations: `drizzle-kit generate`, then
  `wrangler d1 migrations apply learnquiz --local|--remote`.
- Every model call goes through `src/lib/llm/client.ts` and is logged to `model_calls`.
- Commit explicit paths only. Work on branches; keep `main` clean.
- Never commit secrets, `.env` or `.dev.vars` files.
- PRs, issues, commit messages, release notes, the README and GitHub comments describe the
  change only: never mention review process or agent tooling ("cross-review",
  "cross-family" gates, reviewer or implementer lanes, lines like
  `Implementer: codex (openai): gpt-6.1-sol xhigh`). Two exceptions: the README's
  hackathon disclosure that coding agents were used, and the one `Implementer:` line in
  commit bodies and PR descriptions, which the merge gate reads.
