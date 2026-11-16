# 0025: Forced first-run setup and a customisable dashboard

**Status:** Accepted (2026-11-13).

## Context

The setup wizard (ADR 0024) was a sidebar link and a dashboard card that could be ignored, so new studios still landed on an empty dashboard. The dashboard also led with usage counts (studios, rooms, members), which matter least, and every person saw the same fixed layout.

## Decision

1. **Setup is forced once, with an escape.** `Organization.setupResolvedAt` is null until an owner or manager finishes the wizard or presses "Skip setup for now". While null, owners and managers are sent to `/setup` by the dashboard page (server redirect) and by `SetupGate` in the `(app)` layout (client redirect on every navigation, since a layout does not re-render between pages). Other roles are never redirected. The wizard leaves with a full page load so the layout re-reads the flag. The migration backfills existing organisations as resolved. `POST api/setup/resolve` is idempotent; the first call wins and is audited (`setup.resolve`).
2. **Setup leaves the sidebar.** After first run it is reached from the dashboard's Guided wizards tile and Settings → Organisation. The wizard prefills the studio name from the organisation and the time zone from the browser, and its last step suggests the other wizards (session wizard, mic quick add, layout templates).
3. **Dashboard preferences are per person and per organisation, in the database.** `DashboardPreference` (tenant model, unique on `organisationId` + `userId`) holds `{ order, hidden }` as JSON. `resolveLayout` (pure, `src/lib/dashboard/tiles.ts`) applies it to the tiles the person's role and plan can see: unknown or unavailable ids are dropped and new tiles are slotted in by their default neighbour, so a release that adds a tile does not lose it. Any member may arrange their own dashboard (`VIEW_ORGANISATION`); it never affects anyone else.
4. **Drag and drop without a library.** Native HTML5 drag events plus up/down buttons for keyboard use, in a client `DashboardGrid`; tile content is rendered on the server and passed in as nodes. Edit mode is explicit (Customise → Save / Cancel / Reset), so a stray drag never changes the saved layout.
5. **Counts go last and folded.** The studios/rooms/members tile is a `<details>` that is closed by default and last in the default order. The Getting started card lost its `localStorage` dismissal: hiding the tile is now the way to dismiss it.

## Consequences

- Layout is saved per person per organisation, so it follows them across devices (closes the "dismissal is per browser" gap).
- A person who can't use any tile still sees the usage tile, which every role can read.
- Tile ids are a closed list (`TILE_IDS`); adding a tile means adding it there, to `TILE_TITLES`, and to the page.
- HTML5 drag and drop does not work with touch; the arrow buttons are the touch and keyboard route.
