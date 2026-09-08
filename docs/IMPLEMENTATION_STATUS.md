# CRICKET BOX — IMPLEMENTATION STATUS

Updated: 2026-09-08
Repository: `querzz/cricket-box-sparkle`

## Verified implemented

### Core / database
- PostgreSQL is connected through `pg` and `src/server/db.ts`.
- `scripts/init-db.mjs` initializes the active `db/schema.sql`, including migrations and the payment idempotency guard.
- Users, user state, seasons, prizes, spins, payouts, gifts, owner gifts, channel activity, audit logs and payment transactions are persisted.
- Prize records support active state, image URL, arbitrary amount, quantity and weighted selection metadata.
- `season_leaderboard` provides season-scoped ranking data.
- Stars balance changes use the append-only `stars_ledger`; opening balances, rewards, spending, withdrawals, reversals and capped overflow events are recorded with idempotency keys.
- The legacy duplicate `src/server/db/schema.sql` has been removed; `db/schema.sql` is the single database source of truth.
- DB integration tests cover schema presence, ledger append-only behavior, Stars cap/reconciliation, payment idempotency, leaderboard isolation and concurrent inventory claims.

### Telegram identity
- Mini App `initData` is validated server-side with Telegram HMAC-SHA256.
- Critical endpoints resolve the real Telegram user ID from validated data.
- Admin access uses PostgreSQL roles `OWNER` / `ADMIN`.

### Seasons
- Season states exist: `DRAFT → SCHEDULED → ACTIVE → ENDING → CLOSED → PAYOUT → ARCHIVED`.
- Admin can create and update seasons.
- State transitions are explicitly validated.
- Start time is immutable after a season starts.
- End time cannot be shortened or removed after start.
- Only one ACTIVE/ENDING season is allowed by the service lock.
- Paid spins can be disabled, but cannot be re-enabled mid-season when disabled from the start.
- Paid-spin price is locked after the first paid spin.

### Spin engine
- `/api/spin` is server-authoritative and transactional.
- Finite prize inventory is decremented atomically.
- Exhausted and inactive prizes are excluded.
- Stars prizes are excluded when the user's Stars balance is at the cap.
- Weighted sampling uses configured weight only; remaining quantity does not silently alter probability.
- `EMPTY` outcomes do not create payout records.
- XP is awarded on completed spins.

### Daily Gift
- Daily Gift is persisted in PostgreSQL.
- Cooldown is 24 hours.
- Weighted NOTHING, Stars, FREE_SPIN and XP rewards are supported.
- Stars rewards are removed when the balance is full.
- Bonus spins are persisted and consumed server-side.

### Paid Telegram Stars
- Telegram invoice creation uses `XTR`.
- Pre-checkout validation exists in `scripts/telegram-bot.mjs`.
- Successful payments are completed through `/api/payment/complete`.
- Pending paid-spin uniqueness is protected by a partial unique index.
- Invoice and completion flows both respect the season paid-spin ON/OFF setting.
- Completion validates payload, user, season and amount before settlement.
- DEV paid-spin flow exists for QA without spending real Telegram Stars.

### Payouts / withdrawals
- Payout lifecycle and bulk admin processing exist.
- Withdrawal requests are restricted to post-season states and duplicate pending requests are blocked.
- Failed/cancelled Stars withdrawals return the reserved balance through the Stars ledger.
- Payout type labels distinguish Stars, Premium, Money, NFT, Physical, Custom and Free Spin.
- Manual fulfillment for Premium, money, NFT and other non-Stars rewards remains the current model.

### Admin WebApp
The following real admin routes exist and use backend APIs:
- Dashboard
- Seasons
- Prizes
- Participants
- Spins
- Payouts
- Statistics
- Access
- Audit
- Channel Activity
- Veteran
- Economics
- Season Sync

### CI / verification
- GitHub Actions CI runs build, TypeScript check and lint on pushes/PRs.
- Local DB integration test cleanup no longer fails because of the append-only ledger; immutable ledger fixtures are intentionally retained.

## Important remaining production gaps

1. Real Telegram channel subscription verification is not fully integrated; stored subscription/participation flags can still be used.
2. Real Premium/money/NFT fulfillment providers and reconciliation are not implemented.
3. Statistics and Economic Planner do not yet expose every KPI from the specification, especially full funnel/retention/break-even reporting.
4. Full automatic season transition jobs are not implemented; state changes are currently guarded by the service when requests occur.
5. Complete replay/double-click/payment-recovery security regression tests still need to run against the current application.
6. Browser/Telegram Mini App QA and production payout/refund verification still need to be performed.
7. The frontend still contains a local mock fallback path for non-Telegram development; real Telegram flow remains server-authoritative.

## Deliberately not implementing now

- Piggy Bank
- VIP
- Internal Store
- VIP Drops / Secret Events / Limited Events
- advanced Veteran economy
- referral system
- streaks / missions unless separately approved
