# 0001 — Database and ORM: Neon PostgreSQL + Prisma 7

**Status:** Accepted (2026-10-08)

## Context

The data is heavily relational (organisations → studios → rooms → layouts → sessions → channels; equipment ↔ mic units ↔ global mic models). Minato already runs Neon Postgres with Prisma 7 and the `@prisma/adapter-pg` driver adapter, and its CI, seed and migrate-deploy steps assume Prisma.

## Decision

- PostgreSQL: Neon serverless in hosted environments; `postgres:16` in docker-compose locally and in CI.
- Prisma 7: `prisma-client` generator output to `src/generated/prisma`, `PrismaPg` adapter, singleton in `src/lib/prisma.ts`, config in `prisma.config.ts` (loads `.env.local`).
- Migrations: `prisma migrate dev` locally, `prisma migrate deploy` in CI/CD.
- Numeric curve data (frequency response, polar points) is stored as JSON arrays on per-pattern rows rather than one row per point. It is always read as a whole curve, and this keeps row counts small.

## Consequences

- Same tooling as Minato, so patterns such as `toJsonValue` for nullable JSON carry over.
- Neon autosuspend matters: avoid DB calls on liveness probes (the `/api/health` vs `/api/health/deep` split) and keep auth sessions cookie-cached (ADR 0002).
- Moving to Azure Database for PostgreSQL later only means changing `DATABASE_URL`.
