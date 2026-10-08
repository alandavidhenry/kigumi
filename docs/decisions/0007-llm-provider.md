# 0007 — LLM provider: Anthropic API behind `src/lib/ai/`

**Status:** Accepted (2026-10-08). **Departs from Minato** (Azure AI Foundry over raw fetch).

## Context

AI features: mic summaries, comparisons, recommendation ranking and explanation, free-text Q&A, and later receipt extraction. They need reliable structured output, no invented numbers, and cost control per tenant.

## Decision

- **Anthropic API** via `@anthropic-ai/sdk`. Defaults: `claude-sonnet-5-5` for summaries, comparisons and ranking; `claude-haiku-5-5` for cheap or bulk tasks. Model ids are config (`AI_MODEL_DEFAULT`, `AI_MODEL_FAST`).
- Provider-agnostic interface `src/lib/ai/provider.ts` (`generateStructured<T>({ schema, system, input, model })`); the Anthropic implementation lives in `src/lib/ai/anthropic.ts`. Tests use a fake provider.
- **Structured outputs:** JSON-schema output, validated with **Zod**. Invalid output is retried once, then the request fails closed.
- **Prompts:** versioned modules in `src/lib/ai/prompts/` (`id`, `version`, `system`, `build(input)`). The version is part of the cache key.
- **Caching:** an `AiSummary` row keyed by `(kind, sha256(canonical input), promptVersion)`, so specs that haven't changed are not regenerated.
- **Budgets:** `AiUsage` per organisation per month; requests are refused once the tier's allowance (PLAN §6) is spent, plus simple per-org rate limiting.
- **Grounding:** numeric specs come only from the database (prompts forbid inventing numbers). Recommendations may only choose from the supplied candidate list, and anything else is dropped after validation.
- **Prompt injection:** user free text goes in clearly delimited user-content blocks and is never concatenated into system prompts. Outputs are schema-validated, never executed, and never rendered as raw HTML.

## Consequences

- A new secret, `ANTHROPIC_API_KEY`.
- Moving to Claude on Azure AI Foundry or Bedrock later only touches the provider implementation.
