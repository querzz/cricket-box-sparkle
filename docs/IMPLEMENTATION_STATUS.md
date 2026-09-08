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
- PostgreSQL-backed API rate-limit buckets are initialized by `scripts/init-db.mjs`; critical user/payment request paths use the shared rate limiter.

### Telegram identity
- Mini App `initData` is validated server-side with Telegram HMAC-SHA256.
- Critical endpoints resolve the real Telegram user ID from validated data.
- Admin access uses PostgreSQL roles `OWNER` / `ADMIN`.
- Telegram `initData` freshness is bounded to 1 hour and future-dated auth payloads are rejected.

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

### Spin engine
- `/api/spin` is server-authoritative and transactional.
- Finite prize inventory is decremented atomically.
- Exhausted and inactive prizes are excluded.
- Stars prizes are excluded when the user's Stars balance is at the cap.
- Production selection now uses the dynamic season-economy pipeline: configured base weight × remaining inventory × global inventory-pressure multiplier × soft player pity × anti-streak correction, followed by server-side cryptographically secure selection.
- Dynamic balancing is bounded and soft: the global multiplier is clamped, pity is capped at 30 consecutive low-value outcomes, and anti-streak only reduces excessive repetition rather than guaranteeing a better prize.
- The dynamic selection inputs and diagnostics are written into the spin completion audit record, including `algorithmVersion`, elapsed season fraction, recent result kinds, and per-selected-prize weight diagnostics.
- LiveOps drops can be activated automatically when their time, spin-count or season-progress trigger becomes due.
- `EMPTY` outcomes do not create payout records.
- XP is awarded on completed spins.
- Free-spin requests use a client-generated idempotency key and retry once with the same key after a network failure.
- Authenticated spin traffic is protected by a PostgreSQL-backed per-user fixed-window rate limit and returns `429` with `Retry-After` when exceeded.

### Daily Gift
- Daily Gift is persisted in PostgreSQL.
- Cooldown is 24 hours.
- Weighted NOTHING, Stars, FREE_SPIN and XP rewards are supported.
- Stars rewards are removed when the balance is full.
- Bonus spins are persisted and consumed server-side.
- Daily Gift traffic is rate-limited per authenticated Telegram user.

### Paid Telegram Stars
- Telegram invoice creation uses `XTR`.
- Pre-checkout validation exists in `scripts/telegram-bot.mjs`.
- Successful payments are completed through `/api/payment/complete`.
- Pending paid-spin uniqueness is protected by a partial unique index.
- Invoice and completion flows both respect the season paid-spin ON/OFF setting.
- Completion validates payload, user, season and amount before settlement.
- DEV paid-spin flow exists for QA without spending real Telegram Stars.
- `/api/payment/status` authenticates the Telegram user and exposes the exact transaction state and settled reward for a payment payload.
- Payment-status polling is rate-limited per authenticated Telegram user at a higher threshold suitable for the Mini App's post-checkout polling loop.
- Stale `PENDING` payments are intentionally kept recoverable instead of being auto-failed solely because they are old.
- A pending paid-spin reuses its stored invoice URL when available, preventing multiple invoice links for the same pending transaction.
- Paid invoice creation is rate-limited per authenticated Telegram user.
- The paid-spin settlement path uses the same dynamic season-economy selection and records selection diagnostics in the payment completion audit event.
- The user client polls the exact payment transaction after Telegram callback/timeout so a successful payment is not lost because the Mini App callback arrives late.
- If a successful Telegram payment cannot be settled because inventory disappears during the race, the bot has an explicit refund path; when the refund itself fails, the transaction remains recoverable instead of being silently marked paid.

### LiveOps / economy administration
- `/api/admin/economy` exposes live season metrics, inventory consumption, effective dynamic weights and current per-prize `currentChance` values for the current global economy state.
- Economy snapshots can be persisted with an audit record and historical snapshots can be requested from the same endpoint.
- `/api/admin/drops` supports scheduled and manual drops, cancellation and manual activation.
- Drop payloads validate prize type, quantity, amount and unit cost before insertion.
- Drop trigger values are validated for trigger semantics and bounded payload size.
- Automatic due-drop activation is executed inside the same transaction as the spin/payment settlement.
- `/api/admin/economy/simulate` exposes the simulator for controlled admin scenario testing without mutating production inventory.
- `src/server/economy-guardrails.ts` evaluates finite reward inventory coverage, Stars liability, material exposure and simulated exhaustion risk; `EMPTY` is not counted as finite reward inventory.
- `/api/internal/liveops/tick` provides a secret-protected scheduler endpoint that reconciles season states, finalizes payout/archive lifecycle and processes due drops across all live seasons inside an advisory-locked transaction, so an external cron can activate time-based operations even when no users are spinning.
- The repository's GitHub Actions scheduler now exits cleanly with an explicit configuration message when `CRICKET_BOX_APP_URL` or `LIVEOPS_CRON_SECRET` repository secrets are absent, rather than generating false-red scheduled failures; once those secrets are configured, the same workflow calls the protected tick endpoint with connection and request timeouts.

### Payouts / withdrawals
- Payout lifecycle and bulk admin processing exist.
- Withdrawal requests are restricted to post-season states and duplicate pending requests are blocked.
- Failed/cancelled Stars withdrawals return the reserved balance through the Stars ledger.
- Payout type labels distinguish Stars, Premium, Money, NFT, Physical, Custom and Free Spin.
- Manual fulfillment for Premium, money and NFT rewards remains the current model.
- Season payout orchestration now has an explicit CLOSED → PAYOUT → ARCHIVED policy guarded by outstanding payout status.

### Statistics
- `/api/admin/statistics` serves PostgreSQL-backed current-season and historical views.
- Statistics include completed vs attempted/failed spins, paid-user conversion, repeat-user rate, winner rate, and D1/D7 retention cohorts derived from first completed spins.
- D1/D7 denominators exclude immature cohorts so current-day users do not distort retention rates.
- Admin statistics UI exposes funnel and retention cards alongside operational totals.
- Participant and statistics read models were corrected for two PostgreSQL query bugs: mixed timestamp/text `COALESCE` ordering in participants and an incorrect season alias in the repeat-user predicate.

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
- Payment security CI runs the payment regression suite against a clean PostgreSQL service, including rate-limit regression coverage.
- New dynamic-selection and admin-read-model changes must finish the newest CI runs cleanly before the branch is considered verified-green.

## Important remaining production gaps

1. Real Premium/money/NFT fulfillment providers and reconciliation are not implemented.
2. Statistics are substantially expanded, but external acquisition sources/attribution and true impression/session-level funnel data are not persisted, so those cannot yet be reconstructed historically.
3. Full replay/double-click/payment-recovery security regression against the live HTTP application endpoints still needs runtime-level execution; DB-level coverage plus dedicated PostgreSQL rate-limit/payment tests are present.
4. Browser/Telegram Mini App QA and production payout/refund verification still need to be performed.
5. The frontend still contains a local mock fallback path for non-Telegram development; real Telegram flow remains server-authoritative.
6. The scheduler endpoint is implemented and the repository workflow is configuration-safe, but a deployed app URL and `LIVEOPS_CRON_SECRET` still need to be configured as repository secrets (or an equivalent external cron provider must call the endpoint) before automated production ticks occur.
7. Stars cross-season policy remains intentionally explicit at product/season level; the system does not silently reset, transfer, or burn eligible user Stars during lifecycle transitions.
8. Paid-payment inventory is not reserved at invoice time. The current safety model instead requires successful-payment completion and a compensating Telegram refund when the final prize disappears before settlement; automated reconciliation for any failed refund is still a production requirement.
9. Dynamic-economy transparency/UI still needs a final product/legal review before exposing exact numeric probabilities to users in live paid-spin flows.

## Documentation audit

- `docs/IMPLEMENTATION_STATUS.md` is the current verified implementation tracker.
- `docs/MASTER_PLAN.md` remains the product roadmap and contains historical phase descriptions; those phase labels must not be read as a statement that the current repository is still at that phase.
- `docs/MASTER_SPECIFICATION.md` remains the requirements/spec baseline; its original MVP selection model is narrower than the later specialized dynamic-economy specification and should be treated as the older baseline where the documents conflict.
- `docs/SEASON-DYNAMIC-ECONOMY.md` is the active specialized design for the dynamic season balancer, soft pity, anti-streak, scheduled drops, simulation, guardrails, transparency and auditability requirements.
- `docs/ADMIN_SPEC.md` broadly matches the implemented admin surface; provider-automated fulfillment remains intentionally outside the current implementation.
- `docs/QA_CHECKLIST.md` is a Phase 1 mock-frontend checklist and is now historical; production readiness requires the remaining runtime Telegram/browser/security checks above.
- `docs/PRODUCT_DECISIONS.md`, `docs/ECONOMICS.md`, `docs/HOME_UX.md`, `docs/PRODUCT_IDEAS.md`, and `docs/economy-roadmap.md` remain decision/requirements/future-reference documents and should be read before changing product behavior.

## Deliberately not implementing now

- Piggy Bank
- VIP
- Internal Store
- VIP Drops / Secret Events / Limited Events
- advanced Veteran economy
- referral system
- streaks / missions unless separately approved
