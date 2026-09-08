# CRICKET BOX — IMPLEMENTATION STATUS

Updated: 2026-09-09
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
- Paid-spin enablement/price are guarded after the season is in use.
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
- Stars prizes are excluded from a user's eligible pool when that user's Stars balance is already 500.
- Inventory decrement and spin creation occur in one transaction.
- Selection diagnostics and `algorithmVersion` are written to the audit event.
- XP is awarded on completed spins.
- Free-spin requests use client-generated idempotency keys and reuse the same key on retry.

### Daily Gift

- Daily Gift is persisted in PostgreSQL.
- Cooldown and per-user rate limiting are enforced server-side.
- Weighted NOTHING, Stars, FREE_SPIN and XP rewards are supported.
- Bonus spins are persisted and consumed server-side.

### Paid Telegram Stars

- Invoice flow uses Telegram `XTR`.
- Pre-checkout validation exists in the bot.
- `/api/payment/complete` validates stored pending transaction data, user, season, amount and currency before settlement.
- Pending paid-spin uniqueness is protected by a partial unique index.
- Completion is idempotent by Telegram charge ID / transaction state.
- Payment-status polling is authenticated and rate-limited.
- Successful payments remain recoverable when settlement is delayed; the explicit refund path handles an inventory race.

### LiveOps / economics administration

- `/api/admin/economy` exposes season metrics, configured weights, effective weights and baseline current probabilities.
- Historical economy snapshots can be persisted and queried.
- `/api/admin/drops` supports scheduled/manual drops and cancellation.
- Due drops are activated transactionally during settlement.
- `/api/admin/economy/simulate` provides controlled simulation without mutating production inventory.
- The simulator uses the same finite-pool selector as production.
- `/api/internal/liveops/tick` is secret-protected and advisory-locked.
- The repository scheduler exits cleanly when its required secrets are not configured.

### Payouts / withdrawals

- Payout lifecycle and admin processing exist.
- Withdrawal requests are restricted by season lifecycle and duplicate pending requests are blocked.
- Failed/cancelled Stars withdrawals use the Stars ledger to restore reserved balance.
- Premium, money and NFT fulfillment remains manual.

### Statistics / admin WebApp

- PostgreSQL-backed statistics exist for current and historical seasons.
- Funnel, winner, conversion, repeat-user and D1/D7 retention metrics are exposed.
- Admin routes exist for Dashboard, Seasons, Prizes, Participants, Spins, Payouts, Statistics, Access, Audit, Channel Activity, Veteran, Economics and Season Sync.

## Verification

The repository contains regression suites for database invariants, LiveOps, payment security/rate limits, spin idempotency and prize-probability behavior.

`npm run test:prize-probabilities` now covers weighted sampling, explicit zero weights, exhausted inventory, sequential finite-pool depletion and invalid-weight rejection.

`npm run check:season-odds` reads the current `ACTIVE`/`ENDING` season and prints configured weight, remaining inventory, effective weight and baseline odds without mutating production data.

## Remaining production work

1. Real Premium/money/NFT fulfillment providers and external reconciliation are not implemented.
2. Full live HTTP replay/double-click/payment-recovery testing still needs runtime execution against the deployed app.
3. Browser/Telegram Mini App QA and real payout/refund verification still need to be performed.
4. A deployed app URL plus `LIVEOPS_CRON_SECRET` must be configured before automated production scheduler ticks can run.
5. Paid-payment inventory is not reserved at invoice creation; the current safety model resolves an inventory race at settlement with a compensating Telegram refund. Failed refunds remain a production reconciliation concern.
6. External acquisition attribution and impression/session-level funnel data are not persisted historically.
7. Exact numeric probability display in user-facing paid-spin flows needs final product/legal review.

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
