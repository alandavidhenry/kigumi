# 0014 — AI spend guards and a local provider for development

**Status:** Accepted (2026-10-18). Extends [0013](0013-ai-service-layer.md).

## Context

ADR 0013 limits AI use per organisation (monthly allowance from the plan, plus an in-memory burst limit). Nothing limited the platform as a whole, and the seeded demo organisation is on the Studio plan, so a developer testing against a real key could spend 2,500 requests a month before any limit applied. The burst limit also resets whenever the server restarts. Testing the pipeline should also be possible without paying at all.

## Decision

**1. A platform-wide daily request cap.** `AiPlatformUsage` (global, one row per UTC day) counts every paid model call from every organisation. `generateCached` reserves from it after the organisation's allowance and before calling the model, and hands it back if the user got nothing. Over the cap, generating returns 503 `AI_UNAVAILABLE` ("AI is paused for today") and cached output keeps working. The cap is `AI_DAILY_REQUEST_CAP`; the default is **100 outside production and 1000 in production**, so a fresh checkout cannot run up a large bill. `0` blocks all paid calls. The count lives in Postgres, so restarting the server does not reset it.

**2. A kill switch.** `AI_ENABLED=false` makes every provider unavailable. Cached summaries still display.

**3. Only billed providers count against the cap.** `AiProvider.costsMoney` is true for Anthropic and false for the local provider.

**4. A local provider for development.** `AI_PROVIDER=local` sends the same requests to an OpenAI-compatible server on your machine (Ollama, LM Studio or llama.cpp's server), with `AI_LOCAL_BASE_URL` (default `http://localhost:11434/v1`) and a required `AI_LOCAL_MODEL`. It asks for JSON-schema output, accepts a code-fenced reply, and caps output tokens. The whole pipeline still runs (cache, allowance, validation, retry), so what you test is what runs in production. **It is refused when `NODE_ENV=production`**, because its output is written to the cache shared by every organisation and a small local model's text must never reach real users. Stored rows carry `local:<model>` as their model.

**5. Request size is bounded.** Replies are capped at 6,000 output tokens (Anthropic) or 2,000 (local) and run at low effort, with at most one retry per request.

## Consequences

- Hitting the daily cap in a busy production day pauses AI for everyone until the next UTC day. Raise `AI_DAILY_REQUEST_CAP`; it is a ceiling, not a target.
- Local models are much weaker than Claude, so the number-grounding check will reject more of their replies and some requests will fail after the retry. That is the check working, not a bug. Use a local model to exercise the plumbing and UI, and a real key to judge quality.
- Local output left in a development database's cache will be served (labelled with its model) until the specs or prompt version change. Clear `AiSummary` rows with a `local:` model if you want to see Claude's version.
- Cloud providers other than Anthropic's own API (such as Claude on Microsoft Foundry) fit the same interface; adding one is a new provider class plus a branch in `src/lib/ai/registry.ts`.
