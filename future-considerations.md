# Future considerations

Open gaps and deferred work. Phases are in `docs/PLAN.md`.

## Deferred from Phase 0

- **Deploy pipeline and Terraform:** `dev-deploy.yml` / `prod-deploy.yml`, `azure-deploy.yml`, and `infrastructure/` modules (App Service, Key Vault, Storage, ACS), mirroring Minato. `docker-build.yml` needs `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` secrets for the hardened `dhi.io` runner image, same as Minato.
- **Automated cross-tenant test against a real DB:** isolation is unit tested on `scopeArgs` and was verified manually against Postgres. Phase 8 should add an integration suite that runs against a test database with two organisations.
- **Account settings page:** change name, email or password, and delete account (Better Auth endpoints exist; no UI yet).
- **Organisation deletion and leaving:** owners can't yet delete an organisation or leave it from the UI.
- **Rate limiting on auth endpoints:** Better Auth's built-in rate limiter uses in-memory storage by default; configure database or secondary storage before running more than one instance.
- **`organization.create` and the cookie cache:** creating an org doesn't refresh the cached active organisation; callers must call `setActive`. Revisit if Better Auth changes this.
- **Gitleaks locally:** the pre-commit hook skips the secret scan when gitleaks isn't installed; CI always runs it.
- **Dev-only npm advisory:** `braces` via `@next/eslint-plugin-next` → `fast-glob` has no fix; CI audits production dependencies only.

## Later phases (summary)

Equipment inventory (P1), mic catalogue + data-sourcing spike (P2), AI layer (P3), recommendations (P4), layouts and sessions (P5), recall sheets (P6), maintenance and warranty (P7), hardening (P8). See `docs/PLAN.md`.
