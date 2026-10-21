# 0015 — Microphone recommendations: rules first, the model ranks, tenant-owned storage

**Status:** Accepted (2026-10-20). Builds on [0007](0007-llm-provider.md) and [0013](0013-ai-service-layer.md); respects [0014](0014-ai-spend-guards-and-local-provider.md).

## Context

PLAN §4.4 asks for recommendations drawn only from what a studio owns, with deterministic rules first, a model that ranks and explains from a candidate list, validated output, feedback and an evaluation set. Three facts shaped the design:

- The catalogue is sparse. The 22 seeded mics hold structural facts only (type, patterns, powering): no max SPL, no pads, no stated applications, ribbon `phantomSafe` unknown.
- A recommendation's input is the studio's own locker and requests, so ADR 0013 §1 forbids the global `AiSummary` cache.
- The grounding check (ADR 0013 §4) rejects any number the model was not given, yet a placement has to include distances and angles.

## Decision

**1. The rules layer is a complete recommendation on its own.** `runRules` is a pure function: a normalised request and a locker snapshot in, ranked candidates and a conflict-free plan out. It is free, instant and deterministic, and it is what CI evaluates. `POST /api/recommendations/preview` returns it with nothing stored and no AI. The model is an explicit second step ("Rank and explain with AI"), so Free-tier studios keep a useful product beyond their monthly requests, and every AI failure (no key, allowance spent, paused, output rejected twice) still leaves the user with an answer.

**2. Unknown is not a pass.** A missing spec never excludes a microphone and never counts as good. Where it matters it is a warning: an unrecorded max SPL on a condenser for a loud source, a ribbon whose phantom tolerance is not recorded (treated as unsafe). A stated figure below the source's band excludes the mic unless a pad covers the gap. The SPL thresholds are internal to `src/lib/recommendations/profiles.ts` and are never shown to a user or sent to the model.

**3. Source profiles supply the priors, and are labelled as heuristics.** With almost no per-mic data, scoring leans on a reviewed table per source kind (transducer affinity, preferred patterns, SPL band, air-blast, placement ranges). They are Kigumi engineering judgement, not manufacturer data, are versioned (`PROFILES_VERSION`), and must never be presented as a spec. They need a human engineer's review as content.

**4. The model chooses; it does not invent.** It is shown aliased options (`c1`, `u2`, `m1`), never database ids, slugs, serials or notes. Every reply is checked: each sent source exactly once; every option from that source's own list; no unit named that is not offered; no catalogue model the studio does not own named; ribbons never told to use phantom; no number that is not in the data. Anything wrong is fatal: one retry with the problems fed back, then fail closed (503), refund the request, store nothing, and the rules result stays on screen. "Anything not owned is dropped" is therefore enforced by rejecting the reply rather than silently editing it.

**5. Placement numbers come from supplied ranges.** The model is given, per source, a distance and angle range (and spacing and included-angle ranges for stereo techniques), and must return whole numbers inside them. Those numbers, restated in mm, cm or m, are the only figures it may add to its text. Profile hints contain no digits, so the ranges are the only placement numbers in play.

**6. Two kinds of problem: fatal and repaired.** Two sources choosing the same physical unit is not a lie, just a clash, so `finalise` repairs it by rule (stereo and tree sources first, then input order; fall back to the model's alternatives, then the rules' own pick) and records the repair, which the user sees as "Adjusted by rules". `finalise` never fails, and takes names and warnings from the catalogue and rules, never from the model's text.

**7. Recommendations are tenant data in tenant tables.** `RecommendationRequest`, `RecommendationResult` and `RecommendationFeedback` all carry `organisationId` and sit behind `tenantDb`. `generateForTenant` shares the whole guard pipeline (rate limit, allowance, platform cap, validation, retry, refund) with `generateCached` but takes a caller-supplied lookup and store, and `generateCached` and `findCachedAi` refuse a `TenantPrompt` at runtime as well as in the types. The cache key is `sha256(model input + aliases)` scoped to the organisation, so a changed locker, request or prompt version is a miss and another organisation can never hit it. Each result stores the full context: the normalised request, the rules output, the locker snapshot and the alias map, plus the finalised view, so a recommendation can be explained and replayed as it was.

**8. Feedback is one row per person per source.** `sourceKey` is `s3` or `*` for the whole thing; verdict `accepted | swapped | rejected`; a swap stores the unit ids and a model-slug snapshot (so it survives the unit being deleted) and whether it was one of the offered candidates; plus an optional rating, reasons and a comment. Comments are the user's own text and are never sent to a model. Swapping to another organisation's unit is a 404.

**9. The evaluation set is versioned data.** `eval/recommendations/` holds golden scenarios (a locker, a request, expectations), fictional fixture mics for anything that depends on a number (no invented spec is ever attached to a real product), and replays (recorded or hand-written model replies, including bad ones) that run through validation and `finalise`. CI runs the rules, invariants (no unit twice, plan inside candidates, nothing unavailable offered, order-independence) and replays with no network. `npm run recs:eval` additionally sends scenarios to a real or local model and writes `reports/v<promptVersion>.md`; CI fails if the report for the current prompt version is missing. An offline report never overwrites a live one.

## Consequences

- The model is optional for value but required for explanation: with AI off, users get the rules-based result and no prose.
- Greedy planning (stereo first, then fewest options, then input order) is deterministic and explainable but not optimal. In a tight locker it can leave a source empty that an optimal assignment would fill. Revisit if the golden set shows it matters.
- Availability is the equipment status today. Booking by session date arrives with sessions (Phase 5) through the `isBooked` hook in `runRules`.
- Strict grounding and name checks reject some good replies. Loosen the allowed set in `validate.ts` rather than dropping a check, and re-run the evaluation.
- Changing a weight, a profile or the prompt means bumping `RULES_VERSION`, `PROFILES_VERSION` or `RECOMMENDATION_PROMPT_VERSION`, re-running `npm run recs:eval` and committing the report.
- "If you were buying" suggestions are deferred. The schema leaves room (a separate section and aliases) but nothing is built.
