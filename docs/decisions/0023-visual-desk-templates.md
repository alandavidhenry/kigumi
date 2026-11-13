# 0023: Visual desk templates

**Status:** Accepted (2026-11-06). Supersedes [0017](0017-console-recall-sheets.md) §1 (the strip shape) and §3 (the shipped desk), and refines §4 (the snapshot) and §5 (pre-fill).

## Context

A console template was a form: sections with rows of `{ key, label, type, min, max }`. Studio owners think of a desk visually, with strips of knobs, faders and switches and a master section. They wanted to build the template by dragging components onto a blank desk. They also wanted values set by dragging, as in a soft synth, both on the template (a saved home state) and on each session's recall sheet. Saved values must survive layout edits wherever their control still exists, with a warning before any are lost.

## Decision

1. **A template is a `DeskLayout` (version 2)**, stored in the existing `strip` JSON column so no column is renamed. `{ version: 2, heightMm, strip: { widthMm, components }, master: { widthMm, components } }`. One input strip is designed and repeated for the console's channel count. A free-form master area sits to its right; a width of 0 means there is none.
   - Components are `knob`, `fader`, `switch`, `selector` (buttons, optionally multi-select for routing), `label` and `panel`, plus a legacy `text` control that the library does not offer.
   - Geometry is in millimetres on a 5 mm grid.
   - Ids follow the old key rules: unique across the whole layout, and never changed once saved. A component placed in the editor has a temporary `new_…` id until it is saved, when it gets one made from its label (`finaliseIds`). That keeps `phantom`, `pad` and `input` pre-fill working for desks people build themselves.
   - Limits: 80 controls on the strip, 120 in the master area, 60 labels and panels per area.
2. **Sections are derived, not stored.** A control belongs to the smallest panel containing its centre (`controlsOf`). Validation, pre-fill, the list view and the PDF all work from that `StripDefinition`-shaped grouping, so they barely changed.
3. **v1 is read, never written.** `readLayout` converts a v1 strip on read (`layoutFromStrip`): stacked panels, two controls a row, every key kept. Old templates and old recall snapshots open with their values, and no data migration is needed. The API still accepts a v1 strip and converts it.
4. **Values in two places.**
   - `ConsoleTemplate.defaultValues` (`{ strip, master }`) is the template's home state.
   - A new sheet stores the template's channel defaults as `RecallSheet.stripDefaults` and its master defaults as `masterValues`. Each strip starts from those defaults, with the input list's facts on top (48V, pad, Mic). The home values are the studio's own recorded settings, so this does not conflict with ADR 0017 §5's "nothing guessed".
   - "Add new inputs" and copying a recall carry the snapshot across.
5. **Layout edits reconcile values; sheets stay frozen.** `reconcileValues` (pure, shared by the editor and the server) applies these rules:
   - Values whose control still exists are kept.
   - Values whose control was removed, changed kind or lost its option are dropped.
   - Numbers outside a narrowed range are clamped.

   The editor lists what will be lost or clamped in a dialog before saving. The server re-checks values that were sent, and reconciles stored values when only the layout changes. Existing recall sheets keep their own snapshot (ADR 0017 §4 stands).

6. **The desk view saves in one request.** `PATCH /api/sessions/[id]/recall` accepts `masterValues` and `channels: [{ stripNumber, values?, label?, notes? }]`. Everything is validated against the sheet's own snapshot before anything is written. A strip with no row yet gets one, which lifts the old "desk channels with no input cannot be added" limit.
7. **Rendering: react-konva** (already chosen in [0005](0005-canvas-library.md)). Canvas beats SVG/DOM at about 1,500 controls on a 48-channel desk. To keep it fast:
   - strips outside the viewport are not rendered;
   - desk chrome, panels, labels and ghost strips sit on a layer that never listens;
   - only an invisible hit box per control takes part in hit detection;
   - each strip is memoised on its own values;
   - a value drag re-renders only the dragged control, and the value is committed on release.

   As with the layout editor (ADR 0016), the canvas has a keyboard-accessible twin: the inspector's typed value box, the component list and the recall list view.

8. **The shipped generic analogue desk is redrawn as v2.** Its 40 mm strips have the same keys as before, plus a knob for pan (unit `L/R`) and a multi-select routing selector. The master area has aux masters, monitor source and level, talkback, four buses and the main mix. Copies already made keep their v1 strip, read through the converter.

## Consequences

- Two migrations' worth of JSON shapes live side by side; `readLayout` is the only reader.
- A multi-select value is a `string[]`, so `RecallValue` gained an array type.
- Template home values are one set for every channel. Per-channel defaults are not modelled.
- The PDF prints the master area's recorded values as lines. It does not draw the desk.
