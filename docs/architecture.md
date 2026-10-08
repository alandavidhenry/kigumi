# Architecture reference

Auth, tenancy, app structure and UI patterns. Decisions and their reasons are in `docs/decisions/`.

## Authentication (ADR 0002)

Better Auth (`src/lib/auth.ts`) with the Prisma adapter, email + password, **required email verification**, password reset, and the **organization plugin**. Hook bodies live in `src/lib/auth-hooks.ts` so they are unit-testable:

- `withDefaultActiveOrganisation`: a `session.create.before` hook that puts a returning user into their first organisation.
- `beforeCreateInvitation`: rejects unknown roles, and rejects invites once members plus live pending invitations reach the plan's seats (`countUsedSeats`, `src/lib/seats.ts`). `membershipLimit` enforces seats again on accept.
- `after*` hooks write audit rows for organisation create/update, invitation create/cancel, member join, role change and remove.

Better Auth's access control (`src/lib/auth-permissions.ts`) guards its own org endpoints: owner = ownerAc, manager = adminAc, engineer/viewer = memberAc. Better Auth itself stops non-owners granting or editing the owner role. The client (`src/lib/auth-client.ts`) is used directly by UI for sign-in/up, password reset, organisation create/setActive/update, invite, role change, remove, and accepting invitations.

Auth endpoints are rate-limited in production (Better Auth defaults, e.g. 3 sign-ins per 10 s per IP). `AUTH_RATE_LIMIT=off` disables it and is set only in the E2E workflow, because parallel workers all sign in from 127.0.0.1.

Session cookie cache is enabled (5 min) so most requests don't touch Postgres. Note: `organization.create` does not refresh the cached active organisation, so callers must follow it with `organization.setActive` (onboarding does).

Emails (`src/lib/email.ts`) go through ACS. Without ACS configured, development logs them with `console.warn` (follow verification links from the dev server log) and production throws. User-supplied strings are HTML-escaped.

## Tenancy and authorisation (ADR 0003)

- `getTenantContext()` (`src/lib/tenant-context.ts`, cached per request): session → active organisation → membership. Throws `UNAUTHORIZED` (401) or `NO_ACTIVE_ORGANISATION` (403).
- `tenantDb(ctx)` (`src/lib/tenant-db.ts`): a Prisma `$extends` query extension that runs every operation through `scopeArgs` (`src/lib/tenant-scope.ts`). That merges `organisationId` into `where`, sets it on create, and throws `CROSS_TENANT` (404) when a query names another organisation or uses a relation-style `organisation` connect.
- `requirePermission(ctx, Permission.X)`: role → permission matrix in `src/types/rbac.ts`. Owner has everything; Manager manages studios and members and sees the audit log; Engineer and Viewer are read-only in Phase 0 (Engineer gains session permissions later).
- `requireFeature(ctx, Feature.X)`: plan entitlements from `src/lib/plans.ts` (ADR 0011). Throws `FEATURE_NOT_IN_PLAN` (403), naming the cheapest plan that includes the feature. Lib functions call it next to `requirePermission` (e.g. `listAuditLog` needs owner/manager **and** Studio+).
- Errors are typed (`src/lib/errors.ts`) and mapped to JSON by `toErrorResponse` (`src/lib/api.ts`). Zod errors become 400 with field paths.
- Better Auth's own tables (Member, Invitation) are read in `src/lib/members.ts` with an explicit `organizationId` filter, since they aren't `tenantDb` models.

## App structure

```
src/proxy.ts                # optimistic session-cookie redirect for app routes
src/app/
  page.tsx                  # landing (signed-in users → /dashboard)
  auth/                     # sign-in, sign-up, forgot/reset password, accept-invite/[invitationId]
  onboarding/               # create organisation (+ optional first studio); ?new=1 for another org
  (app)/layout.tsx          # resolves TenantContext server-side → TenantProvider + AppShell;
                            #   UNAUTHORIZED → /auth/sign-in, NO_ACTIVE_ORGANISATION → /onboarding
  (app)/dashboard           # usage vs plan, recent activity
  (app)/studios             # studio list; [studioId] detail with room CRUD
  (app)/inventory           # equipment list (URL filters), [equipmentId] detail (photos, QR label), valuation report
  (app)/mics                # catalogue list (URL filters); [micSlug] detail: specs with per-field source, FR chart, polar plot, locker, sources
  (app)/locker              # mic locker: matched groups, condition, availability, add/edit/remove
  (app)/admin/mics          # platform admins only: review queue; [micId] review + edit + status actions
  (app)/settings/members    # members, invitations, role changes
  (app)/settings/organisation  # rename, plan + usage
  (app)/activity            # audit log (owner/manager)
  api/auth/[...all]         # Better Auth handler
  api/studios, api/studios/[studioId], api/studios/[studioId]/rooms, api/rooms/[roomId]
  api/equipment, api/equipment/[equipmentId], .../photos, /export, /import, /valuation, api/attachments/[attachmentId]
  api/mics, api/mics/[micId]          # published catalogue
  api/locker, api/locker/[unitId]    # tenant mic locker
  api/admin/mics, .../[micId], .../[micId]/status  # platform admins (404 for everyone else)
  api/audit-log, api/health, api/health/deep
src/lib/                    # all domain logic (tested); the only place that touches Prisma
src/components/             # shell, providers, ui/ (Radix primitives copied from Minato), studios/, inventory/, auth/
```

Server components read data by calling lib functions directly with the tenant context. Client components mutate through the API routes (`apiFetch`, `src/lib/client-api.ts`) or the Better Auth client, then `router.refresh()`.

## UI patterns (mirrors Minato)

- **Design tokens:** `src/app/globals.css`, Tailwind v4 `@theme` over OKLCH semantic tokens, dark by default (anti-FOUC script in `src/app/layout.tsx`). Same token names as Minato, with a warm timber brand (hue 65) in place of Minato's green. Success stays green (155) and warning moves to hue 95 so neither reads as the brand.
- **Shell:** `src/components/app-shell.tsx`: hover/expanded/collapsed sidebar (`sidebar-control.tsx`, persisted in `localStorage`) plus a 48px top bar (breadcrumbs, command palette, theme toggle, user menu with organisation switcher). A drawer below `md`.
- **Navigation model:** `src/lib/navigation.ts` (`buildNavGroups(can)`), rendered by `app-sidebar.tsx` and reused by `command-palette.tsx` (⌘K/Ctrl+K, which also lists studios).
- **Client permissions:** `useTenant().can(Permission.X)` from `TenantProvider`. This is for affordances only; the server re-checks.
- **Upgrade prompts:** `UpgradeNotice` (`src/components/upgrade-notice.tsx`) wherever a limit or paid feature stops the user, linking to the plan comparison (`PlanComparison` on `/settings/organisation#plans`, generated from `plans.ts`). `upgradeTierFor(tier, resource, count)` names the cheapest plan that lifts a limit. Paid pages stay in the nav and render the prompt instead of the content.
- **Destructive actions:** `ConfirmDeleteButton` (an in-app dialog, never `window.confirm`).
- **Inventory:** viewers read, engineers and above manage (`VIEW_INVENTORY` / `MANAGE_INVENTORY`). Filters are URL search params (`InventoryFilters`), so views are shareable and the CSV export reuses them. Photos upload as multipart to `/api/equipment/[id]/photos` and are served through `/api/attachments/[id]` (authenticated, `nosniff`), never by public blob URL. The asset label is a `qrcode.react` QR linking to the item page; printing uses the `.print-area` rule in `globals.css`. The valuation report is a Pro feature: the page shows an upgrade prompt and the API returns 403 on lower tiers; "PDF" is the browser's print-to-PDF of that page.
- **Mic catalogue (ADR 0008, 0006, 0012):** the catalogue is global and read-only for tenants (`VIEW_MIC_CATALOGUE`, every role); the locker is `VIEW_INVENTORY` to read and `MANAGE_MIC_LOCKER` (engineer and up) to change, and is free on every plan. Platform admins come from `PLATFORM_ADMIN_EMAILS`, not an org role; the sidebar shows them a "Platform" group and `useTenant().isPlatformAdmin` carries the flag (affordance only, the routes re-check). Charts: `FrequencyResponseChart` (Recharts, log axis 20 Hz to 20 kHz) and `PolarPlot` (d3-scale + d3-shape). `PolarPlot` requires a `method` per series and always prints it, so an idealised pattern can't appear unlabelled ("Idealised — not measured", dashed line, formula note). Missing data shows an explicit "Not yet recorded" or "No frequency-response data yet", never a placeholder number. Ribbons whose `phantomSafe` isn't `true` show a phantom-power warning.
- **Units:** forms collect metres; storage is millimetres (`metresToMm`, `formatDimensions` in `src/lib/validation.ts`).
- Tablet-friendly: 36px+ touch rows on small screens, dialogs and lists that work at 768px.
