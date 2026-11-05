# 0020 — Observability

**Status:** Accepted (2026-11-05)

## Context

Before Phase 8 the only signal in production would have been `console.error('Unhandled API error', error)` in free text. There were no request traces, no dependency timings (Neon, Blob, Anthropic, ACS), no error tracking, and nothing to alert on when the AI daily cap was hit or a cron job failed. The app runs on Azure App Service (ADR 0001 / Minato's target), which collects stdout and integrates with Application Insights.

## Decisions

**Azure Monitor's OpenTelemetry distro, opt-in.** `src/instrumentation.ts` starts `@azure/monitor-opentelemetry` only when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set. It records requests, Postgres, HTTP and Azure SDK dependencies with timings, exceptions and Live Metrics. Sampling is `OTEL_TRACES_SAMPLER_RATIO` (default 1). Local development, tests and CI load nothing. The package is a server external so the bundler leaves OpenTelemetry's module patching alone.

**Structured logs with stable event names.** `src/lib/logger.ts` writes one JSON object per line (`time`, `level`, `event`, fields, a serialised `error`) and records logged errors on the active span so they appear against the request in Application Insights. Event names are the contract for alerts: `api.unhandled_error`, `request.error`, `ai.daily_cap_reached`, `ai.daily_free_share_reached`, `ai.provider_error`, `ai.output_rejected`, `reminders.organisation_failed`, `reminders.email_failed`, `cron.reminders.finished`, `cron.housekeeping.finished`, `housekeeping.orphan_sweep_stopped`. Logs carry ids and counts, never tenant content; `onRequestError` drops query strings because share tokens live in URLs.

**Every 500 has an id.** `toErrorResponse` returns `errorId` with the generic message and logs the same id with the real error, so a user's report can be matched to the log line without exposing internals.

**Why not Sentry?** Another vendor, account and data processor for one developer to run, when App Insights comes with the hosting. **Why not `@vercel/otel`?** It needs a separate exporter and collector setup for Azure; the Azure distro is one call and includes Live Metrics. OpenTelemetry keeps the door open to switch backends later.

## Consequences

- Alerts are configuration in Azure Monitor, not code. `docs/operations.md` lists the ones to create (5xx rate, `api.unhandled_error`, AI cap reached, cron failures, health check failures) until Terraform owns them.
- `console.error` / `console.warn` remain allowed by lint for scripts and tests; app code should log through `logger`.
- Telemetry adds some overhead per request; lower the sampling ratio if volume grows. Errors and metrics are not sampled away.
