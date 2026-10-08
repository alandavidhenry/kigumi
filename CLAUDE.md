# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Start development server
npm run build          # Build for production (fails on type errors)
npm run start          # Start production server
npm run lint           # Run ESLint
npm run format         # Format with Prettier
npm run format:check   # Check formatting without writing
npm run checks         # Lint + format check + TypeScript type check + tests
npm test               # Run all Vitest tests (unit + integration)
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report (src/lib)
npm run test:e2e       # Playwright E2E (needs docker:up + migrated/seeded DB; starts dev server if none running)
npm run docker:up      # Postgres (localhost:5433) + Azurite (localhost:10010)
npm run db:migrate     # prisma migrate dev
npm run db:seed         # Demo org + owner/manager/engineer/viewer@kigumi.test and the starter mics (published for dev only)
npm run mics:ingest     # Load data/mics/*.json as draft rows for the review queue (--dry-run validates only)
npm run mics:check-links  # HEAD-check spec-sheet URLs, respecting robots.txt
npm run mics:derive     # Derive FR / polar points from open-dataset impulse responses
```

`npm run checks` is the full quality gate. Husky runs it on pre-commit (plus gitleaks if installed). `npm run test:e2e` and `npm run build` are not part of `checks`; run them at the end of a phase or when UI/auth changed. See `README.md` for first-time setup.

## Architecture

Multi-tenant recording-studio planning SaaS on **Next.js 16 App Router**, mirroring `../minato`'s stack and conventions. The product plan lives in `docs/PLAN.md` and the decisions in `docs/decisions/` (ADRs).

Stack summary: Neon PostgreSQL via Prisma 7 (client in `src/generated/prisma/`, singleton `src/lib/prisma.ts`), Better Auth with the organization plugin (`src/lib/auth.ts`, hooks in `src/lib/auth-hooks.ts`), Azure Blob Storage (Azurite locally), Azure Communication Services email (`src/lib/email.ts`), Anthropic API behind `src/lib/ai/` (Phase 3+).

Detail lives in `docs/`. **Read the relevant file before working in that area** rather than guessing:

- `docs/architecture.md`: auth, tenancy, routes, UI patterns
- `docs/data-model.md`: Prisma models and key lib functions
- `docs/testing.md`: what is covered where, and how
- `docs/PLAN.md`: product plan and phases; `docs/decisions/`: ADRs; `future-considerations.md`: open work

Always-relevant patterns:

- **Tenancy (ADR 0003):** every tenant-owned model has non-null `organisationId` and is listed in `TENANT_MODELS` (`src/lib/tenant-scope.ts`). Tenant data is only read or written through `tenantDb(ctx)` inside `src/lib/`; ESLint blocks `@/lib/prisma` outside `src/lib`. Cross-tenant access surfaces as 404.
- **Request flow:** route handler → `getTenantContext()` → lib function (`requirePermission(ctx, Permission.X)` → `tenantDb(ctx)` → `recordAudit(ctx, …)`) → `toErrorResponse` on failure. Roles and permissions live in `src/types/rbac.ts`.
- **Plans (ADR 0011):** `src/lib/plans.ts`. Limits via `canAdd` on create; paid features via `requireFeature(ctx, Feature.X)` in lib and `useTenant().has(feature)` in UI. New paid features go in `FEATURE_MINIMUM_TIER`, show an `UpgradeNotice` (not hidden) on lower tiers, and get a plan-gate test.
- Better Auth tables use US spelling (`Organization`, `organizationId`); Kigumi's own models use `organisationId`.
- Path alias `@/*` → `src/*`. Tailwind v4 with semantic tokens from `src/app/globals.css` (no hardcoded palette classes). Radix UI primitives (shadcn new-york).
- `src/proxy.ts` is the Next.js 16 proxy (not `middleware`). It only does an optimistic session-cookie redirect; real checks happen server-side.
- Prisma nullable JSON: use `toJsonValue` from `src/lib/prisma-json.ts`.
- Lengths in millimetres, angles in degrees, times in UTC.

## Environment Variables

Required in `.env.local` (template: `.env.example`):

```env
DATABASE_URL=                 # local: postgresql://kigumi:kigumi@localhost:5433/kigumi
BETTER_AUTH_SECRET=           # openssl rand -base64 32
BETTER_AUTH_URL=              # http://localhost:3000 locally
AZURE_STORAGE_CONNECTION_STRING=
AZURE_STORAGE_CONTAINER_NAME=kigumi
AZURE_COMMUNICATION_CONNECTION_STRING=  # blank locally: emails are logged with console.warn
ACS_SENDER_ADDRESS=
CRON_SECRET=
PLATFORM_ADMIN_EMAILS=         # verified emails allowed into /admin/mics (ADR 0012); blank = no admins
ANTHROPIC_API_KEY=            # Phase 3+
AI_MODEL_DEFAULT=claude-sonnet-5-5
AI_MODEL_FAST=claude-haiku-5-5
```

## Deployment

Same target as Minato: Docker → GHCR → Azure App Service, Neon Postgres. The deploy workflows and Terraform are **not set up yet** (planned for a later phase). CI today (`.github/workflows/pr-check.yml`): lint/format/types/tests → security scan (npm audit on production deps + gitleaks) → Playwright E2E against a built app → Docker build (no push). Health checks are split like Minato's: `/api/health` is liveness only (no DB, so Neon can autosuspend) and `/api/health/deep` checks DB and Blob.

## Code Style

### Formatting (Prettier)

- No semicolons
- Single quotes for JS/TS strings and JSX attributes
- No trailing commas
- LF line endings

### Linting (ESLint)

- `console.log` is disallowed. Use `console.warn` or `console.error` only.
- Unused variables are errors; prefix intentionally unused parameters with `_`
- React prop-types are off (TypeScript handles this)
- `react-hooks/rules-of-hooks` is an error; `exhaustive-deps` is a warning
- `@/lib/prisma` may only be imported inside `src/lib/` (tenancy)

**Import ordering** is enforced (`npx eslint --fix` sorts it): builtin, external, internal (`@/`), parent, sibling, index, object, type. Blank line between groups, alphabetised within each.

## Workflow

For new features use the `/feature` skill (types → tests → implementation → `npm run checks` → docs). Build phase by phase per `docs/PLAN.md`. At the end of each phase, run checks, build and E2E, summarise, and stop for approval. Keep this file short: put detail in `docs/`.

## Documentation Maintenance

After a meaningful change, update only what it affects:

- **`docs/*.md`**: the matching reference file (schema/lib → `data-model.md`; routes/UI/auth → `architecture.md`; new test areas → `testing.md`)
- **`future-considerations.md`**: mark completed items, add new gaps or deferred work
- **`docs/PLAN.md`**: when scope or phases change
- **`README.md`**: only if setup, commands or the testing table changed
- **`docs/decisions/`**: a new ADR only for a real "why X over Y" decision

## Business Context

Kigumi plans the technical side of recording-studio sessions. Its core is the studio's **own** equipment and microphone inventory, plus AI mic recommendations drawn **only from what the studio owns**. It also covers layouts, input lists, recall sheets, maintenance and warranties. Target users: home/project studio owners, commercial studio managers, freelance and assistant engineers, audio education. Alan is the sole developer. **Key differentiator to protect:** recommendations and plans are grounded in real inventory and real spec data, never generic advice or invented numbers.

## Testing Strategy

**Stack:** Vitest (unit + integration), Playwright (E2E, `e2e/`). Coverage by area is in `docs/testing.md`.

**TDD workflow:** define interface types → write tests → implement to pass tests. Target >90% coverage on `src/lib/`.

**Test discipline (non-negotiable):**

- Update existing tests whenever code changes
- Write new tests whenever new code is added
- Every new tenant-scoped route gets a cross-organisation 404 test
- Run `npm run checks` before every commit

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
