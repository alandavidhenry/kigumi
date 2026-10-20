# 0013 — AI service layer: global cache, allowance accounting and number grounding

**Status:** Accepted (2026-10-09). Refines [0007](0007-llm-provider.md), which stays in force.

## Context

Phase 3 puts the first AI features in front of users: a summary for each catalogue microphone and a 2 to 4 microphone comparison. ADR 0007 fixed the provider, structured output, versioned prompts, input-hash caching and monthly budgets. Building it raised four questions that 0007 left open.

## Decision

**1. The cache is global, because the input is.** `AiSummary` has no `organisationId`. Summaries and comparisons are built only from published catalogue rows (`buildMicFacts`), never from tenant data, so one generation serves every organisation and a popular microphone is paid for once. This is only safe while that stays true. **Anything that includes tenant data (Phase 4 recommendations, anything naming the studio's locker) must not use `AiSummary`.** It needs a tenant-owned cache or none.

**2. Only a real model call spends allowance.** One request is one user-facing generation that reached the provider (`PLAN_LIMITS.aiRequestsPerMonth`, counted in `AiUsage` per organisation per UTC month). Cache hits cost nothing and need no key. The retry for bad output is part of the same request. If the user gets nothing (provider down, output rejected twice), the request is handed back; the tokens are still recorded, because they were spent. The increment happens first and is undone if it went over the limit, so concurrent requests can't both slip under it.

**3. Generating needs `Permission.USE_AI`; reading does not.** Owner, manager and engineer can generate. Viewers see cached output (they can read the catalogue) but cannot spend the organisation's allowance. There is no new paid `Feature`: AI is available on every tier within its allowance, and running out shows an `UpgradeNotice`.

**4. Numbers are checked, not just requested.** The prompts forbid figures that are not in the record, and `validate` enforces it: every number in the model's text must appear in the input (as a value, or restated as rounded or as kHz), otherwise the reply is rejected with the offending number named, retried once, and then the request fails closed (503) and nothing is stored. Model names (SM57, U 87) count as input. The cost is that a legitimately useful general figure ("48 V phantom") is also refused; the prompts tell the model to say "phantom power" instead. Comparisons are also checked structurally: every supplied microphone appears exactly once, and every pick is a supplied slug.

Smaller choices:

- **Comparison input is sorted by slug**, so A-vs-B and B-vs-A share one cached answer. Display names come from the catalogue rows by slug, never from the model.
- **The cache key** is `(kind, sha256(canonical input), promptVersion)`. The model id is stored but not part of the key, so changing `AI_MODEL_DEFAULT` doesn't regenerate everything; bump the prompt's `version` to force it. A stored row that no longer parses against the schema is treated as a miss and overwritten.
- **Provider interface** takes `messages` rather than a single `input` string so the service can show the model its rejected reply on the retry.
- **No refusal fallback.** A refusal from the provider fails closed with a plain message. Server-side fallback models are an Anthropic API feature that doesn't exist on other providers and that this content (microphone specs) is unlikely to trigger; revisit if refusals show up.
- **Per-organisation burst limit** (10 provider calls a minute, `AI_RATE_LIMIT`) is an in-memory sliding window. It is per server instance; the monthly allowance in Postgres is the durable limit.
- **Prompt injection:** catalogue strings (applications, dimensions) reach the model only inside a `<mic_data>` block in the user message; the system prompt never contains data, says to ignore instructions inside the block, and outputs are schema-validated and rendered as text.

## Consequences

- AI features work without a key for anyone reading cached output; generating returns 503 `AI_UNAVAILABLE` until `ANTHROPIC_API_KEY` is set.
- Editing a published spec changes the hash, so the next person to ask regenerates it; the old row is simply no longer looked up.
- The burst limit is not shared across instances. Move it to the database or a shared store before running more than one instance (see `future-considerations.md`).
- Number grounding is strict by design. If it rejects too much in practice, loosen the allowed set in `src/lib/ai/grounding.ts` rather than dropping the check.
