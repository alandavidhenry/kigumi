# 0011 — Monetisation: four subscription tiers, no general buy-once licence

**Status:** Accepted (2026-10-08). Prices are starting hypotheses to validate with studio owners.

## Context

Kigumi needs a free tier that is genuinely useful (so it spreads by word of mouth), a clear reason for one-person studios to pay, and room to charge larger studios more. The only meaningful per-customer costs are LLM tokens and file storage. A buy-once option was considered because the audio market is used to perpetual licences (plugins, DAWs) and subscription fatigue is real.

## Decision

**Four tiers** (GBP, annual roughly two months free), defined in `src/lib/plans.ts`:

|                     | Free                   | Pro                        | Studio                        | Facility                    |
| ------------------- | ---------------------- | -------------------------- | ----------------------------- | --------------------------- |
| For                 | Home / bedroom studios | Solo pros, project studios | Commercial studios with staff | Multi-site, education       |
| Price               | £0                     | £10/mo or £96/yr           | £35/mo or £336/yr             | From £90/mo, annual invoice |
| Studios / rooms     | 1 / 2                  | 1 / 4                      | 2 / 15                        | Unlimited                   |
| Seats               | 1                      | 3                          | 15                            | 50 (custom)                 |
| Inventory items     | 250                    | Unlimited                  | Unlimited                     | Unlimited                   |
| AI requests / month | 25                     | 400                        | 2,500                         | 10,000 (custom)             |
| Storage             | 250 MB                 | 5 GB                       | 50 GB                         | 200 GB (custom)             |

**Gating principles:**

1. Charge for capacity and for team, admin and commercial features, never the core workflow. Free keeps inventory, the mic catalogue and comparisons, the mic locker, layouts, sessions, input lists, recall sheets, CSV import/export, QR labels and branded share links.
2. Never paywall safety: ribbon/phantom power warnings, double-booking and channel-count checks are on every tier.
3. Limit the things that cost money (AI, storage) on Free.
4. Data stays portable on every tier.

**Paid features** (`Feature` enum, cheapest tier in `FEATURE_MINIMUM_TIER`; higher tiers inherit):

- **Pro** (upgrade hooks for one-person studios): insurance and valuation report, email reminders (Free gets in-app only), unbranded PDFs and share links, layout and session templates, AI receipt scanning.
- **Studio:** activity log, usage-hour maintenance, PAT testing register, shared console templates, bulk import, booking calendar.
- **Facility:** multi-site reporting, SSO, class and cohort accounts, annual invoicing, priority support.

Roles (Manager / Engineer / Viewer) are available on any plan with more than one seat; seat counts, not roles, separate the tiers. Education is a discount on Studio or Facility, not a separate tier.

**Enforcement:** limits via `canAdd` on create; features via `requireFeature(ctx, Feature.X)` in `src/lib` (403 `FEATURE_NOT_IN_PLAN`, naming the cheapest plan that includes it) and `useTenant().has(feature)` in the UI. Paid features stay visible to lower tiers as upgrade prompts (`UpgradeNotice`) rather than being hidden. Gated data is still recorded (e.g. the audit log), so upgrading reveals the history. On a downgrade, data over the limits becomes read-only, never deleted.

**No general buy-once licence.** Ongoing AI and hosting costs make lifetime pricing unprofitable over time; it attracts heavy users who stop paying, and it makes revenue unpredictable. Alternatives, to decide at launch:

- annual plans, optionally without auto-renew
- a capped founders' deal (first 100–200 customers, Pro for life with a fair-use AI allowance)
- one-off AI credit packs on any tier
- price lock for early subscribers

**Launch tactic:** a reverse trial (new signups get Pro free for 14 days, then drop to Free), implemented with billing.

## Consequences

- Every phase gates its paid features in one place (`FEATURE_MINIMUM_TIER`) and adds a `requireFeature` call plus a test.
- Stripe billing (checkout, customer portal, webhooks updating `Organization.planTier`), the reverse trial, credit packs and per-organisation limit overrides for Facility are future work.
- Inventory, AI and storage limits are defined now and enforced when Phases 1 and 3 land.
