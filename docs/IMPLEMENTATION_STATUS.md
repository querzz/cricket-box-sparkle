# CRICKET BOX — IMPLEMENTATION STATUS

Updated: 2026-09-08
Repository: `querzz/cricket-box-sparkle`

## Verified implemented

### Core / database
- PostgreSQL is connected through `pg` and `src/server/db.ts`.
- `scripts/init-db.mjs` initializes the active `db/schema.sql`, including migrations and payment idempotency guards.
- Users, user state, seasons, prizes, spins, payouts, gifts, owner gifts, channel activity, audit logs, payment transactions, LiveOps drops and economy snapshots are persisted.
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

### Spin engine / adaptive economy
- `/api/spin` is server-authoritative and transactional.
- Finite prize inventory is decremented atomically.
- Exhausted and inactive prizes are excluded.
- Stars prizes are excluded when the user's Stars balance is at the cap.
- Selection uses configured weight × remaining inventory × server-side economy multiplier, with personal empty-streak and anti-streak adjustments.
- Economy multiplier reacts to actual inventory consumption versus season progress and is bounded to prevent extreme swings.
- LiveOps drops can be activated automatically when their time, spin-count or season-progress trigger becomes due.
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

### LiveOps / economy administration
- `/api/admin/economy` exposes live season metrics, inventory consumption and current per-prize multipliers.
- Economy snapshots can be persisted with an audit record and historical snapshots can be requested from the same endpoint.
- `/api/admin/drops` supports scheduled and manual drops, cancellation and manual activation.
- Drop payloads validate prize type, quantity, amount and unit cost before insertion.
- Drop trigger values are validated for trigger semantics and bounded payload size.
- Automatic due-drop activation is executed inside the same transaction as the spin/payment settlement.
- `/admin/economics` is connected to PostgreSQL and exposes live metrics, scenario planning, prize multipliers, economy snapshots and LiveOps controls.
- `src/server/season-simulator.ts` can simulate the current adaptive prize economy with deterministic seeded trials, reporting average wins, remaining inventory, win rates and exhaustion rates.
- `/api/admin/economy/simulate` exposes the simulator for controlled admin scenario testing without mutating production inventory.

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
- GitHub DB integration tests remain the safety net for schema/inventory/idempotency invariants.
- Local verification has reached passing TypeScript, production build, DB integration and lint checks on the current development line.

## Important remaining production gaps

1. Real Premium/money/NFT fulfillment providers and reconciliation are not implemented.
2. Statistics still do not expose every KPI from the full specification, especially full funnel/retention reporting across all historical cohorts.
3. Full automatic season transition jobs are not implemented; state changes are currently guarded by the service when requests occur.
4. Complete replay/double-click/payment-recovery security regression tests still need to run against the current application.
5. Browser/Telegram Mini App QA and production payout/refund verification still need to be performed.
6. The frontend still contains a local mock fallback path for non-Telegram development; real Telegram flow remains server-authoritative.
7. LiveOps has no independent background scheduler yet, so a time-based drop cannot execute while the application receives zero spin/payment traffic.

## Deliberately not implementing now

- Piggy Bank
- VIP
- Internal Store
- VIP Drops / Secret Events / Limited Events
- advanced Veteran economy
- referral system
- streaks / missions unless separately approved
