# 0026: Paper and ink design language

**Status:** Accepted (2026-11-14).

## Context

Kigumi mirrored Minato's Supabase-style UI: dark by default, hairline borders, small radii, a hover icon rail and an amber-tint primary button. It read flat. Every element had the same weight, navigation labels were hidden until hover, and the primary action barely stood out. The developer supplied two reference designs and asked for a labelled sidebar, more space around components, minimalism, curves and high contrast.

## Decision

1. **Paper and ink with one amber highlight.** A warm canvas with cards on top. The primary action is solid ink in light and solid paper in dark. Solid amber (`highlight`) marks where you are (the active nav item), the one key figure on a view and progress. Colour is OKLCH semantic tokens in `src/app/globals.css`.
2. **Bold timber amber, not the references' lime.** The brand hue (65) stays for links, focus rings and notices, and `highlight` sits beside it.
3. **Shape and depth.** Radius scale 6/10/14/20/28 px; buttons and badges are pills. Cards are borderless with a soft shadow in light and hairline-bordered in dark. Two new type steps, `text-title` and `text-display`.
4. **Labelled sidebar by default.** 240px wide with the organisation and plan shown. The Expanded, Collapsed and Hover modes are kept and still persisted in `localStorage`. The top bar is 56px and borderless.
5. **The theme follows the system.** A stored choice wins. An inline script in `src/app/layout.tsx` sets the class before first paint, and `ThemeProvider` exposes `resolvedTheme`.
6. **Rules, not just tokens.** One ink primary action and at most one highlight block per view; no boxes inside boxes; compact data rows. The rules are listed in `docs/architecture.md` (UI patterns).

## Alternatives considered

- **Switch the brand to lime green.** Rejected. It loses the timber identity and collides with the success green.
- **Near-monochrome ink only.** Rejected. It is the calmest option but has the least personality, and nothing marks the current place.
- **Keep the hover icon rail as the default.** Rejected. Hidden labels were the first complaint; the rail stays as an option.
- **Keep dark as the default.** Rejected. A system-following theme respects the person's setting, and light suits the paper look best.

## Consequences

- Kigumi's look now diverges from Minato's. The stack and conventions are still shared.
- Status colours are darker in light (L 0.5 or below) so they keep 4.5:1 as text on their own tint.
- The a11y suite's full run moved to the light palette, with a dark subset (`e2e/a11y.spec.ts`).
- New shared pieces: `Notice`, `StatTile` and the highlight button variant. Pages should use them rather than hand-rolled banners and tiles.
- PDFs keep their own print palette and are not affected.
