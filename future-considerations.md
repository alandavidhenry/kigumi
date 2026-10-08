# Future considerations

Open gaps and deferred work. Phases are in `docs/PLAN.md`.

## Deferred from Phase 0

- **Deploy pipeline and Terraform:** `dev-deploy.yml` / `prod-deploy.yml`, `azure-deploy.yml`, and `infrastructure/` modules (App Service, Key Vault, Storage, ACS), mirroring Minato. `docker-build.yml` needs `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` secrets for the hardened `dhi.io` runner image, same as Minato.
- **Automated cross-tenant test against a real DB:** isolation is unit tested on `scopeArgs` and was verified manually against Postgres. Phase 8 should add an integration suite that runs against a test database with two organisations.
- **Account settings page:** change name, email or password, and delete account (Better Auth endpoints exist; no UI yet).
- **Organisation deletion and leaving:** owners can't yet delete an organisation or leave it from the UI.
- **Rate limiting on auth endpoints:** Better Auth's built-in rate limiter uses in-memory storage by default; configure database or secondary storage before running more than one instance.
- **`organization.create` and the cookie cache:** creating an org doesn't refresh the cached active organisation; callers must call `setActive`. Revisit if Better Auth changes this.
- **Gitleaks locally:** the pre-commit hook skips the secret scan when gitleaks isn't installed; CI always runs it.
- **Dev-only npm advisory:** `braces` via `@next/eslint-plugin-next` → `fast-glob` has no fix; CI audits production dependencies only.

## Deferred from Phase 1

- **Valuation as a real PDF:** the report is an HTML page printed via the browser (plus CSV). `@react-pdf/renderer` would give a branded, server-generated PDF.
- **Excel import/export:** CSV only for now; `exceljs` (as in Minato) can add `.xlsx`.
- **Currency:** prices are stored in minor units and shown in GBP; add an organisation currency setting.
- **Label sheets:** one QR label per item today; add multi-up label sheets (e.g. Avery) for bulk printing.
- **Orphaned blobs:** if the DB write fails after a blob upload, the blob is left behind; add a periodic sweep in Phase 8.
- **Photo thumbnails and EXIF stripping:** images are stored and served as uploaded.
- **Bulk edit and soft-delete/restore** for inventory.
- **`Feature.BULK_IMPORT`** (Studio) is unused; CSV import is currently available on every tier per `plans.ts`.

## Mic data sourcing (ADR 0008, Phase 2a spike)

- **Manufacturer outreach:** permission/data requests to the top ~10 makers (Neumann, Sennheiser, Shure and RØDE first). Permission lifts the per-maker cap (L2).
- **Surrey dataset model list:** extract the 25-mic table from the open-access JAES paper and match it against the starter list.
- **Licence enquiries (L7, deferred):** ask Odratek (Micpedia) or Icecat about a commercial licence when breadth beyond the starter list matters.
- **LLM-assisted spec drafting** (allowed by L6): build the offline admin script after manual transcription of the first batch is working.
- **IP opinion:** consider a short paid opinion before public launch.

## Deferred from Phase 2

- **Transcribe the real specs:** the 22 seeded mics carry structural facts only. Sensitivity, self-noise, max SPL, impedance, pads, filters, weight, connector and ribbon `phantomSafe` still need transcribing from official spec sheets (record the URL and SHA-256, then delete the download), then review and publish. The other ~56 mics on the starter list are not seeded yet. Fill in `data/mics/makers.json` range sizes so the per-maker cap (L2) is enforced rather than just reported.
- **ADR 0008 count:** the starter list marks 22 models with a star but the ADR says 25. Decide whether three are missing from the first batch.
- **Frequency and polar curves:** none are seeded. Run `npm run mics:derive` over the Surrey (CC BY 4.0) and DirPat impulse responses for the C414, K2 and similar overlaps, and digitise manufacturer graphs by hand. The Surrey model table is still to be extracted from the paper.
- **Importers not built:** Wikidata identity IDs, the SOYUZ CSV data and DirPat's AES69/SOFA files. I couldn't verify their formats offline, so only the WAV-based IR analysis exists. `wikidataId` is in the schema.
- **Curve editing UI:** the admin form edits specs and one source; curves and multi-source provenance go through the seed files or the admin PATCH API.
- **LLM-assisted drafting script (L6)** is still unbuilt. The review queue already handles its output: `llm_drafted` provenance needs the reviewer's attestation to publish.
- **Platform audit trail:** admin catalogue changes are not in the per-tenant `AuditLog` (see ADR 0012). Add a platform-level log, and replace the env-var admin list if the team grows.
- **Availability by session date:** the locker's "Available" means the inventory item is in service. Date-based double-booking arrives with sessions (Phase 5).
- **Mic page extras:** the AI summary and the comparison view (2–4 mics) are Phase 3. Equipment pages don't yet show their catalogue link, and bulk locker linking from existing microphone inventory is manual.
- **Existing E2E flake:** `inventory.spec.ts` ("S/N SN-42" after editing) failed once in roughly six full dev-server runs. It doesn't touch Phase 2 code, but it's worth stabilising.

## Monetisation (ADR 0011)

- **Stripe billing:** checkout, customer portal, webhooks setting `Organization.planTier`; replace "Contact us" on the plans comparison.
- **Reverse trial:** 14 days of Pro for new signups, then Free (needs a `trialEndsAt` on Organization).
- **Downgrades:** make data over the limits read-only (not deleted) when a plan drops; currently limits only block new creates.
- **Per-organisation overrides** for Facility (custom seats, AI and storage).
- **Usage metering:** AI requests (Phase 3), and a usage display for inventory count and storage against `PLAN_LIMITS`.
- **Launch options:** capped founders' deal, AI credit packs, price lock for early subscribers. No general lifetime licence.
- **Validate prices** with studio-owner interviews before launch.

## Later phases (summary)

Equipment inventory (P1), mic catalogue + data-sourcing spike (P2), AI layer (P3), recommendations (P4), layouts and sessions (P5), recall sheets (P6), maintenance and warranty (P7), hardening (P8). See `docs/PLAN.md`.
