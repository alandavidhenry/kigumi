# 0017: Console definitions and recall sheets

**Status:** Accepted (2026-11-05). Builds on [0016](0016-layouts-sessions-input-list.md). §1 and §3 superseded, §4 and §5 refined, by [0023](0023-visual-desk-templates.md) (visual desk templates).

## Context

Phase 6 records what a mixing desk and its outboard were set to for a session, so the session can be recalled later. Desks differ wildly, so a channel strip has to be data, not code. A recall sheet is a historical record: editing a desk definition next year must not rewrite what was written down last year. The input list already knows each channel's source, microphone, phantom, pad and preamp input, and the sheet should start from it without inventing anything.

## Decision

1. **A channel strip is JSON, validated by Zod.** `ConsoleTemplate.strip` is `{ sections: [{ label, controls: [{ key, label, type, unit?, min?, max?, options? }] }] }`. Control types are `knob` (a number with optional range and unit), `switch`, `select` and `text`. Keys are lower case `[a-z][a-z0-9_]*`, unique across the strip, and never change once a control exists (the editor only generates a key for a new control), so recorded values keep pointing at the right control. At most 12 sections and 80 controls.
2. **Models.** `ConsoleTemplate` (the strip), `Console` (name, make, model, channel count, one template; delete of a template in use is refused with 409), `RecallSheet` (one per session, unique `sessionId`), `RecallChannel` (strip number, label, mic name, `values` JSON, notes) and `OutboardRecall` (name, optional inventory link, "inserted on", `[{ label, value }]` settings). All are tenant models in `TENANT_MODELS`. Desk photos are `Attachment` rows with `entityType` `recall_sheet`.
3. **The shipped generic analogue desk is code, not a row** (`src/lib/recall/builtin.ts`): mic/line input with 48V, pad, phase and gain; high-pass filter; four-band EQ; four aux sends; pan, mute, fader and routing. Adding a console with it **copies** it into the studio's own template, which can then be edited. User-defined templates are first-class.
4. **A sheet snapshots its strip.** `RecallSheet` stores `strip`, `consoleName` and `channelCount` at creation. Editing or deleting the console or template afterwards never changes a sheet already written (`consoleId` is `SetNull`). Values are validated against the sheet's own strip on every save (`validateValues`: known key, right type, within range, a real option).
5. **Pre-fill is pure and says only what the input list says** (`prefillChannels`). Input number N becomes strip N. A strip gets its label (source), the microphone's name, `phantom` and `pad` only if the template has controls with those keys (`phantom`/`pad` switches), `input = Mic` if there is a microphone and the template has a `select` named `input` with a `Mic` option, and the preamp input as a note. Gain, EQ and everything else stay blank: nothing is guessed. An unset control means "not recorded" and is left out of the stored values and the printout, never defaulted to zero or off. Inputs numbered past the console's channel count are reported (`skipped`), not silently dropped. "Add new inputs" appends strips for inputs that have none and never changes what is written.
6. **Duplicating a previous recall copies a sheet exactly**: console snapshot, strip, labels, values, notes and outboard, with no link back to the source's input channels. Desk photos are not copied. It is refused if the target already has a sheet (409) or the source is the target.
7. **Outboard is label/value pairs**, not a schema per unit: gear is too varied, and the settings are a note to the engineer. An entry can link to an inventory item (checked to belong to the organisation) or be free text.
8. **Permissions and plan.** Reuses `VIEW_SESSIONS` and `MANAGE_SESSIONS` (consoles, templates, recall sheets, outboard, desk photos); no new permission. Everything is free on every plan, as PLAN §6 lists recall sheets in the free core. The PLAN §6 "shared console templates" (Studio) is not built: templates are per organisation, and there is nothing to share across organisations yet. The footer on the PDF follows `UNBRANDED_EXPORTS` like the session sheet.
9. **Photos reuse the attachment pipeline.** `storePhoto` (`src/lib/attachments.ts`) now holds the magic-byte check, size cap, per-owner cap and storage-plan limit for both equipment and desk photos (12 per sheet). Reading and deleting an attachment checks the permission of its owner type (inventory or sessions), after a baseline check so a caller with no access to either never learns whether an id exists. Deleting a session or a sheet removes the blobs first.
10. **Print/PDF** is a server-rendered `@react-pdf/renderer` document (`/api/sessions/[id]/recall/pdf`), one block per strip showing only recorded values. There is no public share link for recall.

## Consequences

- Five new tenant models, each route covered by a cross-organisation 404 test.
- A custom template with different control keys still works; it just gets less pre-fill.
- Changing the generic template later does not change anyone's copy or existing sheets.
- Recall channels are not linked back to the input list after creation (`inputChannelId` is kept only for the original fill); renumbering inputs later does not move strips.
- Desk channels that have no input (buses, returns) cannot be added to a sheet yet.
