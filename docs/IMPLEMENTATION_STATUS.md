# CRICKET BOX — IMPLEMENTATION STATUS

Updated: 2026-09-01
Repository: `querzz/cricket-box-sparkle`

## Verified implemented

### Core / database
- PostgreSQL is connected through `pg` and `src/server/db.ts`.
- `scripts/init-db.mjs` initializes the working `db/schema.sql` and payment idempotency guard.
- Users, user state, seasons, prizes, spins, payouts, gifts, owner gifts, channel activity, audit logs and payment transactions are persisted.
- Prize records now support `is_active`, `image_url`, arbitrary `amount`, quantity, and weighted selection metadata.
- `season_leaderboard` database view provides season-scoped database-driven ranking data.

### Telegram identity
- Mini App `initData` is validated server-side with Telegram HMAC-SHA256.
- Critical endpoints resolve the real Telegram user ID from validated data.
- Admin access uses PostgreSQL roles `OWNER` / `ADMIN`.

### Seasons
- Season states exist: `DRAFT → SCHEDULED → ACTIVE → ENDING → CLOSED → PAYOUT → ARCHIVED`.
- Admin can create and update seasons.
- Active/ending seasons are protected from having multiple concurrent live seasons by the current service behavior.
- Full production transition-machine hardening is still pending.

### Spin engine
- `/api/spin` is server-authoritative and transactional.
- Finite prize inventory is decremented atomically.
- Exhausted prizes are excluded.
- Inactive prizes are excluded.
- Stars prizes are excluded at the 500/500 balance.
- Weighted finite selection uses quantity remaining in the effective weight.
- `EMPTY` outcomes no longer create user payout records.
- XP is awarded by completed spins.

### Daily Gift
- Daily Gift is persisted in PostgreSQL.
- Cooldown is 24 hours.
- Random weighted rewards include NOTHING, Stars, FREE_SPIN and XP.
- Full Stars balance removes Stars outcomes from the gift pool.
- Bonus spins are persisted and consumed server-side.

### Paid Telegram Stars
- Telegram invoice creation uses `XTR`.
- Pre-checkout validation exists in `scripts/telegram-bot.mjs`.
- Successful payments are completed through `/api/payment/complete`.
- Pending paid-spin uniqueness is protected by a partial unique index.
- Completion checks payment payload, user, season and amount before settlement.
- DEV paid-spin flow exists for QA without spending real Telegram Stars.

### Payouts / withdrawals
- Payout lifecycle and bulk admin processing exist.
- Withdrawal requests are restricted to post-season states and duplicate pending requests are blocked.
- Failed/cancelled Stars withdrawals return the reserved balance.
- Manual fulfillment for Premium, money and other non-Stars rewards is still the current model.

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

## Implemented in this pass

- **Prize Builder:** fixed 20/50/100 Stars and 500 UAH catalog was replaced by a configurable builder. Admin can add Money or Stars rewards with arbitrary amounts, quantity, weight, active/inactive state, title/subtitle, cost and image URL.
- **Prize safety:** existing prize economics are blocked from retroactive type/amount/quantity/weight changes after a season has spins; quantity cannot be reduced below already-won units.
- **Leaderboard:** hardcoded fake rows were removed from the user profile. Ranking now comes from PostgreSQL and is scoped to the current season.
- **XP/Levels:** shared level rules were added. XP is earned from spins/Daily Gift; every 100 XP advances one level. Profile now shows level title, progress and the purpose/benefit of the current level status.
- **Telegram avatar:** session sync now asks Telegram Bot API for the current profile photo and exposes it to the profile as a server-generated data URL; the bot token is never sent to the browser.
- **Participants:** free spins, paid spins, rewards and Stars are now calculated from real season-scoped SQL aggregates instead of fixed zeroes. Referral count remains `0` because referrals are not an approved/currently implemented core mechanic.

## Important known gaps remaining

1. **Stars ledger is not yet implemented.** Balance mutations still use `user_state.stars_balance`; production should move to an append-only ledger with reconciliation.
2. **Paid-spin client check still needs cleanup.** The user-facing service currently compares internal CRICKET BOX Stars against the paid Telegram Stars price; this is conceptually wrong and should be removed so paid spins depend only on Telegram payment flow.
3. **Season state machine needs explicit transition validation and time-based automation.** Current admin update accepts valid enum states but does not fully enforce allowed transitions.
4. **Prize deletion/reconciliation needs a proper admin action.** The new builder can create and edit rewards; existing historical reward rows should be deactivated rather than destructively deleted.
5. **Participants still lack true referral data.** Referrals remain outside current MVP scope.
6. **Real channel subscription verification is not fully integrated.** Current user state can still rely on stored participation/subscription flags.
7. **Payout fulfillment is still partly manual.** Real Premium/money/NFT issuance providers and reconciliation are not implemented.
8. **Refund/reversal and payment recovery need a complete production audit.** The current Telegram flow is stronger than the old mock but still needs failure/replay regression tests.
9. **Stars accounting is not yet fully auditable.** Overflow is described in reward responses, but the append-only ledger event `CAPPED_OVERFLOW_BURNED` is not yet stored.
10. **Statistics/Economic Planner are partially implemented.** Core counts are real, but full funnel/retention/economics outputs from the specs are not finished.
11. **`src/server/db/schema.sql` is a legacy duplicate schema and should not be used as a second source of truth.** `db/schema.sql` is the active schema initialized by `scripts/init-db.mjs`; the duplicate should be removed or explicitly documented as legacy after local verification.
12. **No GitHub Actions workflow currently runs build/lint automatically.** Repository reports zero workflow runs, so local/build verification still needs to be performed in the development environment.

## Recommended next order

1. Fix the paid-spin frontend currency mix-up.
2. Finish the Prize Builder CRUD behavior and non-destructive deactivation semantics.
3. Harden the Season state machine and critical setting locks.
4. Implement the append-only Stars ledger and reconcile all balance-changing operations.
5. Complete Participants / Spins operational data and Statistics / Economics.
6. Run the full security audit: replay, double-click, duplicate payment, duplicate withdrawal, race conditions, forged frontend state and admin escalation.
7. Run complete browser QA on mobile target widths and Telegram Mini App behavior.
8. Verify real prize fulfillment and refund/reversal paths.
9. Only then prepare a limited Season #001 rollout.

## Deliberately not implementing now

- Piggy Bank
- VIP
- Internal Store
- VIP Drops / Secret Events / Limited Events
- advanced Veteran economy
- referral system
- streaks / missions unless separately moved into the active MVP scope
