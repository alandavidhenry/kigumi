# 0024: Setup and session wizards

**Status:** Accepted (2026-11-13).

## Context

A new studio went from a one-step onboarding form to an almost empty dashboard. Planning one session meant a dialog and then four pages (detail, layout, recommendations, recall), with the studio's rooms, microphones and desk set up elsewhere first. Mic recommendations only worked once the locker had mics, and nothing said so. The product's differentiator is that every plan rests on the studio's own gear, so the path to a first useful session has to be guided and short, without weakening the rules that keep results grounded.

## Decision

1. **Wizard composition: one transaction for the core, extras after commit.** `createSessionFromWizard` runs one `POST api/sessions/wizard` and checks everything that can fail on input (room, console, Pro gate, recommendation result) before writing. The session, its layout, the items with the mic picks merged in, the input list, line channels and notes are written in one `$transaction`. The recall sheet and the saved template run after commit. Their failures do not fail the call; the result reports `recall` and `template` as `created`, `failed` or `skipped`, with warnings, and the failure is logged. Rationale: the session is the thing the user came for, and a recall sheet or template is an add-on they can make again from the session page.
2. **Picks: rules first, the model only ranks.** The rules run on the wizard's sources without a model (`rulesView`, `prepareRules`), so they are free, need no AI allowance and are shown with a "rules-based" label. The optional AI ranking reuses `POST api/recommendations` (`USE_AI`, the monthly allowance, the platform cap and the output checks of ADR 0015). The wizard then passes back that result's id, and the server refuses it when its sources do not match the ones on the page. Previews use the session's date, so units already booked in overlapping sessions are not offered.
3. **Layouts are generated from the sources, not stored per preset.** `placeSources` builds a layout from the sources and the room's size (deterministic, pure), so a preset needs no stored layout for each room. A layout is stored only when a studio saves its own: a session's layout is copied to a template `Layout`. Presets stay data (`ENSEMBLE_PRESETS`), so changing one changes nothing already saved. The generated layout is a starting point, and the normal editor (ADR 0016) takes over from there.
4. **`SessionTemplate` is a new model, not an extension of `Layout`.** A saved session template needs the wizard's sources, a preset id, a console, a channel count and a phantom mode. Those are not layout concerns. `Layout` has a check constraint (`sessionId` is null exactly when `isTemplate`) and a footprint snapshot, and adding these to it would widen the model for every layout. A template still keeps a `Layout` (`layoutId`, unique) when the studio saves its layout, so existing layout templates and the editor work unchanged. Deleting a template removes both rows in one transaction.

## Consequences

- A session can exist without its recall sheet or template. The result says so, and the recall sheet can be added later from the Recall tab.
- Generated layouts are heuristics (zones by source kind, stereo pairs from technique rules). They are tested for placement and labelling, not for acoustic correctness. The convention is in `auto-place.ts`.
- AI ranking has a ceiling of 16 sources (ADR 0015). A preset at the ceiling leaves no room to add a source before the ranking is refused; see `future-considerations.md`.
- The wizard's review step writes one layout version even when nothing was placed by the picks (`writeApplyPlanTx` always bumps the version). Harmless, but noted.
- Setup (`/setup`) reuses the existing APIs and saves each step, so it has no separate persistence and can be run again. Its progress is computed from data, not stored.
