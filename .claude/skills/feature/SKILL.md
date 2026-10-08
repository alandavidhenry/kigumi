---
name: feature
description: Build a new feature in this repo using the project's TDD loop (types, tests, implementation, checks, docs). Use when the user asks to add or change a feature.
---

Follow this loop for the requested feature. Keep context small: read only the `docs/*.md` file(s) relevant to the area.

1. **Scope** — restate the feature in 2–3 lines. If it touches schema, auth, tenancy, uploads or the LLM layer, outline the plan and confirm with the user before coding.
2. **Read** — read the matching reference in `docs/` (`data-model.md`, `architecture.md`, `testing.md`), the relevant ADR in `docs/decisions/`, and the nearest existing code to copy its idiom.
3. **Types first** — define or extend interfaces/types and Zod schemas (`src/lib/validation.ts`).
4. **Tests next** — write or update Vitest tests (unit in `src/lib/__tests__`, route integration in `src/app/api/__tests__`). Run only those files: `npx vitest run <path>`.
5. **Implement** — make the tests pass. Tenant data goes through `tenantDb(ctx)`; new tenant models get a non-null `organisationId` and are added to `TENANT_MODELS` in `src/lib/tenant-scope.ts`. Mutations call `requirePermission` and `recordAudit`. Follow CLAUDE.md code style (no semicolons, single quotes, import order, no `console.log`).
6. **Gate** — run `npm run checks` once at the end, plus `npm run build` and `npm run test:e2e` when UI or auth changed. Fix failures; never skip or weaken tests.
7. **Docs** — update only what changed: the relevant `docs/*.md`, `future-considerations.md`, `README.md` if user-facing, a new `docs/decisions/` ADR only for a real architectural decision.
8. **Wrap up** — summarise changes and anything left undone. Create a branch and commit if asked; never push or merge — the user does that.
