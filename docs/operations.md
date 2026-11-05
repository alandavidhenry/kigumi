# Operations runbook

How to watch, back up and restore Kigumi in production. Decisions behind this are in ADR [0019](decisions/0019-backups-and-restore.md) (backups), [0020](decisions/0020-observability.md) (observability) and [0021](decisions/0021-phase-8-security-hardening.md) (hardening). The pipeline and infrastructure are in ADR [0022](decisions/0022-deploy-pipeline-and-infrastructure.md); Azure Monitor alerts come from Terraform (`alert_emails`).

## Deploying

**Workflows.** `dev-deploy.yml` (push to `main`) and `prod-deploy.yml` (release published) run lint and tests, E2E, build and push the image to GHCR, then `azure-deploy.yml` migrates, switches the image and smoke tests. `TF-CICD.yml` plans on any change under `infrastructure/` and applies on `main`; `TF-CD-PROD.yml` applies Production on `v*` tags.

**First-time setup (once per environment).**

1. Create the state storage: `terraform apply` in `infrastructure/bootstrap/<Env>` (variables: `subscription_id`, `cicd_sp_object_id`).
2. Reuse or create the CI service principal with OIDC federated credentials for the repository and each GitHub environment (`Development`, `Production`). Give it `Contributor` and `User Access Administrator` on the subscription.
3. Create the Neon project and branch; copy its connection string.
4. GitHub environment secrets (per environment): `ARM_CLIENT_ID`, `ARM_TENANT_ID`, `ARM_SUBSCRIPTION_ID`, `DATABASE_URL`, `GHCR_PAT` (`read:packages`), optional `ANTHROPIC_API_KEY`, and `CRON_SECRET` (after step 6). Repository secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` (hardened base images).
5. Edit `infrastructure/env/<Env>/terraform.tfvars` (`platform_admin_emails`, `kv_deployer_object_id`; `app_url` once a custom domain exists), then run the Terraform workflow (or `terraform apply` locally with `secrets.auto.tfvars`, copied from the `.example`).
6. Read the outputs: `terraform output -raw cron_secret` goes into the `CRON_SECRET` environment secret. Set the environment variables `AZURE_APP_NAME` and `AZURE_RESOURCE_GROUP` from `app_service_name` and `resource_group_name`.
7. Production only: put `terraform output -raw backup_storage_connection_string` in `BACKUP_STORAGE_CONNECTION_STRING`, create the read-only role below for `BACKUP_DATABASE_URL`, and set the repository secrets `APP_URL` and `CRON_SECRET` (the cron workflows use these) to the Production values.
8. Run `dev-deploy.yml` (or publish a release), then check `/api/health` and the smoke test.

**Rollback.** Re-run the deploy for the previous good commit's image (`az webapp config container set � ghcr.io/<repo>:<sha>`). Schema changes are expand-then-contract, so the previous image still works against the migrated database.

## Scheduled jobs

All run from GitHub Actions and need repository secrets once the app is deployed. Each fails loudly while its secrets are missing.

| Workflow                | When (UTC)       | Calls / does                                                       | Secrets                                                   |
| ----------------------- | ---------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| `cron-reminders.yml`    | daily 07:00      | `POST /api/cron/reminders`                                         | `APP_URL`, `CRON_SECRET`                                  |
| `cron-housekeeping.yml` | daily 03:30      | `POST /api/cron/housekeeping`: prune rate-limit rows, orphan sweep | `APP_URL`, `CRON_SECRET`                                  |
| `backup-db.yml`         | daily 02:00      | `pg_dump`, verify, upload to the backup account                    | `BACKUP_DATABASE_URL`, `BACKUP_STORAGE_CONNECTION_STRING` |
| `restore-drill.yml`     | 1st of the month | restore the newest dump into a throwaway Postgres and sanity-check | `BACKUP_STORAGE_CONNECTION_STRING`                        |

`CRON_SECRET` also unlocks `GET /api/health/deep` (`Authorization: Bearer …`), used by the deploy smoke test. `/api/health` is the unauthenticated liveness probe for App Service and touches no dependency.

## Observability

Set `APPLICATIONINSIGHTS_CONNECTION_STRING` on the App Service to turn on tracing (requests, Postgres, Blob, HTTP dependencies, exceptions, Live Metrics). `OTEL_TRACES_SAMPLER_RATIO` (0 to 1, default 1) samples traces if volume grows. Logs are one JSON object per line on stdout/stderr, visible in the App Service log stream and, with telemetry on, in Application Insights.

**Alerts** (created by `infrastructure/modules/alerts` when `alert_emails` is set; the event alerts read App Service console logs, because only exceptions reach Application Insights. If an event alert never fires, check in Log Analytics that `AppServiceConsoleLogs` has rows after the first deploy). The backup and drill alerts are GitHub Actions notifications and stay manual:

| Alert                  | Signal                                                                  | Severity |
| ---------------------- | ----------------------------------------------------------------------- | -------- |
| Server errors          | requests with result code ≥ 500 above 1% over 15 min                    | 2        |
| Unhandled API error    | log event `api.unhandled_error` or `request.error`, any                 | 3        |
| AI paused for everyone | log event `ai.daily_cap_reached`                                        | 2        |
| AI Free share used up  | log event `ai.daily_free_share_reached` (consider raising the cap)      | 4        |
| AI provider failing    | log event `ai.provider_error` more than 5 in 15 min                     | 3        |
| Reminders failing      | `reminders.organisation_failed` or `reminders.email_failed`             | 3        |
| Cron didn't run        | no `cron.reminders.finished` / `cron.housekeeping.finished` in 26 hours | 3        |
| Orphan sweep stopped   | `housekeeping.orphan_sweep_stopped` (check the container first)         | 2        |
| Liveness               | App Service health check failing                                        | 1        |
| Backup or drill failed | GitHub Actions failure notification on `backup-db` / `restore-drill`    | 1        |

A user who reports "Something went wrong" can quote the `errorId` from the response; search the logs for it.

## Backups

**Database.** Neon point-in-time restore (keep at least 7 days of history) plus the nightly dump in a separate storage account.

**Files.** On the app's storage account (Terraform sets this up; the command is for reference or a manual fix):

```bash
az storage account blob-service-properties update -g <rg> -n <account> \
  --enable-delete-retention true --delete-retention-days 30 \
  --enable-versioning true \
  --enable-container-delete-retention true --container-delete-retention-days 30
```

**Backup storage account** (separate from the app's, private, its own credentials; Terraform creates it in Production with the 35-day immutability and lifecycle delete, the commands below are for reference):

```bash
az storage container create --account-name <backup-account> -n db-backups --auth-mode login
# Time-based immutability: dumps can't be altered or deleted for 35 days.
az storage container immutability-policy create --account-name <backup-account> \
  -c db-backups --period 35
# Lifecycle: delete dumps after 35 days except the first of each month (tag or
# copy those to a `monthly/` prefix with a 365-day rule).
```

`BACKUP_DATABASE_URL` should use a read-only role:

```sql
CREATE ROLE kigumi_backup LOGIN PASSWORD '…';
GRANT CONNECT ON DATABASE kigumi TO kigumi_backup;
GRANT USAGE ON SCHEMA public TO kigumi_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO kigumi_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO kigumi_backup;
```

## Restore

**A recent mistake (hours or days ago): Neon PITR.**

1. In Neon, create a branch from the production branch at a time just before the mistake.
2. Check it: connect and look at the affected rows.
3. Either point `DATABASE_URL` at the new branch (fastest; restart the app) or copy the affected rows back into production with `pg_dump --data-only --table=…` from the branch.
4. Record what happened and what was restored.

**Neon is gone or untrustworthy: restore a dump.**

1. Create a new Postgres (a new Neon project or Azure Flexible Server).
2. Download the newest dump and its `.sha256` from `db-backups`; run `sha256sum -c`.
3. `pg_restore --no-owner --no-privileges --exit-on-error -d "$NEW_DATABASE_URL" kigumi-….dump`
4. Run `npx prisma migrate deploy` against it: it should report nothing to apply. If the app is newer than the dump, it applies the missing migrations.
5. Point `DATABASE_URL` at it and restart. Up to 24 hours of changes are lost; tell affected customers.

**A deleted or overwritten file.** With soft delete and versioning on: `az storage blob undelete` (or restore a previous version) for `<organisationId>/<attachmentId>.<ext>`. The attachment row still points at that path. If the row was deleted too, restore the row from PITR first.

**Test restores** run monthly (`restore-drill.yml`). Run it by hand after any change to the schema or to backup settings.

## Incident checklist

1. Check `/api/health` and the App Service health page; check Neon and Azure status pages.
2. Live Metrics in Application Insights: failing requests and dependency calls.
3. Search logs for the event names above, or the user's `errorId`.
4. For AI trouble: `AI_ENABLED=false` switches generation off everywhere (cached output still shows).
5. For abuse: auth endpoints are rate-limited (Better Auth, in Postgres); the AI burst limit and allowances apply per organisation.
6. Write up what happened in `future-considerations.md` or an ADR if a decision changed.
