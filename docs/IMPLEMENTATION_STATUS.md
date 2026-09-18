# CRICKET BOX — IMPLEMENTATION STATUS

Updated: 2026-09-17
Repository: `querzz/cricket-box-sparkle`

## Verified implemented

### Core / database

- PostgreSQL is connected through `pg` and `src/server/db.ts`.
- `scripts/init-db.mjs` initializes `db/schema.sql` and applies compatibility migrations.
- Users, user state, seasons, prizes, spins, payouts, gifts, owner gifts, channel activity, audit logs, payment transactions, LiveOps drops and economy snapshots are persisted.
- Prize records support active state, image URL, arbitrary amount, quantity and weighted selection metadata.
- `season_leaderboard` is season-scoped.
- Stars balance changes use the append-only `stars_ledger`; idempotency keys are enforced and the cached balance is capped at 500.
- Concurrent inventory claims are serialized by database locks and conditional decrement.
- PostgreSQL-backed API rate-limit buckets are initialized by `scripts/init-db.mjs`.
- Stars ledger writes use `ON CONFLICT DO NOTHING` plus payload verification, so a concurrent/idempotent replay cannot silently reuse a key for a different user, amount or operation.

### Telegram identity / security

- Mini App `initData` is validated server-side with Telegram HMAC-SHA256.
- Critical endpoints resolve the real Telegram user from validated data.
- Admin access uses PostgreSQL roles `OWNER` / `ADMIN`.
- Critical spin/payment requests use server-side rate limiting and idempotency guards.

### Seasons

- Season states: `DRAFT → SCHEDULED → ACTIVE → ENDING → CLOSED → PAYOUT → ARCHIVED`.
- State transitions and season-date constraints are validated.
- Only one `ACTIVE`/`ENDING` season is allowed.
- Start time cannot be changed after a season has started; the season end cannot be shortened or removed after start.
- Paid-spin enablement is guarded after the season is in use; the paid-spin price remains editable during the season. Pending Telegram invoices retain their stored transaction amount, while newly created invoices use the latest season price.
- Prize economic fields are guarded after the season is in use; cosmetic edits remain available.
- Season/prize mutation transactions lock the season before the prize, matching the spin transaction lock order and reducing deadlock/race risk.
- LiveOps reconciles due scheduled seasons, expiry and payout/archive lifecycle.

### Spin engine

- `/api/spin` is server-authoritative and transactional.
- The canonical production selector is `finite-pool-v1`.
- Each eligible prize contributes:

```text
finalWeight = configuredWeight × quantityRemaining
```

- There is no hidden online-user-count multiplier, time pacing, pity or anti-streak correction in the MVP selector.
- `weight = 0` is valid and makes a prize non-selectable.
- Negative/non-finite weights fail closed as `INVALID_PRIZE_WEIGHT` rather than silently becoming `1`.
- Exhausted/inactive prizes are excluded.
- Stars prizes remain selectable even when a user's balance is already 500 ⭐; the 500 ⭐ cap is enforced during manual payout fulfillment, with any overflow explicitly audited rather than added to the balance.
- Inventory decrement and spin creation occur in one transaction.
- Selection diagnostics and `algorithmVersion` are written to the audit event.
- XP is awarded on completed spins.
- Free-spin requests use client-generated idempotency keys and reuse the same key on retry.

### Daily Gift

- Daily Gift is persisted in PostgreSQL.
- Cooldown and per-user rate limiting are enforced server-side.
- Weighted NOTHING, Stars, FREE_SPIN and XP rewards are supported.
- Bonus spins are persisted and consumed server-side.
- Stars/free-spin caps produce an explicit effective reward and audit metadata when a requested reward cannot fit the user's balance/cap.

### Paid Telegram Stars

- Invoice flow uses Telegram `XTR`.
- Pre-checkout validation exists in the bot.
- `/api/payment/complete` validates stored pending transaction data, user, season, amount and currency before settlement.
- Pending paid-spin uniqueness is protected by a partial unique index.
- Completion is idempotent by Telegram charge ID / transaction state.
- Payment-status polling is authenticated and rate-limited, including explicit `REFUND_PENDING` state handling.
- Failed settlement now persists `REFUND_PENDING` before the external Telegram refund call, so a timeout between the database and Telegram does not lose the refund obligation.
- Duplicate/mismatched successful charges create a separate refund obligation rather than mutating the original transaction.
- Refund recovery claims stale obligations before calling Telegram and uses an expiring recovery token, preventing two scheduler instances from issuing the same refund concurrently.
- LiveOps now reconciles stale `REFUND_PENDING` payments automatically in bounded batches; successful refunds are marked `REFUNDED` and audited, failed attempts retain the last error for the next retry.
- New paid checkout requests are blocked while a refund is still pending for that user/season, preventing a second charge from being opened while the first charge is unresolved.
- Telegram invoice URLs are generated only after a pending payment transaction exists, and concurrent requests for the same pending transaction are serialized so the stored URL becomes the canonical one returned to the client.

### LiveOps / economics administration

- `/api/admin/economy` exposes season metrics, configured weights, effective weights and baseline current probabilities.
- Historical economy snapshots can be persisted and queried.
- `/api/admin/drops` supports scheduled/manual drops and cancellation.
- Due drops are activated transactionally during settlement.
- `/api/admin/economy/simulate` provides controlled simulation without mutating production inventory.
- The simulator uses the same finite-pool selector as production.
- `/api/internal/liveops/tick` is secret-protected and advisory-locked.
- The repository scheduler exits cleanly when its required secrets are not configured.
- The economic planner is consolidated into `/admin/economics`: scenario presets, expected/max free spins, expected paid spins, planning volume, gross Stars, Stars prize liability, configurable planning rate, Daily Gift budget, operating reserve, break-even calculations, pool utilization and explicit warnings are calculated without mutating season settings.
- The planner keeps non-USD material costs separate instead of silently converting them with an invented FX rate.
- A centralized `/admin/settings` page now collects existing cross-season controls without duplicating season economics; Veteran remains owner-controlled and Mechanics remains available as a dedicated configuration screen.

### Payouts / withdrawals

- Payout lifecycle and admin processing exist.
- Withdrawal requests are restricted by season lifecycle and duplicate pending requests are blocked.
- Stars withdrawals are rate-limited and serialized on the user/season rows.
- Failed/cancelled Stars withdrawals use the Stars ledger to restore reserved balance.
- Premium, money and NFT fulfillment remains manual by design for the current MVP.

### Statistics / admin WebApp

- PostgreSQL-backed statistics exist for current and historical seasons.
- Funnel, winner, conversion, repeat-user and D1/D7 retention metrics are exposed.
- Admin routes exist for Dashboard, Seasons, Prizes, Participants, Spins, Payouts, Statistics, Access, Audit, Channel Activity, Veteran, Economics, Mechanics and Settings.
- Admin Access supports OWNER/ADMIN management and ownership transfer.
- Admin payout flow requires fulfillment references for individual PAID actions and keeps payout history immutable.
- Admin prize/access/mechanics mutations are transactionally audited, and season/prize economics guards have regression coverage.
- Mechanics input is validated server-side, including enum-like enabled keys, integer pass count, bounded text and actual boolean confirmation values.

## Verification

The repository contains regression suites for database invariants, LiveOps, payment security/rate limits, spin idempotency, prize probabilities, admin season/prize guards and Stars-ledger idempotency.

`npm run test:prize-probabilities` covers weighted sampling, explicit zero weights, exhausted inventory, sequential finite-pool depletion and invalid-weight rejection.

`npm run check:season-odds` reads the current `ACTIVE`/`ENDING` season and prints configured weight, remaining inventory, effective weight and baseline odds without mutating production data.

`npm run test:stars-ledger` verifies identical replay is a no-op while reusing an idempotency key for a different amount is rejected without changing balance.

`npm run test:payment-security` covers Telegram charge replay, stale pending recovery, refund-pending persistence, duplicate-charge refund obligations, pending-payment uniqueness and concurrent charge races.

Current-head CI must finish Build/typecheck/lint, PostgreSQL integration and Payment Security green before production readiness is declared.

## Remaining production work

1. Full live HTTP replay/double-click/payment-recovery testing still needs runtime execution against the deployed app.
2. Browser/Telegram Mini App QA and real payout/refund verification still need to be performed.
3. A deployed app URL plus `LIVEOPS_CRON_SECRET` must be configured before automated production scheduler ticks can run.
4. Paid-payment inventory is not reserved at invoice creation. The current safety model resolves an inventory race at settlement with a compensating Telegram refund; stale refund obligations are now automatically claimed/reconciled, but the external Telegram payment still cannot be rolled back atomically with PostgreSQL. An external Telegram invoice can still succeed immediately before a database persistence failure, leaving an orphaned invoice link that is never returned to the client.
5. External acquisition attribution and impression/session-level funnel data are not persisted historically.
6. Exact numeric probability display in user-facing paid-spin flows needs final product/legal review.
7. Economic Planner supports non-USD cost separation, but an approved FX/accounting model is still needed if those costs must be included in USD margin.
8. The centralized Settings page now exists, but no additional global business settings have been invented; any future controls need explicit product definitions before being added.
9. Russian i18n infrastructure exists (`src/lib/i18n.ts` + `src/locales/ru.json`), but most UI copy is still hardcoded and has not been migrated to translation keys.

## Documentation policy

- [`docs/PRODUCT_DECISIONS.md`](PRODUCT_DECISIONS.md) is the current product decision source of truth.
- [`docs/PRIZE_ENGINE.md`](PRIZE_ENGINE.md) documents the current finite-pool selector.
- [`docs/MASTER_PLAN.md`](MASTER_PLAN.md) is a roadmap and may contain historical phase descriptions.
- [`docs/MASTER_SPECIFICATION.md`](MASTER_SPECIFICATION.md) is the requirements baseline.
- [`docs/SEASON-DYNAMIC-ECONOMY.md`](SEASON-DYNAMIC-ECONOMY.md) describes future/advanced adaptive-economy concepts; those hidden adaptive modifiers are not active in the current MVP selector.
- [`docs/QA_CHECKLIST.md`](QA_CHECKLIST.md) is historical Phase 1 QA material; production readiness is defined by the remaining runtime checks above.

## Deliberately not implementing now

- Piggy Bank
- VIP
- Internal Store
- VIP Drops / Secret Events / Limited Events
- Advanced Veteran economy
- Referral system
- Streaks / missions unless separately approved
- Automated Premium/money/NFT fulfillment providers
