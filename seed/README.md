# Northwind Logistics demo

The seed creates the fictional Northwind Logistics company, its owner and the
Warehouse picker role. It imports the original [warehouse SOP](northwind-sop.md)
through the role curriculum pipeline, retaining grounded quotes and critical
steps. Question generation and self-check build initial banks for three
representative concepts, including a critical scanning step. Every model call
uses the normal call log and daily limit.

Use Node 24 and install the project's dependencies. Apply the existing migrations
to the selected database first. For local D1:

```sh
pnpm exec wrangler d1 migrations apply learnquiz --local
```

Supply `NORTHWIND_OWNER_PASSWORD` and `NORTHWIND_LEARNER_PASSWORD` from Proton Pass.
The latter is used for both joined demo employees. Keep passwords out of the
repository, terminal history and command arguments. For example, create an
untracked environment-reference file containing only your own `pass://`
references, then run:

```sh
pass-cli run --env-file /path/to/northwind-references.env -- pnpm seed:northwind --local
```

Configure the model provider and credentials as for the local app in `.dev.vars`.
The command also accepts model bindings supplied through the process environment.
An invalid model response, missing critical scanning concept, exhausted daily
limit or database conflict stops the seed rather than substituting a generic
curriculum. Retry after resolving the cause; a partially created marked demo can
resume. A reserved account that already exists without the demo's ownership
record is refused.

The command runs a temporary Worker on loopback and stops it when done. It does
not deploy the app or apply migrations. `--remote` instead of `--local` selects
the D1 database configured in `wrangler.jsonc` through a remote binding and needs
the operator's Cloudflare access. Its writes affect that remote database.

Sign in as `owner@northwind.learnquiz.test` with the owner password and open
`/org/northwind-logistics/people`:

| Employee | Account | Initial state |
| --- | --- | --- |
| Alex Rivera | `invited@northwind.learnquiz.test` | Pending invite, no user account |
| Morgan Chen | `onboarding@northwind.learnquiz.test` | Onboarding, confident error on a critical scanning step |
| Sam Patel | `proficient@northwind.learnquiz.test` | Proficient, reached the benchmark in 6 days |

The company overview shows one proficient employee and 6 days to proficiency.
Pending invitation links are available in People; no email is sent.

Repeat runs of a completed demo preserve passwords, learning progress,
invitation state and generated content. They do not reset the scenario or renew
expired invites. A changed SOP or an unrelated company using the reserved slug
is refused. Use the app's normal invitation and learning actions to continue an
existing demo.
