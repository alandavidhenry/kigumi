# 0010 — Audit log in Postgres

**Status:** Accepted (2026-10-08). **Departs from Minato** (Azure Table Storage `activityLogs`).

## Context

Changes to inventory, sessions and organisation membership must be auditable per tenant, and viewable in the UI filtered by entity and user.

## Decision

- `AuditLog` table: `organisationId`, `actorUserId`, `action` (e.g. `room.create`), `entityType`, `entityId`, `summary`, `metadata` JSON, `createdAt`. Indexed on `(organisationId, createdAt)` and `(organisationId, entityType, entityId)`.
- Written through `recordAudit(ctx, {...})` in `src/lib/audit.ts`.

## Consequences

- One datastore instead of two. Tenant scoping is enforced by `tenantDb` like any other model, and joins to users and entities are available.
- Growth is modest. A retention or archive job can be added later if needed.
