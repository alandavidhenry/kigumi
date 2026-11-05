# 0021 — Phase 8 security hardening

**Status:** Accepted (2026-11-05)

## Context

The Phase 8 review (tenant isolation, uploads, prompt injection, secrets) found no critical holes but a set of gaps: unbounded request bodies, no security headers, uploaded files served inline from the app origin, share tokens stored in plain text, rate limits held in memory, Free organisations able to drain the platform-wide AI cap, and tenant isolation never tested against a real database. This records the choices made in fixing them where there was a real alternative.

## Decisions

**Request bodies are read through one bounded reader** (`src/lib/request-body.ts`): JSON 1 MB (5 MB for the catalogue admin API), CSV 2 MB, multipart 8 MB plus framing. It refuses on `Content-Length` and stops mid-stream if the header lies. Matching `/api` in the proxy also gives Next's 10 MB proxy buffer cap as a backstop.

**A static CSP, not a nonce.** A nonce would force every page to render dynamically. The static policy still forbids framing, plugins, `<base>` hijacking, off-site form posts and off-origin `connect`. `'unsafe-inline'` scripts remain for Next's hydration and the theme script. `upgrade-insecure-requests` and HSTS are sent only when the app URL is HTTPS, so local and CI runs over `http://localhost` work. Headers live in `security-headers.mjs` (tested) and are applied by `next.config.mjs`.

**Uploaded files carry their own sandbox.** `/api/attachments/[id]` sends `Content-Security-Policy: default-src 'none'; sandbox`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin` and a sanitised `Content-Disposition`. Images are inline; **PDFs download** rather than open in a tab, because a PDF viewer can run script and Chrome won't render a PDF under a CSP sandbox.

**Cross-site writes are refused in the proxy.** On POST/PUT/PATCH/DELETE to `/api`, a `Sec-Fetch-Site` other than `same-origin`/`none`, or an `Origin` that is neither the request host nor the app URL, gets a 403. Requests with neither header (cron, scripts) pass to the normal auth checks. This backs up SameSite=Lax cookies against sibling subdomains.

**Share tokens: hashed for lookup, sealed for display.** Links are looked up by SHA-256 of the token (the token is 32 random bytes, so no salt is needed). A copy sealed with AES-256-GCM under a key derived (HKDF) from `BETTER_AUTH_SECRET` lets members copy the link again, which hashing alone would prevent. A database leak alone reveals and validates nothing. Rotating the secret leaves links working but unshowable; the page then offers a new link.

**Rate limits live in Postgres.** Better Auth uses `rateLimit.storage = 'database'`. The AI burst limit moved to fixed one-minute windows in `AiRateWindow` (one atomic upsert per request; a fixed window can admit up to twice the limit across a boundary, acceptable for a burst guard when the allowance and daily cap are exact). The daily housekeeping job prunes both tables.

**Free organisations get half the platform AI cap** (`FREE_TIER_CAP_SHARE`), counted in `AiPlatformUsage.freeRequests`, so paid tenants always keep at least half. A person may own at most two Free organisations (`organizationLimit`); organisations they were invited into don't count.

**Photos are cleaned in the browser.** Re-encoding through a canvas drops EXIF (GPS, serials), applies orientation and caps the long edge at 2048 px. Server-side processing (`sharp`) was rejected for now: it is a native module and the Docker build stage (Alpine) differs from the runtime (Debian). The server still checks type, size and magic bytes; an API client uploading its own photos is the data owner.

**Uploads reserve before they write.** The per-owner and storage checks and the attachment row happen in one transaction under a per-organisation advisory lock, then the blob is uploaded, and a failed upload deletes the row. Leftover blobs from a crash are swept daily (older than 24 hours, unreferenced, at most 500 per run).

**Prompt data blocks escape `<` and `>`** (`promptJson`), so user text can't close `<user_text>` early. The recommendation prompt moved to v2. Catalogue prompts hold only admin-reviewed data and were left unchanged, to avoid discarding every cached summary.

**Tenant isolation is tested against real Postgres** (`npm run test:db`): two organisations, every tenant route called with the other organisation's ids, asserting 404 and that nothing changed on either side. A route inventory test fails when a new route doesn't resolve a tenant context and isn't on the public allowlist.

## Consequences

- PDFs no longer open in a browser tab from the app; they download.
- Share links created before this change keep working but must be replaced before they can be copied again.
- `BETTER_AUTH_SECRET` now also protects share-link display copies; rotating it is still safe.
- CI needs Postgres for `test:db` (a service container in the lint/test workflow).
