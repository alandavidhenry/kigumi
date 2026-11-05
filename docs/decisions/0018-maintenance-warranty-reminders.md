# 0018 — Maintenance, PAT, warranty and reminders

**Status:** Accepted (2026-11-05)

## Context

Phase 7 (PLAN §4.8 to §4.10) adds recurring maintenance by time or usage hours, a UK PAT testing register, warranty records with receipts, in-app and email reminders from a scheduled job, and a dashboard. ADR 0009 already fixed the job mechanism (GitHub Actions cron calling a protected route).

## Decisions

**A plan is a rule; a task is its next occurrence for one item.** A `MaintenancePlan` covers one item or a whole category. `MaintenanceTask` (unique per plan and item) holds the next due date and/or due hours and is rolled forward when it is completed. The `MaintenanceLog` keeps what was done (cost, notes, hours, invoices) and survives the plan being deleted. A category plan creates tasks when it is saved and when the plan is next edited; items added to the category later are not picked up until then. This is a known gap, not an accident (see future-considerations).

**Due means "either target reached".** A task with both days and hours is overdue when its date passes or its hours are reached. "Due soon" is the plan's lead time in days, or the last 10% of an hours interval. After a completion the next due point counts from the day the work was done and the hour reading then, not from the old due date, so a late service doesn't leave the next one already overdue.

**Usage hours are a per-item counter** (`UsageCounter`, one row per item), set by hand or at task completion. It is a Studio feature (`USAGE_HOUR_MAINTENANCE`). Nothing measures hours automatically.

**PAT is a register of tests, not a flag on the item.** Each `PatTest` is a row; an item's status comes from its latest test only. A pass schedules the next test (3, 6, 12, 24 or 48 months; 12 is only the default, because UK guidance sets no legal interval). A fail has no next date and stays "failed" until a later pass. Studio plan (`PAT_TESTING`), enforced in every lib function, not just the page.

**Warranties and the service log are free on every plan,** with receipts and invoices as `Attachment` rows (`warranty`, `maintenance_log`). Attachments now also accept PDFs for these, checked by magic bytes (`%PDF-`) like images, with their own size cap (8 MB) and the same per-record cap and storage-plan limit. Photos elsewhere remain image-only. Files are served only through `/api/attachments/[id]` under the inventory permissions. Deleting an item, warranty or log entry removes its blobs first.

**Permissions reuse the inventory ones** (`VIEW_INVENTORY` to read, `MANAGE_INVENTORY` to change): viewers read, engineers and above change. A separate maintenance role was not needed. Reminders go to owners, managers and engineers; viewers can read the pages but are not notified.

**Reminders are a `Notification` row per person, deduplicated by `(userId, dedupeKey)`.** The key names the thing and its due date (`maintenance_overdue:<taskId>:<due date>:<due hours>`), so the daily job is idempotent: running it twice creates nothing new, an overdue task is reported once, and completing a task (which moves its date) lets the next cycle remind again. The job (`runReminders`) has no signed-in user, so it cannot use `tenantDb`; it works one organisation at a time and every query and write names `organisationId`. A failure in one organisation is logged and does not stop the rest.

**Email is a digest per person, and a Pro feature** (`EMAIL_REMINDERS`). After creating notifications the job mails each recipient their unread, not-yet-emailed reminders from the last three days in one message, then sets `emailedAt`. A failed send leaves it unset so the next run retries inside that window; the window also stops an organisation that upgrades later from being sent a backlog. In-app reminders are on every plan. There is no per-user opt-out yet.

**Cron route:** `/api/cron/reminders` (GET and POST) requires `Authorization: Bearer $CRON_SECRET`, compared in constant time. An unset secret refuses everything. `.github/workflows/cron-reminders.yml` calls it daily at 07:00 UTC using `APP_URL` and `CRON_SECRET` repository secrets; it needs those secrets and a deployed app before it does anything.

## Consequences

- No queue, scheduler or new infrastructure. Delivery is best effort at roughly daily granularity (ADR 0009).
- The reminder job is the one place that reads tenant tables without `tenantDb`. It is covered by tests that check each query names the organisation, and it must stay small.
- Downgrading keeps data: hours plans and PAT tests are still recorded and shown on the item page behind an upgrade prompt; only creating new ones is refused.
