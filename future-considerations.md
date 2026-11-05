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
- **Usage metering:** AI requests are metered and shown on the organisation page (Phase 3); still to do is a usage display for inventory count and storage against `PLAN_LIMITS`.
- **Launch options:** capped founders' deal, AI credit packs, price lock for early subscribers. No general lifetime licence.
- **Validate prices** with studio-owner interviews before launch.

## Deferred from Phase 3

- **Burst limit across instances:** the per-organisation AI rate limit (`src/lib/ai/rate-limit.ts`) is in memory. Move it to Postgres or a shared store before running more than one instance. The monthly allowance already lives in Postgres.
- **Local model not exercised:** the local provider is unit tested against a mocked HTTP server only. Try it once with Ollama (`ollama pull qwen2.5:7b`) and confirm the server honours `response_format` JSON-schema output; if a server ignores it, replies will rely on the prompt alone.
- **Real-model check:** nothing here has been run against the live Anthropic API (the tests use a fake provider). Before relying on it, generate a summary and a comparison with a real key and a published mic that has most specs filled in, and watch for the grounding check rejecting good text. Loosen `src/lib/ai/grounding.ts` if it does. Also confirm the structured-output schema (array limits) is accepted by the API.
- **Sparse data:** summaries are only as good as the catalogue. Most seeded mics have structural facts only (ADR 0008), so early output will be thin and say "not recorded" a lot.
- **Refusal fallback:** a provider refusal fails closed. Add Anthropic's server-side fallback if refusals ever appear.
- **Usage display:** the organisation page shows requests this month; token totals are stored in `AiUsage` but not shown. Add a cost view when billing lands.
- **Cost control:** summaries use the default model at low effort. If volume grows, move them to `AI_MODEL_FAST` (a one-line change in the prompt's `tier`, plus a version bump).
- **Regenerate / feedback for summaries:** recommendations have regenerate and feedback (Phase 4); catalogue summaries and comparisons still have neither.
- **Platform-wide AI spend:** done in ADR 0014 (daily request cap and kill switch). Still to do: a token or cost ceiling rather than a request count, an alert when the cap is hit, and a monthly platform cap.
- **Tenant-aware AI:** done in Phase 4. Recommendations use tenant-owned tables and `generateForTenant`; the global cache refuses tenant prompts (ADR 0015).

## Deferred from Phase 4

- **Judge a real model:** nothing has been scored against the live Anthropic API. One `qwen2.5:7b` pass over the scenarios exercised the plumbing and showed the validators rejecting real mistakes, but a 7B local model says nothing about quality. Run `npm run recs:eval` with a key and commit `eval/recommendations/reports/v1.md` (the committed v1 report is offline only and says so). Watch first-attempt validity, retries and fail-closed counts, and whether grounding or the not-owned-name check rejects good text; loosen `validate.ts` rather than dropping a check.
- **Review the profile tables as content:** `profiles.ts` and `techniques.ts` (source priors, SPL bands of 115 / 125 / 135 dB SPL, placement ranges, stereo geometry) are Kigumi heuristics from common practice, not checked against a reference or an engineer. Bump `PROFILES_VERSION` and re-run the evaluation after any change.
- **Sparse catalogue:** with no stated SPL, pads or applications on the seeded mics, scoring leans on the profiles and many results carry "max SPL not recorded" warnings. Transcribing real specs (Phase 2 follow-up) is what improves these.
- **Greedy allocation:** stereo sources first, then fewest options, then input order. It can leave a source empty that an optimal assignment would fill (for example when the only mic able to do a kick is one half of the best pair). Consider an assignment solver if scenarios show it matters.
- **Availability by session date:** done in Phase 5. With a `sessionId` (or a `forDate`), `runRules`' `isBooked` excludes units in overlapping non-cancelled sessions. Applying a recommendation to a session is done too.
- **"If you were buying" suggestions:** deferred. They would need their own aliases, a separate labelled section and no prices; the pipeline leaves room.
- **Channel and preamp data:** channels come from the request. Console and preamp inventory (Phase 6) could supply channel counts and preamp inputs.
- **Feedback use:** feedback is stored with full context but nothing reads it yet. A summary view for the owner, and using accepted/swapped patterns to tune the profile weights, are open.
- **Quantity rows:** a mic inventory row with quantity above one is counted as a single microphone and warned about; per-unit tracking would need one locker unit per physical mic.
- **Cost:** recommendations use the default model at low effort with up to 16 sources per request. If volume grows, consider the fast tier after re-running the evaluation.
- **Free-text classifier:** a keyword table, not a model. Unusual instruments fall back to a general profile; the user can correct the type.
- **Evaluation spend:** `recs:eval` draws on the platform's daily request cap for paid providers but has no other spend limit beyond `--max-calls`.

## Deferred from Phase 5

- **3D view:** react-three-fiber reading the stored x, y, z, rotation, pitch and size. No migration needed; the camera and item models are the work.
- **Polygon (non-rectangular) rooms**, doors and windows, and acoustic treatment items. Rooms are rectangles today; items outside the outline are flagged.
- **Multi-select, group move/rotate and alignment tools** in the editor. `groupId` is stored (stereo pairs from a recommendation) but the editor doesn't yet move a group together.
- **Real-time co-editing:** saves are whole-layout with an optimistic version, so two people editing get a 409 and reload.
- **Touch polish on a real tablet:** pinch zoom and pan are implemented but were not exercised on a physical device here. Palette is tap-to-add or drag (desktop); there is no touch drag-in.
- **Console and preamp channel data:** `channelsAvailable` is still typed by hand. Phase 6 added consoles with a channel count, but a session does not take its channel count from the console it recalls on, and there is no preamp or interface inventory model.
- **Duplicate a session fully:** a copy keeps layout and microphones but not the stand, preamp, phantom overrides or notes on each channel.
- **Share links:** one live link per session with optional expiry (API only; the UI creates non-expiring links). No view counts beyond `lastViewedAt`, and no per-link password.
- **PDF polish:** fonts are the built-in Helvetica; labels over the layout are placed text, so heavily overlapping labels can collide. A multi-page layout or A3 option is not offered.
- **Template scaling:** positions are scaled proportionally into a different room; item sizes are not, so a template from a large room can crowd a small one (the warnings flag items outside the walls).
- **"If you were buying"** suggestions remain deferred (Phase 4).
- **Free-plan E2E for the template upgrade prompt:** covered by route and service tests (403 `FEATURE_NOT_IN_PLAN`) but not by a Playwright run with a Free organisation.
- **E2E specs that fail under full-suite load:** `inventory.spec.ts` ("can add, edit, search and delete an item", the known S/N flake above) and `mics.spec.ts` ("platform admin reviews a new mic through to publication") failed in all three full parallel dev-server runs during Phase 5 and pass when run on their own. Both time out at the default 5 s right after a save plus `router.refresh()` against the dev server. They don't touch Phase 5 code, but they need stabilising (longer expect timeouts or waiting on the save response).

## Deferred from Phase 6

- **Desk channels with no input** (buses, returns, masters) cannot be added to a sheet yet; a sheet only has strips for inputs. A manual "add strip" and bus strips (a second template per console) are the next step.
- **Recall strips are not kept in step with the input list.** "Add new inputs" appends missing strips; renaming, renumbering or removing an input does not move or remove a strip, so the engineer's written values are never touched.
- **Shared console templates (Studio, PLAN §6):** templates are per organisation. Sharing or publishing templates across organisations (and a community library of desks) is not built. `Feature.SHARED_CONSOLE_TEMPLATES` exists but gates nothing.
- **Only one shipped desk.** A digital-desk starter (scene-style) and a few popular analogue consoles would help; they must be transcribed from manufacturer documentation, not guessed.
- **Recall diff:** comparing two sessions' sheets (what changed since last time) is not offered.
- **No public share link for recall,** and no browser print stylesheet: Print/PDF is the PDF.
- **Template editing UI is basic:** no reordering of sections or controls, and control keys cannot be renamed after creation (by design).
- **Pre-existing E2E failures:** `ai.spec.ts` ("mic page offers an AI summary...", no "Generate AI summary" button) and `mics.spec.ts` ("browses the catalogue...", `getByText('40 Hz')` matches two elements) fail on the Phase 5 code too (checked by stashing the Phase 6 changes). They need fixing separately.

## Deferred from Phase 7

- **Category plans don't see new items straight away.** Tasks for a category plan are created when the plan is saved or edited; an item added afterwards gets its task on the next edit of that plan. Hooking item create/update (or running a sync in the daily job) would close it.
- **No per-person reminder preferences.** Owners, managers and engineers all get every reminder, and the email digest has no opt-out or frequency setting. Lead time is configurable per plan and per warranty; PAT uses a fixed 30 days.
- **Usage hours are manual.** There is no automatic count from sessions or a meter feed, and no history of readings (only the latest value and the reading at each completion).
- **PAT is item-level only:** no appliance class, no test results values (earth continuity, insulation), no certificates as attachments, no bulk "test these 20 items", and nothing marks an item as needing PAT before its first test.
- **Cron needs wiring.** `.github/workflows/cron-reminders.yml` needs `APP_URL` and `CRON_SECRET` repository secrets and a deployed app (Phase 8). Until then run the route by hand.
- **Receipt scanning with an LLM** (`Feature.AI_RECEIPT_SCAN`, PLAN §4.9 "later") is not built; receipts are stored and viewed only.
- **No calendar view or export** of due dates (ICS), and no push or SMS reminders.
- **No cost reporting** across the service log yet (totals per item or year), although cost is recorded.
- **Dashboard** is server-rendered and static per request: the bell count updates on a full page load or refresh, not live.
- **Pre-existing E2E failure in `recall.spec.ts`** ("builds a recall sheet..."): `getByLabel('Gain for strip 1')` is a substring match and also hits HF/HMF/LMF/LF gain, so Playwright's strict mode fails. Needs `{ exact: true }`; unrelated to Phase 7 (all other specs passed in the full run).
- **Free-plan E2E for the PAT and usage-hour upgrade prompts:** covered by lib and route tests (403 `FEATURE_NOT_IN_PLAN`) but not by a Playwright run with a Free organisation.

## Later phases (summary)

Recommendations (P4, built), layouts and sessions (P5, built), recall sheets (P6, built), maintenance and warranty (P7, built), hardening (P8). See `docs/PLAN.md`.
