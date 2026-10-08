# 0005 — 2D canvas: react-konva

**Status:** Accepted (2026-10-08)

## Context

The layout editor (Phase 5) needs a to-scale room, grid and snapping, draggable, rotatable and resizable items, mic direction arrows, pickup-pattern overlays and PNG export, and it must work with touch on a tablet.

## Decision

- **react-konva** (Konva): a declarative React scene graph, a built-in `Transformer` for rotate and resize, hit detection, touch events, `stage.toDataURL()` for PNG export, and good performance for hundreds of nodes. PDF export embeds the PNG via `@react-pdf/renderer`.
- Considered: **Fabric.js** (imperative, awkward with React state), **tldraw** (whiteboard UX, licence terms), plain **SVG** (simple, but drag and transform would be hand-built), and **React Flow** (node graphs, not spatial floor plans).
- Items store `x`, `y`, `z` (height), `rotationDeg`, `widthMm`, `depthMm` and `heightMm` in real-world millimetres, independent of screen scale, so a future 3D view (react-three-fiber) can read the same rows without a migration.

## Consequences

- Konva needs `window`, so the editor is a client component loaded with `dynamic(..., { ssr: false })`.
- Editor logic (snapping, coordinate transforms, pattern geometry) lives in pure functions in `src/lib/layout/` for unit testing.
