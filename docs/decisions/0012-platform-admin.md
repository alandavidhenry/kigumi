# 0012 — Platform admins are named by environment variable

**Status:** Accepted (2026-10-08)

## Context

The global microphone catalogue (ADR 0008) needs a review queue that only Kigumi's own staff can use. Organisation roles (owner, manager, engineer, viewer) are per-tenant, so none of them can mean "may publish to the catalogue every tenant reads". Better Auth owns the `user` table, and its shape is changed through config, not by hand.

## Decision

- A **platform admin** is a signed-in user whose **verified** email is listed in `PLATFORM_ADMIN_EMAILS` (comma separated, case-insensitive). The check is `isPlatformAdmin` in `src/lib/platform-admin.ts`.
- Admin routes and pages call `getPlatformAdminContext()`, which answers **404 for everyone else**, so the surface can't be discovered. Signed-out callers still get 401.
- No new column, role or table. With the variable unset there are no admins.

## Consequences

- Granting or revoking access is a deployment setting, which suits a sole developer and keeps the auth tables untouched.
- It does not scale to a staff team with different duties. If that happens, move to a Better Auth admin plugin or a `PlatformAdmin` table, and mark this record superseded.
- Admin actions on the global catalogue are **not** in the per-tenant `AuditLog`, which requires an `organisationId`. The reviewer and time are kept on the row (`reviewedById`, `reviewedAt`, `reviewNotes`) and on the provenance they verified (`verifiedById`, `verifiedAt`). A platform-level audit trail is listed in `future-considerations.md`.
