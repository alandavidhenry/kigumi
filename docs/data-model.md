# Data model reference

Schema: `prisma/schema.prisma`. The target model for later phases is in `docs/PLAN.md` §3.

## Better Auth tables (owned by Better Auth, US spelling)

`User`, `Session` (`activeOrganizationId`), `Account` (credential password hash), `Verification`, `Organization` (+ `planTier`, default `free`), `Member` (`role`: owner / manager / engineer / viewer), `Invitation` (`status`, `expiresAt`, `inviterId`). Change their shape through `src/lib/auth.ts` config, never by hand.

## Kigumi tenant models (non-null `organisationId`, in `TENANT_MODELS`)

| Model      | Fields                                                                                         | Notes                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Studio`   | name, address?, timezone (IANA, default Europe/London), notes?                                 | Building or site. Deleting cascades to rooms.                                                                                                 |
| `Room`     | studioId, name, widthMm, lengthMm, heightMm?, notes?                                           | Interior dimensions in mm (0.5–100 m footprint, 1–30 m height). Sets layout scale in Phase 5.                                                 |
| `EquipmentItem` | category, make, model, serial?, quantity (default 1), status, roomId? (SetNull on room delete), purchaseDate?, purchasePriceMinor? (pence, per item), supplier?, tags[], customFields JSON? (string map), notes? | `category` and `status` are strings validated by Zod against `src/lib/equipment-types.ts`. Cables, stands and accessories use `quantity`. Indexed `(organisationId)` and `(organisationId, category)`. |
| `Attachment` | entityType (`equipment`), entityId, blobPath, fileName, mimeType, sizeBytes, kind (`photo`) | Polymorphic (no FK to the owner); the owner's delete removes rows and blobs. Blob path is `<organisationId>/<attachmentId>.<ext>`. |
| `AuditLog` | actorUserId?, action (`entity.verb`), entityType, entityId, summary, metadata JSON?, createdAt | Indexed `(organisationId, createdAt)` and `(organisationId, entityType, entityId)`. Actor is null when Better Auth doesn't tell us who acted. |

## Key lib functions

- `src/lib/studios.ts`: `listStudios`, `getStudio`, `createStudio`, `updateStudio`, `deleteStudio`, `createRoom`, `updateRoom`, `deleteRoom`, `getOrganisationUsage`. All take a `TenantContext`, check permissions, validate with Zod, enforce plan limits on create (room limits are organisation-wide), and audit every mutation. Updates use `updateMany` plus a re-read so a cross-tenant id is simply "not found".
- `src/lib/members.ts`: `listMembers`, `listPendingInvitations` (managers+), `listMyOrganisations`, `countMembers`.
- `src/lib/equipment.ts`: `listEquipment` (filters: `q` over make/model/serial/supplier/tag, `category`, `status`, `roomId`, `tag`), `getEquipment` (with photos), `createEquipment` (inventory plan limit counts rows, not quantity; room must belong to the organisation), `updateEquipment`, `deleteEquipment` (removes photos), `listRoomOptions`, `countEquipment`.
- `src/lib/equipment-io.ts`: `exportEquipmentCsv`, `importEquipmentCsv` (all-or-nothing: every row validated, per-row errors returned as `details.errors`, max 1000 rows, plan limit checked for the whole batch), `getValuationReport` / `buildValuation` / `valuationToCsv` (Pro and above via `requireFeature(Feature.VALUATION_REPORT)`; retired items excluded; unpriced items counted separately).
- `src/lib/attachments.ts` + `src/lib/storage.ts`: photo upload (JPEG/PNG/WebP, 5 MB, 8 per item, content type verified by magic bytes, plan storage limit), download, delete. Blobs live in Azure Blob Storage and are only reached through a tenant-scoped `Attachment` row.
- `src/lib/csv.ts`: RFC 4180 reader/writer; exports prefix `= + - @` text cells with `'` to block spreadsheet formula injection.
- `src/lib/audit.ts`: `recordAudit(ctx, entry)` (via `tenantDb`), `writeAuditLog(orgId, actorId, entry)` (for Better Auth hooks), `listAuditLog(ctx, { limit })` (clamped 1–200).
- `src/lib/plans.ts` (ADR 0011): tiers `free` / `pro` / `studio` / `facility` (`PLAN_ORDER`); `PLAN_LIMITS` (studios, rooms, seats, inventoryItems, aiRequestsPerMonth, storageMb); `Feature` + `FEATURE_MINIMUM_TIER`; `PLAN_INFO` (labels, audiences, prices in pence); helpers `getPlanLimits`, `canAdd`, `hasFeature`, `minimumTierFor`, `upgradeTierFor`, `featuresFor`, `featuresIntroducedBy`, formatters. Unknown tiers (including the retired `education`) fall back to `free`.
- `src/lib/seats.ts`: `countUsedSeats` (members + live pending invitations).
- `src/lib/validation.ts`: `studioInputSchema`/`studioUpdateSchema`, `equipmentInputSchema`/`equipmentUpdateSchema`/`equipmentFilterSchema`, money helpers (`majorToMinor`, `minorToMajor`, `formatMoney`; GBP only for now) (the update schema is built from raw fields, so defaults never overwrite stored values), `roomInputSchema`/`roomUpdateSchema`, unit helpers.
- `src/lib/slug.ts`: `uniqueSlug` for organisation slugs.

## Seed data (`prisma/seed.ts`)

Organisation "Northern Lights Recording" (Studio plan) with verified users `owner@`, `manager@`, `engineer@` and `viewer@kigumi.test` (password from the CLI arg, `SEED_PASSWORD`, or `kigumi-dev-password`), one studio, three rooms and four inventory items. It is idempotent (upserts on fixed ids).
