# 0009 — Background jobs: GitHub Actions cron → protected API routes

**Status:** Accepted (2026-10-08)

## Context

Jobs needed: maintenance and warranty reminders (daily), notification emails, AI summary regeneration when prompt versions change, and mic data ingestion. Hosting is Azure App Service on a small plan, with Neon autosuspend.

## Decision

- Mirror Minato: scheduled GitHub Actions workflows call `/api/cron/<job>` with `Authorization: Bearer $CRON_SECRET`. Handlers are idempotent and work in bounded batches.
- Ingestion and one-off data jobs run as `tsx` scripts in `scripts/` (locally or via `workflow_dispatch`), never on user requests.
- Job logic lives in `src/lib/` (pure and unit tested); routes are thin.

## Consequences

- No queue infrastructure to run or pay for.
- Granularity is about 5 minutes at best, and delivery is best effort. If near-real-time jobs become necessary, revisit with Azure Container Apps jobs or a queue.
