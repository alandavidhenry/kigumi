# 0019 — Backups and restore

**Status:** Accepted (2026-11-05)

## Context

Kigumi holds a studio's inventory, sessions, recall sheets, service history and receipts. Losing them would end trust in the product. Until Phase 8 nothing was written down: Neon's point-in-time restore (PITR) window depends on the plan, Blob Storage had no soft delete or versioning (Terraform isn't built yet), there was no tested restore, and an owner could delete a whole organisation with a direct Better Auth call.

## Decisions

**Three layers, each covering what the one before can't.**

1. **Neon point-in-time restore** is the first line for "undo the last few hours" (a bad migration, a buggy deploy, an accidental bulk delete). It restores to a new branch in minutes. Use a Neon plan with at least 7 days of history (the Launch plan or above) before taking paying customers.
2. **A nightly logical dump** (`.github/workflows/backup-db.yml`): `pg_dump --format=custom` with a read-only role, checked with `pg_restore --list` (the core tables must be present) and a SHA-256 checksum, then uploaded to a **separate storage account** with an immutability (WORM) policy and lifecycle rules: 35 daily dumps, then monthly ones for a year. This survives losing the Neon project, the Neon account, or the app's own storage account credentials, which PITR does not.
3. **Blob Storage soft delete and versioning** on the app's container (30 days each), so a deleted or overwritten receipt or photo can be recovered. Blobs are addressed by attachment id, so a restored database finds them again without remapping.

**Restores are tested, not assumed.** `.github/workflows/restore-drill.yml` runs monthly: it downloads the newest dump, checks its checksum, restores it into a throwaway Postgres on the runner and runs sanity queries (latest migration, organisation count, no orphaned tenant rows). A failed drill is an incident.

**Targets.** RPO: minutes for ordinary mistakes (PITR), 24 hours for losing Neon itself (the nightly dump). RTO: under an hour for a PITR branch switch, a few hours for a full restore from a dump. These suit a small SaaS with one developer; tighten them once there are contractual commitments.

**Organisation deletion stays off** (`disableOrganizationDeletion: true`) until there is a flow with confirmation, an audit record, a grace period and blob clean-up. A compromised owner account can't wipe an organisation through the API in one call.

**Why not just Neon PITR?** It shares a failure domain with the data it protects (the same project and account), and its window is short. **Why not Azure Database for PostgreSQL's backups?** We are on Neon (ADR 0001); a logical dump is portable to any Postgres, including the Flexible Server path Minato keeps scaffolded.

## Consequences

- Two repository secrets (`BACKUP_DATABASE_URL`, `BACKUP_STORAGE_CONNECTION_STRING`) and a backup storage account must exist before the workflows do anything. Until the app is deployed they fail loudly, like the cron workflows.
- The storage settings (soft delete, versioning, the backup account's immutability and lifecycle) belong in the Terraform still to be written; `docs/operations.md` lists them and the `az` commands that set them by hand.
- A dump contains every tenant's data, so the backup account is as sensitive as the database: private, separate credentials, no public access, access logged.
- Restore steps are in `docs/operations.md`.
