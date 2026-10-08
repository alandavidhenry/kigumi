# Data model reference

Schema: `prisma/schema.prisma`. The target model for later phases is in `docs/PLAN.md` §3.

## Better Auth tables (owned by Better Auth, US spelling)

`User`, `Session` (`activeOrganizationId`), `Account` (credential password hash), `Verification`, `Organization` (+ `planTier`, default `free`), `Member` (`role`: owner / manager / engineer / viewer), `Invitation` (`status`, `expiresAt`, `inviterId`). Change their shape through `src/lib/auth.ts` config, never by hand.

## Kigumi tenant models (non-null `organisationId`, in `TENANT_MODELS`)

| Model      | Fields                                                                                         | Notes                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Studio`   | name, address?, timezone (IANA, default Europe/London), notes?                                 | Building or site. Deleting cascades to rooms.                                                                                                 |
| `Room`     | studioId, name, widthMm, lengthMm, heightMm?, notes?                                           | Interior dimensions in mm (0.5–100 m footprint, 1–30 m height). Sets layout scale in Phase 5.                                                 |
| `AuditLog` | actorUserId?, action (`entity.verb`), entityType, entityId, summary, metadata JSON?, createdAt | Indexed `(organisationId, createdAt)` and `(organisationId, entityType, entityId)`. Actor is null when Better Auth doesn't tell us who acted. |

## Key lib functions

- `src/lib/studios.ts`: `listStudios`, `getStudio`, `createStudio`, `updateStudio`, `deleteStudio`, `createRoom`, `updateRoom`, `deleteRoom`, `getOrganisationUsage`. All take a `TenantContext`, check permissions, validate with Zod, enforce plan limits on create (room limits are organisation-wide), and audit every mutation. Updates use `updateMany` plus a re-read so a cross-tenant id is simply "not found".
- `src/lib/members.ts`: `listMembers`, `listPendingInvitations` (managers+), `listMyOrganisations`, `countMembers`.
- `src/lib/audit.ts`: `recordAudit(ctx, entry)` (via `tenantDb`), `writeAuditLog(orgId, actorId, entry)` (for Better Auth hooks), `listAuditLog(ctx, { limit })` (clamped 1–200).
- `src/lib/plans.ts`: `PLAN_LIMITS`, `getPlanLimits`, `canAdd`, `toPlanTier`, `formatLimit`.
- `src/lib/seats.ts`: `countUsedSeats` (members + live pending invitations).
- `src/lib/validation.ts`: `studioInputSchema`/`studioUpdateSchema` (the update schema is built from raw fields, so defaults never overwrite stored values), `roomInputSchema`/`roomUpdateSchema`, unit helpers.
- `src/lib/slug.ts`: `uniqueSlug` for organisation slugs.

## Seed data (`prisma/seed.ts`)

Organisation "Northern Lights Recording" (Studio plan) with verified users `owner@`, `manager@`, `engineer@` and `viewer@kigumi.test` (password from the CLI arg, `SEED_PASSWORD`, or `kigumi-dev-password`), one studio and three rooms. It is idempotent (upserts on fixed ids).
