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
- The protected LiveOps tick automatically reconciles a due `SCHEDULED` season into `ACTIVE` and moves expired `ACTIVE` seasons into `ENDING`, then `ENDING` into `CLOSED`.
- Closed seasons automatically enter `PAYOUT`.
- A season remains in `PAYOUT` while any spin-linked payout is `PENDING` or `REVIEW`.
- Once all spin-linked payouts are terminal (`PAID`, `FAILED`, `CANCELLED`), the season can automatically transition to `ARCHIVED`.
- Automatic season state transitions are written to `audit_logs` with source `liveops`.

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
- Free-spin requests now send a client-generated idempotency key and retry once with the same key after a network failure.

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
- `/api/payment/status` authenticates the Telegram user and exposes the exact transaction state and settled reward for a payment payload.
- Stale `PENDING` payments are intentionally kept recoverable instead of being auto-failed solely because they are old.
- A pending paid-spin reuses its stored invoice URL when available, preventing multiple invoice links for the same pending transaction.
- The user client polls the exact payment transaction after Telegram callback/timeout so a successful payment is not lost because the Mini App callback arrives late.

### LiveOps / economy administration
- `/api/admin/economy` exposes live season metrics, inventory consumption and current per-prize multipliers.
- Economy snapshots can be persisted with an audit record and historical snapshots can be requested from the same endpoint.
- `/api/admin/drops` supports scheduled and manual drops, cancellation and manual activation.
- Drop payloads validate prize type, quantity, amount and unit cost before insertion.
- Drop trigger values are validated for trigger semantics and bounded payload size.
- Automatic due-drop activation is executed inside the same transaction as the spin/payment settlement.
- `/admin/economics` is connected to PostgreSQL and exposes live metrics, scenario planning, prize multipliers, economy snapshots and LiveOps controls.
- `src/server/season-simulator.ts` can simulate the current adaptive prize economy with deterministic seeded trials, reporting average wins, remaining inventory, win rates and exhaustion rates while advancing economy progress through the simulated season.
- `/api/admin/economy/simulate` exposes the simulator for controlled admin scenario testing without mutating production inventory.
- `src/server/economy-guardrails.ts` evaluates finite reward inventory coverage, Stars liability, material exposure and simulated exhaustion risk; `EMPTY` is not counted as finite reward inventory.
- `/api/internal/liveops/tick` provides a secret-protected scheduler endpoint that reconciles season states, finalizes payout/archive lifecycle and processes due drops across all live seasons inside an advisory-locked transaction, so an external cron can activate time-based operations even when no users are spinning.

### Payouts / withdrawals
- Payout lifecycle and bulk admin processing exist.
- Withdrawal requests are restricted to post-season states and duplicate pending requests are blocked.
- Failed/cancelled Stars withdrawals return the reserved balance through the Stars ledger.
- Payout type labels distinguish Stars, Premium, Money, NFT, Physical, Custom and Free Spin.
- Manual fulfillment for Premium, money, NFT and other non-Stars rewards remains the current model.
- Season payout orchestration now has an explicit CLOSED → PAYOUT → ARCHIVED policy guarded by outstanding payout status.

### Statistics
- `/api/admin/statistics` serves PostgreSQL-backed current-season and historical views.
- Statistics now include completed vs attempted/failed spins, paid-user conversion, repeat-user rate, winner rate, and D1/D7 retention cohorts derived from first completed spins.
- D1/D7 denominators exclude immature cohorts so current-day users do not distort retention rates.
- Admin statistics UI exposes funnel and retention cards alongside operational totals.

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
- Payment security CI runs the payment regression suite against a clean PostgreSQL service.
- Previous local verification reached passing TypeScript, production build, DB integration and lint checks; the latest dependency pin is being re-verified in CI after package-resolution failures on the runner.

## Important remaining production gaps

1. Real Premium/money/NFT fulfillment providers and reconciliation are not implemented.
2. Statistics are substantially expanded, but external acquisition sources/attribution and true impression/session-level funnel data are not persisted, so those cannot yet be reconstructed historically.
3. Full replay/double-click/payment-recovery security regression against the live HTTP application endpoints still needs runtime-level execution; DB-level coverage is present and the payment security suite now also covers stale `PENDING` recovery semantics.
4. Browser/Telegram Mini App QA and production payout/refund verification still need to be performed.
5. The frontend still contains a local mock fallback path for non-Telegram development; real Telegram flow remains server-authoritative.
6. The scheduler endpoint now performs the full lifecycle, but an external cron provider/runtime still needs to call it with `Authorization: Bearer $LIVEOPS_CRON_SECRET` on a cadence such as every minute.
7. Stars cross-season policy remains intentionally explicit at product/season level; the system does not silently reset, transfer, or burn eligible user Stars during lifecycle transitions.
8. Paid-payment inventory reservation is not yet implemented; a successful paid payment can still race with the final available prize being consumed between invoice creation and completion. This needs either reservation semantics or a deliberate refund path before production money movement is considered fully closed.

## Documentation audit

- `docs/IMPLEMENTATION_STATUS.md` is the current verified implementation tracker.
- `docs/MASTER_PLAN.md` remains the product roadmap and still contains historical phase descriptions; those phase labels should not be read as a statement that the current repository is still at that phase.
- `docs/MASTER_SPECIFICATION.md` remains the requirements/spec baseline, but its opening “production backend/admin missing” wording is stale relative to the current implementation and should be updated in a future documentation-sync pass.
- `docs/ADMIN_SPEC.md` matches the implemented admin surface broadly; some advanced integrations remain intentionally backend/manual rather than provider-automated.
- `docs/QA_CHECKLIST.md` is a Phase 1 mock-frontend checklist and is now historical; production readiness requires the remaining runtime Telegram/browser/security checks above.
- `docs/PRODUCT_DECISIONS.md`, `docs/ECONOMICS.md`, and `docs/HOME_UX.md` remain decision/requirements references and should continue to be read before changing product behavior.

## Deliberately not implementing now

- Piggy Bank
- VIP
- Internal Store
- VIP Drops / Secret Events / Limited Events
- advanced Veteran economy
- referral system
- streaks / missions unless separately approved
