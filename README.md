# Kigumi

Studio session planning: plan recording sessions around the gear your studio actually owns. A multi-tenant SaaS built on Next.js 16, Prisma/Postgres and Better Auth, following the same conventions as Minato.

- Product plan: [`docs/PLAN.md`](docs/PLAN.md)
- Decisions: [`docs/decisions/`](docs/decisions/)
- Working on the code: [`CLAUDE.md`](CLAUDE.md), [`docs/architecture.md`](docs/architecture.md)

## Local setup

Requirements: Node 24+ (CI uses 26) and Docker.

```bash
npm install                             # also generates the Prisma client
cp .env.example .env.local              # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run docker:up                       # Postgres on :5433, Azurite on :10010
npx prisma migrate dev                  # apply migrations
node scripts/create-storage-container.js
npm run db:seed                         # demo org + users (password: kigumi-dev-password) and the starter mics
npm run dev                             # http://localhost:3000
```

Sign in as `owner@kigumi.test`, `manager@kigumi.test`, `engineer@kigumi.test` or `viewer@kigumi.test`.

To use the mic review queue (`/admin/mics`), set `PLATFORM_ADMIN_EMAILS=owner@kigumi.test` in `.env.local` (the E2E workflow sets it too). See ADR 0012.

Email isn't sent locally unless ACS is configured. Verification, reset and invitation emails are printed to the dev server log, so you can follow the links from there.

## AI features and free local testing

The mic summaries and comparisons call a language model. In production that is Claude through the Anthropic API (`ANTHROPIC_API_KEY`). While developing you can run a model on your own machine with [Ollama](https://ollama.com) instead, which costs nothing and needs no key. Everything else (cache, monthly allowance, number check, retry) runs as it does in production, so you are testing the real pipeline.

### Install Ollama

| OS      | Install                                                                            |
| ------- | ---------------------------------------------------------------------------------- |
| Windows | `winget install Ollama.Ollama`, or download the installer from ollama.com/download |
| macOS   | `brew install ollama`, or download the app from ollama.com/download                |
| Linux   | `curl -fsSL https://ollama.com/install.sh \| sh`                                   |

On Windows and macOS the installer starts Ollama in the background (look for the tray or menu-bar icon). On Linux, or if you installed with Homebrew, start it with `ollama serve`. It listens on `http://localhost:11434`.

Check it is running:

```bash
ollama --version
curl http://localhost:11434/api/tags    # lists installed models (empty at first)
```

### Download a model

```bash
ollama pull qwen2.5:7b                  # about 5 GB; wants roughly 8 GB of free RAM
```

On a smaller machine use `qwen2.5:3b` (about 2 GB) instead. Smaller models are faster but make more mistakes. Any model that follows JSON instructions will do; check what you have with `ollama list`.

### Point Kigumi at it

Add to `.env.local`, using the exact name shown by `ollama list`:

```env
AI_PROVIDER=local
AI_LOCAL_MODEL=qwen2.5:7b
# AI_LOCAL_BASE_URL=http://localhost:11434/v1   # default; change it for LM Studio (http://localhost:1234/v1)
```

Restart `npm run dev` (env files are read at startup), sign in as the owner, open a mic such as `/mics/shure-sm57` and press **Generate AI summary**. The first request is slow while the model loads into memory; later ones are quicker. The result is labelled `local:qwen2.5:7b`.

### What to expect

- **Quality is much lower than Claude.** Small models invent numbers, and Kigumi rejects any reply containing a number that isn't in the catalogue data, so some requests fail with "The AI response could not be checked against the catalogue data" after one automatic retry. That is the safety check working. Use the local model to test the plumbing and the UI, and a real key to judge the wording.
- **It is free and unmetered by the daily cap**, but each generation still counts against your organisation's monthly allowance (the seeded demo organisation has 2,500).
- **Development only.** Kigumi refuses `AI_PROVIDER=local` when `NODE_ENV=production`, because the output is stored in a cache shared by every organisation.
- **Stale local text:** a generated summary is cached until the mic's specs change. To regenerate with a different model, delete the cached rows:

  ```bash
  docker exec kigumi-postgres psql -U kigumi -d kigumi -c "DELETE FROM \"AiSummary\" WHERE model LIKE 'local:%';"
  ```

### Troubleshooting

| Message                                                   | Fix                                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| "Could not reach the local model server … Is it running?" | Start Ollama (`ollama serve`) and check `curl http://localhost:11434/api/tags` answers.   |
| "The local model server returned an error (404)…"         | The name in `AI_LOCAL_MODEL` isn't installed. Run `ollama list` and `ollama pull <name>`. |
| "AI_PROVIDER=local needs AI_LOCAL_MODEL set…"             | Set `AI_LOCAL_MODEL` in `.env.local` and restart the dev server.                          |
| Very slow first reply, or it times out after 3 minutes    | The model is loading or too big for your RAM. Try a smaller model such as `qwen2.5:3b`.   |

### Using the real API instead

Remove `AI_PROVIDER` (or set it to `anthropic`), set `ANTHROPIC_API_KEY`, and restart. Paid calls are limited by `AI_DAILY_REQUEST_CAP` (default 100 a day outside production), and `AI_ENABLED=false` switches generation off entirely. See ADR [0013](docs/decisions/0013-ai-service-layer.md) and [0014](docs/decisions/0014-ai-spend-guards-and-local-provider.md).

## Scripts

| Command                             | What it does                                                                |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`   | Next.js dev server / production build / production server                   |
| `npm run checks`                    | Lint + format check + type check + unit/integration tests (pre-commit gate) |
| `npm test` / `test:coverage`        | Vitest                                                                      |
| `npm run test:e2e`                  | Playwright (needs the DB up, migrated and seeded)                           |
| `npm run docker:up` / `docker:down` | Local Postgres + Azurite                                                    |
| `npm run db:migrate` / `db:seed`    | Prisma migrate dev / seed demo data                                         |
| `npm run mics:ingest`               | Load `data/mics/*.json` as drafts for the admin review queue                |
| `npm run mics:check-links`          | HEAD-check catalogue spec-sheet URLs (respects robots.txt)                  |
| `npm run mics:derive`               | Derive FR / polar points from open-dataset impulse responses                |
| `npm run recs:eval`                 | Run the golden recommendation scenarios (`-- --offline` for no model)       |

## End-to-end tests

```bash
npm run docker:up && npx prisma migrate dev && npm run db:seed
npm run test:e2e        # reuses a running dev server, or starts one
```

Set `E2E_SEED_PASSWORD` if you seeded with a non-default password. CI runs the same suite against a built app (`.github/workflows/playwright.yml`).

## Testing

| Layer       | Where                                      | Covers                                                                                                                                                           |
| ----------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | `src/lib/__tests__`, `src/types/__tests__` | Tenancy rules, RBAC, plans, studios/rooms and inventory logic, mic catalogue, AI service (fake provider), recommendation rules and golden scenarios, CSV, photo upload rules, auth hooks, email, validation |
| Integration | `src/app/api/__tests__`                    | Route handlers + lib with mocked session/DB: auth, roles, cross-org 404s, plan limits                                                                            |
| E2E         | `e2e/`                                     | Sign-in, onboarding, studio/room CRUD, inventory, mic catalogue, AI summary and comparison pages, mic recommendations, viewer restrictions                        |

Details: [`docs/testing.md`](docs/testing.md).
