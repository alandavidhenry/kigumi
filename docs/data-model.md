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

| `AiUsage` | month (`YYYY-MM`, UTC), requests, inputTokens, outputTokens; unique (organisationId, month) | Monthly AI allowance counter (ADR 0013). `requests` is checked against `PLAN_LIMITS.aiRequestsPerMonth`. |

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

## AI cache (global, ADR 0007 and 0013)

| Model | Fields | Notes |
| --- | --- | --- |
| `AiSummary` | kind (`mic` / `comparison`), subjectKey (slug, or sorted slugs joined by `+`), inputHash (sha256 of the canonical grounding input), promptVersion, model, content JSON, inputTokens, outputTokens, createdAt; unique (kind, inputHash, promptVersion) | No `organisationId`: inputs are catalogue data only, so one generation serves everyone. **Never put tenant data in an `AiSummary` input.** Content is validated against the prompt's Zod schema on every read; a row that no longer fits counts as a miss. |

| `AiPlatformUsage` | day (`YYYY-MM-DD`, UTC, primary key), requests, inputTokens, outputTokens | Global daily counter of paid model calls across all organisations; the spend ceiling in ADR 0014. Not in `TENANT_MODELS`. |

## Recommendations (tenant models, ADR 0015)

Unlike `AiSummary` these hold the studio's own data, so every row has `organisationId` and is in `TENANT_MODELS`. Nothing here is ever written to the global AI cache.

| Model | Fields | Notes |
| --- | --- | --- |
| `RecommendationRequest` | createdById? (SetNull), kind (`sources` / `question`), roomId? (SetNull), sessionId? (Phase 5, no FK yet), forDate? (`YYYY-MM-DD`), `input` JSON (the normalised request), `rules` JSON (the `RulesOutput` the model was asked to rank), `locker` JSON (the snapshot the rules saw), `aliases` JSON (alias to real id), rulesVersion, profilesVersion, inputHash | The full request context. Indexed `(organisationId, createdAt)` and `(organisationId, inputHash)`. |
| `RecommendationResult` | requestId (cascade), promptVersion, model, `content` JSON (validated reply, aliased), `final` JSON (the finalised view), adjustments JSON?, inputTokens, outputTokens | One per generation. `final` is stored so history is stable if `finalise` changes. A request with the same `inputHash` and prompt version is a free cache hit within the organisation. |
| `RecommendationFeedback` | resultId (cascade), userId? (SetNull), sourceKey (`s3` or `*`), verdict (`accepted` / `swapped` / `rejected`), swappedToUnitIds[], swappedToModelSlugs[] (snapshot), swappedToCandidate?, rating (1 to 5)?, reasons[], comment? | Unique `(resultId, sourceKey, userId)`, so it is an upsert. The comment is untrusted text and is never sent to a model. |

Source kinds, techniques and the profile tables are code, not rows (`src/lib/recommendations/profiles.ts`, `techniques.ts`); `RulesOutput` and the snapshot are plain JSON shapes in `types.ts`.

## Key lib functions

- `src/lib/ai/`: `provider.ts` (`AiProvider` interface, `AiOutputError`, `AiProviderError`), `anthropic.ts` (the Anthropic implementation using native structured output), `registry.ts` (`getAiProvider`, `setAiProvider` for tests), `config.ts` (`modelFor`, `AI_RATE_LIMIT`), `service.ts` (`findCachedAi` read-only, `generateCached`: cache → rate limit → allowance → provider → validate with one retry → store), `usage.ts` (`getAiUsage`, `reserveAiRequest`, `releaseAiRequest`, `recordAiTokens`), `platform-cap.ts` (`reservePlatformRequest`, `releasePlatformRequest`, `recordPlatformTokens`: the global daily cap), `local.ts` (`LocalProvider` for Ollama/LM Studio, dev only), `rate-limit.ts`, `hash.ts`, `grounding.ts` (rejects any number not in the input), `prompts/` (`mic-summary.ts`, `mic-comparison.ts`, and `mic-recommendation.ts`; each has `id`, `version`, `system`, `schema`, `build`, `validate`). Prompts are either a `Prompt` (catalogue data only, global `AiSummary` cache via `generateCached`) or a `TenantPrompt` (tenant data, `generateForTenant` with a tenant-scoped lookup and store; the global-cache functions refuse it).
- `src/lib/mics/ai.ts` (`getMicSummary`, `generateMicSummary`, `getMicComparison`, `generateMicComparison`, `resolveCompareMics`), `ai-facts.ts` (`buildMicFacts`: the only data the model sees), `compare.ts` (`MIN_COMPARE`/`MAX_COMPARE`, `overlayCurves`, `parseMicRefs`); `format.ts` also has `comparisonRows`.

- `src/lib/recommendations/` (ADR 0015): `types.ts` (vocabulary, `RulesOutput`, `LockerSnapshot`), `profiles.ts` + `techniques.ts` (reviewed priors; `PROFILES_VERSION`), `classify.ts` (label to source kind), `schemas.ts` (`recommendationRequestSchema`, `normaliseRequest`, `feedbackInputSchema`), `rules.ts` (`runRules`: pure eligibility, suitability, options, scoring, plan, channel and phantom checks; `RULES_VERSION`), `snapshot.ts` / `snapshot-build.ts` (`loadLockerSnapshot`, pure `buildSnapshot`), `llm-input.ts` (`buildRecommendationInput`: aliased model input, `hashRecommendationInput`), `reply.ts` (reply schema), `validate.ts` (`validateRecommendation`), `finalise.ts` (`finalise`: repairs unit clashes, attaches rule warnings and catalogue names), `service.ts` (`previewRecommendation`, `createRecommendation`, `getRecommendation`, `listRecommendations`), `feedback.ts` (`submitFeedback`), `labels.ts` (UI text, presets), `eval.ts` / `eval-model.ts` (the evaluation harness; the latter calls a model). The prompt is `src/lib/ai/prompts/mic-recommendation.ts`, a `TenantPrompt` run through `generateForTenant` in `src/lib/ai/service.ts`.
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
