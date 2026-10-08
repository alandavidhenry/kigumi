# Kigumi — Build Plan

Recording-studio session planning SaaS. This is the refined version of the original brief. Decisions are recorded in `docs/decisions/`. The repo mirrors the conventions of `../minato`; deliberate departures are listed in §2.3.

Build phase by phase. Each phase ends with `npm run checks`, `npm run build` and (where relevant) `npm run test:e2e` passing, then a short summary and a stop for approval.

---

## 1. Product summary

A multi-tenant SaaS for planning the **technical side of recording studio sessions** (studios only, not live stages yet). Core value: a studio's **own** equipment and microphone inventory, plus an AI assistant that recommends microphones **from what the studio actually owns**. Also covers room layouts, session input lists, desk recall sheets, and maintenance and warranty tracking.

Later it grows into full studio management (booking, CRM, invoicing, payments).

**Target users:** home/project studio owners, commercial studio managers, freelance and assistant engineers, audio education departments.

**Key differentiator to protect in every design decision:** recommendations and plans are grounded in the studio's real inventory and real spec data, not generic advice.

---

## 2. Architecture

### 2.1 Stack (mirrors Minato unless noted)

| Concern | Choice | ADR |
| --- | --- | --- |
| Framework | Next.js 16 App Router, React 19, TypeScript strict, `src/proxy.ts` | — |
| Database / ORM | Neon PostgreSQL + Prisma 7 (`@prisma/adapter-pg`), client in `src/generated/prisma` | [0001](decisions/0001-database-and-orm.md) |
| Auth | Better Auth + `organization` plugin, Prisma adapter, cookie cache | [0002](decisions/0002-auth.md) |
| Tenancy | `organisationId` on every tenant row; enforced by `tenantDb()` in `src/lib/tenant.ts` | [0003](decisions/0003-tenancy-enforcement.md) |
| File storage | Azure Blob Storage (Azurite locally), SAS URLs, MIME sniffing, size caps | [0004](decisions/0004-file-storage.md) |
| 2D canvas | react-konva | [0005](decisions/0005-canvas-library.md) |
| Charts | Recharts (log-frequency response) + custom SVG polar plots (d3-scale / d3-shape) | [0006](decisions/0006-chart-library.md) |
| LLM | Anthropic API (`@anthropic-ai/sdk`) behind `src/lib/ai/` | [0007](decisions/0007-llm-provider.md) |
| Mic data | Research spike in Phase 2 | [0008](decisions/0008-mic-data-sourcing.md) |
| Background jobs | GitHub Actions cron → `/api/cron/*` protected by `CRON_SECRET` | [0009](decisions/0009-background-jobs.md) |
| Audit log | Postgres `AuditLog` table | [0010](decisions/0010-audit-log.md) |
| Email | Azure Communication Services (`src/lib/email.ts`) | — |
| UI | Tailwind v4 semantic tokens, Radix primitives (shadcn new-york), lucide, cmdk | — |
| Tests | Vitest (unit + integration), Playwright (E2E) | — |
| Hosting | Docker → GHCR → Azure App Service. Terraform and deploy workflows deferred to a later phase | — |

### 2.2 Cross-cutting rules
- **Tenancy:** Organisation → Studio(s) → Rooms. Users belong to organisations through `Member` with role Owner / Manager / Engineer / Viewer. All tenant data access goes through `tenantDb(ctx)`; routes and components never query tenant models with the raw client.
- **Authorisation:** `requirePermission(ctx, Permission.X)` using the role → permission matrix in `src/types/rbac.ts`.
- **Plan limits:** `src/lib/plans.ts` (see §6). Checked on create.
- **Audit:** every inventory/session/organisation mutation writes an `AuditLog` row via `src/lib/audit.ts`.
- **LLM:** structured outputs validated with Zod; prompt templates versioned in code; cache by input hash; per-tenant monthly token budgets; user text is treated as untrusted (prompt-injection handling).
- **Accessibility & responsive:** usable on a tablet at the console.

### 2.3 Departures from Minato
1. Better Auth instead of NextAuth v4 (orgs, invites, verification built in).
2. Anthropic SDK instead of Azure AI Foundry over raw fetch.
3. `docs/decisions/` ADR folder instead of a single root `adr.md`.
4. Audit log in Postgres instead of Azure Table Storage.
5. Gitleaks secret scanning added (pre-commit if installed locally; always in CI).
6. `typescript.ignoreBuildErrors` is not set, so the build fails on type errors.
7. Pre-commit runs `npm run checks` once. `checks` uses `format:check` (Minato's runs `format`, which writes files, and then runs tests twice).
8. `organisationId` is non-null and enforced centrally (Minato's `tenantId` is nullable and checked ad hoc).

---

## 3. Data model

Shapes below are the target. Each phase adds only the models it needs. Tenant-owned models carry `organisationId String` (non-null, indexed). IDs are `cuid()`. Lengths are millimetres, angles are degrees and times are UTC.

### Phase 0 (foundations)
- **Better Auth core:** `User`, `Session` (`activeOrganizationId`), `Account`, `Verification`
- **Better Auth organization plugin:** `Organization` (+ `planTier`), `Member` (`role`: owner / manager / engineer / viewer), `Invitation`
- `Studio` — organisationId, name, address?, timezone, notes
- `Room` — organisationId, studioId, name, widthMm, lengthMm, heightMm?, notes
- `AuditLog` — organisationId, actorUserId, action, entityType, entityId, summary, metadata (JSON), createdAt

### Later phases
- `EquipmentItem` (P1) — category, make, model, serial, quantity (for cables and accessories), roomId?, status (in_service / repair / retired / on_loan), purchaseDate, purchasePrice, supplier, tags[], customFields (JSON), photos via `Attachment`
- `Attachment` (P1/P7) — organisationId, entityType, entityId, blobPath, fileName, mimeType, sizeBytes, kind (photo / receipt / invoice / manual / other)
- `MicrophoneModel` (P2, **global**, no organisationId) — manufacturer, model, transducerType (dynamic / ldc / sdc / ribbon / boundary / other), polarPatterns[], freqRangeHz (min/max), sensitivityMvPa, selfNoiseDbA, maxSplDb, impedanceOhm, powering (none / phantom / battery / psu), phantomSafe (ribbon warning), pads[], filters[], weightG, dimensions, connector, discontinued, statedApplications[], specSheetUrl, status (draft / in_review / published)
- `MicFrequencyResponse` (P2) — micModelId, pattern, points JSON `[hz, db][]`, measured boolean, provenanceId
- `MicPolarData` (P2) — micModelId, pattern, frequencyHz, points JSON `[angleDeg, db][]`, measured boolean, provenanceId
- `Provenance` (P2) — sourceUrl, documentTitle, retrievedAt, licenceNotes, confidence; linked per field via `MicFieldProvenance(micModelId, field, provenanceId)`
- `MicrophoneUnit` (P2) — organisationId, micModelId, equipmentItemId, serial, condition, matchedPairGroup?, notes
- `AiSummary` (P3) — kind (mic / comparison), subjectKey, inputHash, promptVersion, model, content JSON, createdAt; unique (kind, inputHash, promptVersion)
- `AiUsage` (P3) — organisationId, month, inputTokens, outputTokens, requests
- `RecommendationRequest` / `RecommendationResult` / `RecommendationFeedback` (P4) — full request context (sources, intent, room, candidate list, rules output), result JSON, promptVersion, model; feedback (accepted / swapped(toUnitId) / rejected, rating, comment)
- `Layout` / `LayoutItem` (P5) — roomId, scaleMmPerPx, grid, isTemplate, name; items: type, x, y, z, rotationDeg, widthMm, depthMm, heightMm, label, equipmentItemId?, micUnitId?, showPattern
- `Session` / `InputChannel` (P5) — date, start/end, roomId, layoutId, client (free text); channels: number, source, micUnitId, stand, preampInput, phantom, pad, notes, layoutItemId?
- `Console` / `ConsoleTemplate` / `RecallSheet` / `RecallChannel` / `OutboardRecall` (P6) — channel-strip definitions as JSON schemas; recall values as JSON per channel
- `MaintenancePlan` / `MaintenanceTask` / `MaintenanceLog` / `PatTest` (P7) — interval by time and/or usage hours; PAT test date, result, next due
- `Warranty` (P7) — equipmentItemId, start, end, provider, terms
- `Notification` (P7) — organisationId, userId, kind, title, link, readAt

---

## 4. MVP feature modules

### 4.1 Organisations, studios and rooms (Phase 0)
- Sign up (email + password, email verification), create organisation and studio during onboarding, invite users with roles, switch organisation.
- Rooms with dimensions (for layout scale) and notes.

### 4.2 Equipment inventory (Phase 1)
- CRUD with categories (mics, preamps, interfaces, consoles, outboard, monitors, headphones, instruments, amps, stands, cables, DI boxes, accessories).
- Photos, tags, custom fields, location, status, search/filter.
- **CSV import/export** (exceljs, as in Minato).
- **QR/asset labels** (qrcode.react): printable labels linking to the item page.
- **Insurance/valuation report** (PDF via @react-pdf/renderer, plus CSV).
- Cables and accessories can be tracked as a quantity rather than one row per item.

### 4.3 Microphone catalogue and mic locker (Phase 2)
**Data sourcing: research spike first, then ADR 0008, before building ingestion.**
1. Look for existing **public microphone datasets or APIs** with a clear licence. Prefer these.
2. Otherwise prefer **manufacturer spec-sheet PDFs** over scraping marketing pages. Consider asking manufacturers for data or permission later.
3. Any scraping must respect `robots.txt` and site terms, rate limit, identify its user agent, and cache. UK/EU **database right** applies on top of copyright, so bulk extraction of a manufacturer's whole database is riskier than recording individual factual specs. **Anything legally unclear is escalated, not decided.**
4. **Never rehost manufacturer images, graphs or PDFs.** Store factual values, render our own graphs and link to the official spec sheet.
5. Frequency response and polar data: store digitised numeric points where available. Where only the pattern type is known, render an **idealised** polar plot from the first-order formula `r(θ) = A + (1 − A)·cos θ` (omni A=1, sub-cardioid A≈0.7, cardioid A=0.5, supercardioid A≈0.37, hypercardioid A=0.25, figure-8 A=0) and **label it as idealised, not measured**.
6. Every value keeps provenance. An **admin review queue** (platform-admin role) checks ingested data before it is published. Manual entry and edits are supported.
7. Ingestion runs as scripts/jobs, never on user requests. Seed a starter set of about 75 common studio mics (list proposed in the spike for approval) before attempting breadth.

**Mic detail page:** spec table; frequency response chart (log scale, 20 Hz–20 kHz); polar plot switchable by frequency and pattern; spec-sheet link; provenance; an **AI summary** clearly labelled as AI-generated (the prompt forbids inventing numbers, which come only from the database; cached by input hash; regenerated when specs or prompt version change); and an "In your locker" section.

**Comparison:** 2–4 mics; side-by-side specs with differences highlighted; overlaid frequency response; polar plots side by side; AI "which to use when" summary.

**Mic locker:** the studio's `MicrophoneUnit`s, matched pairs, condition, and availability on a given session date.

### 4.4 AI microphone recommendations (Phase 4)
- **Inputs:** a session's (or ad-hoc) source list, optional free-text intent, room, available channels/preamps.
- **Pipeline:**
  1. **Deterministic rules first** (unit tested): mics owned and available on the date; quantity limits; SPL suitability; phantom requirements and **ribbon + phantom warnings**; channel/preamp count; matched pairs for stereo techniques.
  2. Candidate scoring from structured data (stated applications, type, pattern).
  3. **The LLM ranks and explains** via structured output: per source, a primary pick, alternatives, placement (position, distance, angle) and reasoning. It may draw on general engineering knowledge but **may only choose from the candidate list**.
  4. Optional, clearly separated "If you were buying" suggestions.
- Output is validated against the candidate list and anything not owned is dropped.
- One click **applies** a recommendation to a session's input list and layout (once Phase 5 lands).
- **Feedback** on every recommendation, stored with the full request context.
- **Evaluation set:** versioned golden scenarios, run in CI against the rules layer and manually against the LLM layer when prompts change.
- Free-text Q&A ("Which of my mics would suit a breathy female vocal?") uses the same pipeline.

### 4.5 Studio layouts, 2D top-down (Phase 5)
Room drawn to scale with grid and snapping; drag in instruments, amps, mics (linked to locker units), stands, gobos, booths, monitors and furniture; rotate, resize and label. Mics show a direction arrow and an optional pickup-pattern overlay. Height (z) is editable now so 3D can follow. Layouts can be saved as templates. Export to PNG/PDF.

### 4.6 Sessions and input lists (Phase 5)
A session links a date, room, layout, input list, recall sheet and notes. The input list **builds itself from layout mic placements** and stays in sync. Warnings for phantom on ribbons, a unit used twice, more inputs than channels, and double-booked mics. Printable PDF session sheet plus a **read-only share link**. DAW track-name export (CSV/text).

### 4.7 Mixing desk tracking / recall sheet (Phase 6)
Console definitions with channel-strip templates (generic analogue desk shipped, user-defined supported). A recall sheet per session, pre-filled from the input list. Outboard recall entries and desk photos. Duplicate a previous recall. Print/PDF.

### 4.8 Maintenance schedules and reminders (Phase 7)
Plans per item or category by time and/or usage hours; **UK PAT testing** tracking; due/overdue task list; completion log with notes, cost and attachments; in-app and email reminders with configurable lead time.

### 4.9 Warranty and receipts (Phase 7)
Purchase info, warranty dates/provider/terms, attachments, expiry reminders, and warranty status on the item page. Later: LLM receipt extraction with user confirmation.

### 4.10 Cross-cutting
Dashboard (upcoming sessions, overdue maintenance, expiring warranties); global search (command palette); audit log; plan limits.

---

## 5. Future features (not MVP; keep the design open for them)
3D layouts; booking calendar with conflict detection; CRM; quotes/invoicing/payments (Stripe) and client portal; SaaS billing; hire/loan check-in/out with QR scanning; patchbay mapping; trained recommendation model from feedback; community mic notes and ratings; public studio profile; room acoustics helpers; native DAW session templates; live stage plots and riders; mobile/offline; multi-studio reporting.

---

## 6. Pricing tiers (plan limits only, no billing yet)

| Tier | Studios | Rooms | Seats | AI requests / month |
| --- | --- | --- | --- | --- |
| Free | 1 | 1 | 2 | 50 |
| Pro | 1 | 5 | 5 | 1,000 |
| Studio | 3 | unlimited | 15 | 5,000 |
| Education | custom | custom | custom | custom |

Limits live in `src/lib/plans.ts`; `Organization.planTier` defaults to `free`.

---

## 7. Delivery phases

- **Phase 0 — Foundations:** scaffold mirroring Minato, CLAUDE.md, ADRs, CI, Better Auth with organisations, studios and rooms, tenancy enforcement, audit log, plan limits, app shell and navigation.
- **Phase 1 — Equipment inventory:** CRUD, photos, CSV import/export, QR labels, valuation report, search.
- **Phase 2 — Mic catalogue:** data-sourcing spike + ADR 0008, schema, starter seed, admin review queue, mic detail page with charts (measured or idealised), mic locker.
- **Phase 3 — AI layer:** AI service, mic summaries, comparison, caching, budgets/rate limits.
- **Phase 4 — Recommendations:** rules engine (tests first), LLM ranking with validated structured output, feedback capture, evaluation set.
- **Phase 5 — Layouts and sessions:** 2D layout editor, templates, sessions, auto input list, warnings, PDF/share link, apply recommendation.
- **Phase 6 — Recall sheets:** console templates, per-session recall sheet, outboard recall.
- **Phase 7 — Maintenance and warranty:** schedules, PAT testing, reminders, attachments, notifications, dashboard.
- **Phase 8 — Hardening:** accessibility, performance, security review (tenant-isolation authz tests, upload handling, prompt injection), observability, backups, Terraform + deploy workflows.

---

## 8. Open questions — answers

1. **Stack:** mirror Minato, with the departures in §2.3.
2. **Hosting:** same as Minato (Azure App Service, Neon, Blob, ACS). Terraform deferred.
3. **Auth:** Better Auth + organization plugin.
4. **LLM:** Anthropic API; `claude-sonnet-5-5` by default, `claude-haiku-5-5` for cheap tasks; budgets by tier (§6).
5. **Starter mic list:** proposed during the Phase 2 spike.
6. **Pricing tiers:** §6 (proposed; adjust any time).
7. **Name:** Kigumi.
