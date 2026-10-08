# 0003 — Tenancy enforcement in one data-access layer

**Status:** Accepted (2026-10-08). **Departs from Minato** (nullable `tenantId`, checked ad hoc).

## Context

Every tenant-owned row must be invisible to other organisations. Scoping by hand in every route is how leaks happen.

## Decision

- Every tenant-owned model has `organisationId String` (non-null, indexed). Global reference data (`MicrophoneModel` and its curves) has none.
- `src/lib/tenant.ts`:
  - `getTenantContext()` resolves the Better Auth session, the active organisation and the member role. Otherwise it throws `TenantError` (401 / 403).
  - `tenantDb(ctx)` returns a Prisma client extension. For models in `TENANT_MODELS` it merges `organisationId` into `where` on reads, updates, deletes, counts and aggregates, and sets it on `data` for creates. A payload that tries to set a different `organisationId` is rejected.
  - `requirePermission(ctx, permission)` checks the role matrix in `src/types/rbac.ts`.
- Unique-key operations (`findUnique`, `update`, `delete` by id) are not allowed on tenant models through `tenantDb`. Callers use `findFirst` / `updateMany` / `deleteMany`, which accept the merged org filter, so a cross-tenant id behaves like "not found".
- ESLint `no-restricted-imports` forbids `@/lib/prisma` outside `src/lib/`, so routes and components go through lib functions that take a `TenantContext`.

## Consequences

- Cross-tenant access returns 404, not 403, so ids don't leak.
- Unit tests on the extension and integration tests per route (cross-org 404) are mandatory. Phase 8 adds an authz test sweep.
- Better Auth's own tables (`Organization`, `Member`, `Invitation`) are managed through Better Auth's API, not `tenantDb`.
