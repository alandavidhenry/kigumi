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
| `MicrophoneUnit` | micModelId, equipmentItemId (unique, cascade), serial?, condition, matchedPairGroup?, notes? | A studio's physical copy of a catalogue model, linked to its inventory item. `condition` validated against `MIC_CONDITIONS`. Matched groups must be one model and at most three units. Deleting the unit keeps the inventory item. |
| `AuditLog` | actorUserId?, action (`entity.verb`), entityType, entityId, summary, metadata JSON?, createdAt | Indexed `(organisationId, createdAt)` and `(organisationId, entityType, entityId)`. Actor is null when Better Auth doesn't tell us who acted. |

## Global microphone catalogue (no `organisationId`, not in `TENANT_MODELS`; ADR 0008)

Tenants read **published** rows only; writes go through platform admins (ADR 0012). Vocabulary (transducer types, patterns, powering, statuses, curve methods, extraction kinds) lives in `src/lib/mics/types.ts` and is stored as strings.

| Model | Fields | Notes |
| --- | --- | --- |
| `MicrophoneModel` | slug (unique), manufacturer, model, transducerType, polarPatterns[], freqRangeMin/MaxHz?, sensitivityMvPa?, selfNoiseDbA?, maxSplDb?, impedanceOhm?, powering, phantomSafe? (null = not stated), pads[], filters[], weightG?, dimensions?, connector?, discontinued, statedApplications[], specSheetUrl?, wikidataId?, specConditions JSON? (stated conditions per field, e.g. `{ "maxSplDb": "@ 1% THD" }`), status (`draft` / `in_review` / `published`), reviewNotes?, reviewedById?, reviewedAt?, publishedAt? | Values are stored as the maker states them; unknown stays null, never estimated. |
| `Provenance` | sourceUrl? (null only for `drafted_unverified`), documentTitle?, documentPage?, documentSha256?, retrievedAt?, licenceNotes?, attribution?, confidence, extraction, verifiedById?, verifiedAt? | One row per source document. We keep no copy of the document (ADR 0008 L5). |
| `MicFieldProvenance` | micModelId, field, provenanceId; unique (micModelId, field) | Per-field provenance: one source per spec column. |
| `MicFrequencyResponse` | micModelId, pattern, filterSetting?, points `[hz, db][]` (0 dB at 1 kHz), method, provenanceId? | `method`: `dataset_measured`, `manufacturer_numeric`, `digitised_from_graph`, `idealised`. |
| `MicPolarData` | micModelId, pattern, frequencyHz, points `[angleDeg, db][]` (re 0°), method, mirrored, provenanceId? | `mirrored` marks a half-plot that the UI reflects. |

**Publish gate** (`checkPublishable`, `src/lib/mics/admin.ts`): every populated spec field needs a provenance entry that is not `drafted_unverified`; every non-idealised curve needs a source; `llm_drafted` provenance needs the reviewer's explicit confirmation, which then stamps `verifiedById`/`verifiedAt`. `discontinued` counts as populated only when true and `phantomSafe` only when known, so defaults make no unsourced claim.

**Status moves:** draft → in_review → published; in_review → draft (notes required); published → draft (notes required) or in_review. Editing a published row keeps its status (the admin is the reviewer). `ingestEntries` never overwrites a published row.

## Key lib functions

- `src/lib/mics/`: `catalogue.ts` (`listMics`, `getMic`, `listMicManufacturers`: published only, any member), `admin.ts` (`listMicsForReview`, `getMicForAdmin`, `createMic`, `updateMic`, `changeMicStatus`, `checkPublishable`), `locker.ts` (`listLocker`, `listUnitsForModel`, `listUnlinkedMicrophones`, `addUnit` creates the inventory item from the model unless an existing microphone item is linked, `updateUnit`, `removeUnit`), `schemas.ts` (Zod for catalogue input, seed entries, locker input), `write.ts` (shared create/replace of scalars, provenance and curves), `seed.ts` (seed-file schema, `validateSeedSet` incl. the per-maker cap, `ingestEntries`), `format.ts` (spec rows, ribbon phantom warning), `ir-analysis.ts` (FFT, 1/3-octave response, polar band levels, WAV reader), `link-check.ts` (robots-aware HEAD checker).
- `src/lib/charts/`: `polar.ts` (first-order pattern maths, idealised curves, half-plot mirroring), `frequency.ts` (ISO 1/3-octave centres, log interpolation, curve merging).
- `src/lib/platform-admin.ts`: `isPlatformAdmin`, `getPlatformAdminContext` (404 for non-admins).

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

## Mic seed data (`data/mics/`)

One JSON file per maker (`{ maker, entries[] }`, entries shaped like `micInputSchema`) plus `makers.json` for the per-maker cap (`currentRange` is counted from the maker's product listing at transcription time; null = cap unchecked). The 22 first-batch mics (the ★ models in ADR 0008) are in. They hold **structural facts only** (transducer, patterns, powering) with `drafted_unverified` provenance, plus the SM57's frequency range (`llm_drafted`, Shure product page, retrieved 2026-10-08). No sensitivity, noise, SPL or impedance numbers are seeded, and ribbon `phantomSafe` is left blank, because none were checked against a spec sheet. `npm run mics:ingest` loads them as drafts.

## Seed data (`prisma/seed.ts`)

Organisation "Northern Lights Recording" (Studio plan) with verified users `owner@`, `manager@`, `engineer@` and `viewer@kigumi.test` (password from the CLI arg, `SEED_PASSWORD`, or `kigumi-dev-password`), one studio, three rooms and four inventory items. The seed also loads the mic seed files and, for local development and E2E only, publishes them and links two units (U 87 Ai, SM57) to the demo inventory; it must never run against production. It is idempotent (upserts on fixed ids).
