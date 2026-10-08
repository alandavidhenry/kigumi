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
npm run db:seed                         # demo org + users (password: kigumi-dev-password)
npm run dev                             # http://localhost:3000
```

Sign in as `owner@kigumi.test`, `manager@kigumi.test`, `engineer@kigumi.test` or `viewer@kigumi.test`.

Email isn't sent locally unless ACS is configured. Verification, reset and invitation emails are printed to the dev server log, so you can follow the links from there.

## Scripts

| Command                             | What it does                                                                |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`   | Next.js dev server / production build / production server                   |
| `npm run checks`                    | Lint + format check + type check + unit/integration tests (pre-commit gate) |
| `npm test` / `test:coverage`        | Vitest                                                                      |
| `npm run test:e2e`                  | Playwright (needs the DB up, migrated and seeded)                           |
| `npm run docker:up` / `docker:down` | Local Postgres + Azurite                                                    |
| `npm run db:migrate` / `db:seed`    | Prisma migrate dev / seed demo data                                         |

## End-to-end tests

```bash
npm run docker:up && npx prisma migrate dev && npm run db:seed
npm run test:e2e        # reuses a running dev server, or starts one
```

Set `E2E_SEED_PASSWORD` if you seeded with a non-default password. CI runs the same suite against a built app (`.github/workflows/playwright.yml`).

## Testing

| Layer       | Where                                      | Covers                                                                                |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Unit        | `src/lib/__tests__`, `src/types/__tests__` | Tenancy rules, RBAC, plans, studios/rooms and inventory logic, CSV, photo upload rules, auth hooks, email, validation        |
| Integration | `src/app/api/__tests__`                    | Route handlers + lib with mocked session/DB: auth, roles, cross-org 404s, plan limits |
| E2E         | `e2e/`                                     | Sign-in, onboarding, studio/room CRUD, viewer restrictions                            |

Details: [`docs/testing.md`](docs/testing.md).
