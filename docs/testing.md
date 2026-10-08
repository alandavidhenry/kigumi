# Testing coverage

Current coverage by area. Add to this file when you add tests.

## Unit (`src/lib/__tests__`, `src/types/__tests__`)

- **Tenancy:** `tenant-scope` covers every operation type (where-merging for reads, updates, deletes, counts and aggregates; create/createMany data; upsert), the same-org explicit filter, rejection of another org, operator filters, relation connects, moving rows between orgs, a missing organisation, and pass-through for non-tenant models. `tenant-db` checks the extension wiring and that it throws before querying. `tenant-context` covers 401 without a session, 403 without an active org or membership, context building, and unknown role/tier downgrades. `requirePermission` is covered too.
- **RBAC** (`rbac.test.ts`): the full permission matrix, `hasPermission` edge cases, `isMemberRole`, `assignableRoles`.
- **Plans** (`plans.test.ts`): tier parsing, documented Free limits, limits and features never shrink up the tiers, `canAdd` including unlimited, `upgradeTierFor`, feature inheritance, `minimumTierFor`, every feature labelled and never Free-gated, pricing sanity, formatters. `requireFeature` is in `tenant-context.test.ts`; the audit log plan gate (Free/Pro refused, Studio/Facility allowed) is in `audit.test.ts`.
- **Studios and rooms** (`studios.test.ts`): list, get (404), create (plan limit, viewer 403, validation before DB), update (404 when nothing matched, audit metadata), delete (404), room create (cross-org studio 404, org-wide room limit), room update/delete, usage.
- **Equipment** (`equipment.test.ts`): filters become the query, create (audit, viewer 403, plan limit, cross-org room 404, validation), update/delete (cross-org 404, viewer 403, photos removed). **Import/export/valuation** (`equipment-io.test.ts`): alias and price parsing, all-or-nothing row errors, plan limit, formula-safe export, totals/retired/unpriced, Pro gate. **Attachments** (`attachments.test.ts`): magic-byte sniffing, type/size/count/storage limits, cross-org 404 before storage is touched. **CSV** (`csv.test.ts`).
- **Audit** (`audit.test.ts`), **members** (`members.test.ts`), **seats and health** (`seats-and-health.test.ts`), **auth hooks** (`auth-hooks.test.ts`: default active org, seat-limit invitation rejection, unknown roles, every audit hook), **email** (`email.test.ts`: dev logging, production refusal, ACS send, HTML escaping), **validation**, **api/errors**, **client-api**, **slug**, **safe-redirect** (open-redirect rejection), **navigation**.

## Integration (`src/app/api/__tests__`)

Real route handlers plus real lib code, with the session (`getTenantContext`) and DB (`tenantDb`) mocked:

- `studios-routes.test.ts`: `/api/studios` GET/POST (401, 400 with field paths, engineer 403, PLAN_LIMIT), `/api/studios/[id]` GET/PATCH/DELETE (cross-org 404, viewer 403, 204), `/api/studios/[id]/rooms` POST (cross-org 404, 400), `/api/rooms/[id]` PATCH/DELETE (cross-org 404, engineer 403).
- `equipment-routes.test.ts`: every equipment route including photos, attachments, import, export and valuation: 401, 400, viewer 403, PLAN_LIMIT, valuation FEATURE_NOT_IN_PLAN, and cross-organisation 404 for get/patch/delete/photo upload/attachment delete.
- `misc-routes.test.ts`: health (liveness makes no dependency calls) and health/deep (200/503), audit log (manager OK, junk limit, engineer 403).

## E2E (`e2e/`, Playwright)

Runs against a migrated and seeded database. Against a production build (`npm run start`), set `AUTH_RATE_LIMIT=off` or parallel sign-ins trip the auth rate limiter. Locally it reuses `npm run dev` (or starts it); in CI it runs against a built app (`.github/workflows/playwright.yml`).

- `auth.setup.ts`: signs in the seeded owner and viewer and stores their sessions.
- `sign-in.spec.ts`: unauthenticated redirect with `callbackUrl`, wrong password, return to the requested page.
- `onboarding.spec.ts`: sign up → verify (DB) → sign in → onboarding creates the org and first studio → add a room in metres → Free-plan room limit blocks a second room.
- `studios.spec.ts`: owner views the seeded studio, adds, edits and deletes a room, and sees the activity log.
- `onboarding.spec.ts` › Free plan upgrade prompts: a Free owner sees the activity log as an upgrade prompt (and the API returns 403), invites are blocked by the one-seat limit, and the plans comparison marks Free as current.
- `inventory.spec.ts`: owner adds, searches, edits and deletes an item, sees the asset label and valuation report, exports CSV; viewer has no edit controls and the API returns 403.
- `viewer.spec.ts`: viewer has no edit controls, the API returns 403 for a direct POST, and `/activity` redirects.

Manually verified during Phase 0 against real Postgres (not automated): a second organisation's user gets 404 for every read, update, delete and create on the first organisation's studio and rooms.
