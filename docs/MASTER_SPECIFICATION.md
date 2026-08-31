# CRICKET BOX — MASTER SPECIFICATION v3.0

**Single source of truth for future development.**

## 0. Non-negotiable product decisions

- Only **Telegram Stars (⭐)** are used. There is no Cricket Credits, Cricket Points, or any second/internal currency.
- User-facing UI must be **Russian** by default. Code and variable names may remain English. Architecture must support future `en`/`uk` i18n.
- Current repository: `querzz/cricket-box-sparkle`.
- Current user frontend is an existing TanStack Start + React mock implementation. Preserve it; do not rebuild from scratch.
- Production backend, database, Telegram integration, admin panel, and production security are still missing.

## 1. Current state — already implemented

- User routes: Home, Draw, Daily Gift, My Prizes, Prize Details, Profile, Profile Sections, Settings, Withdraw.
- Reusable UI kit: CricketBox, RewardModal, StarsBalance, PrizePool, WithdrawalModal, BottomNavigation, Countdown, StatusBadge, States, etc.
- Mock service layer in `src/services/cricket-api.ts` with `ServiceResult<T>` contract.
- Mock session persistence in localStorage.
- Season UI states: DRAFT, SCHEDULED, ACTIVE, ENDING, CLOSED, PAYOUT, ARCHIVED.
- Free spin flow, paid-spin mock flow, reward reveal, Daily Gift, prize history, withdrawal UI, loading/error/edge states.
- Internal Stars cap logic exists in mock; `480 + 50` correctly yields `20 credited` and tracks `30 uncredited` in the reward object/modal.

## 2. Frontend gaps to fix before backend

1. Connect spin selection to actual `Prize.remaining/total`; decrement remaining on a real mock win; exclude exhausted prizes.
2. When Stars balance is at cap, exclude Stars prizes **before** random selection, not after selection.
3. Validate season state transitions instead of allowing arbitrary direct state assignment.
4. Extract all UI strings into `src/locales/ru.json` and `src/lib/i18n.ts` with a lightweight `t(key, params?)` layer; English/Ukrainian can be future files.
5. Make Leaderboard backend-driven; Rules/FAQ can later be season-configurable through admin instead of hardcoded constants.
6. Do not add referral/streak/missions/other retention features in this phase.

## 3. User product behavior

### Seasons
Each season is independent, e.g. CRICKET BOX #001. During the active period users can participate and spin. After the end: spins stop, results are fixed, payouts begin, Stars withdrawals become available according to rules, and the season is archived after the payout period.

### Attempts
- Default: 1 free attempt per Telegram user ID.
- Paid spins are configurable and can be enabled/disabled by admin.
- Paid-spin price is configurable in Telegram Stars.

### Prize types
- Money
- Telegram Stars
- Telegram Premium
- NFT
- Empty / no prize

Each prize has name, image, type, quantity/inventory, won count, remaining count, weight/probability, and active state.

### Internal Stars rule
There is **no separate internal currency**. The product uses Telegram Stars as the single Stars entity shown to users.

Example: `⭐ 125 / 500`.
- Default cap: 500 Stars, configurable by admin before a season starts.
- Stars can be awarded by the prize system, spent on additional spins, and withdrawn according to season rules.
- Spending Stars immediately frees capacity.
- If a reward would exceed the cap, only the available room is credited; the overflow is explicitly recorded/audited and is not converted into a second currency or bonus balance.
- When balance is full, Stars prizes are excluded from that user's eligible reward selection.

### Daily Gift
- Available only to active participants.
- Basic MVP: one claim per 24h/cooldown.
- Reward configuration must eventually be admin-controlled.
- Streak is V2, not current MVP.

### Withdrawals
- Allowed only in the configured post-season payout state.
- Minimum withdrawal configurable per season.
- User request is recorded and the Stars amount is reserved/debited atomically.
- Status flow: PENDING → PROCESSING → PAID or REJECTED; rejection requires a reason and a compensating Stars ledger reversal.
- History is immutable; records are never deleted.

### Money prize handling
Old idea `money → Stars or reroll` is **not approved for MVP**. MVP uses manual organizer resolution only. Any alternative payout/reroll requires a separate product + legal decision and must be one-time, irreversible, and explicitly exclude money from the eligible pool for that special spin. Unlimited rerolls are prohibited.

## 4. Prize engine

Recommended MVP: **weighted sampling without replacement**.

For each spin:
- only prizes with `remaining > 0` and `is_active = true` are eligible;
- effective probability is weight divided by the sum of weights for eligible prizes;
- the selected prize inventory is decremented atomically;
- exhausted prizes disappear from eligibility;
- Stars prize is excluded for users already at the Stars cap.

Required guarantees:
- no negative inventory;
- one spin produces at most one result;
- concurrent spins are safe;
- result is resolved server-side before the frontend reveal animation;
- idempotent repeated requests return the same result.

Do not use adaptive pacing in MVP unless separately approved after economic analysis.

## 5. Admin WebApp — missing and required

Separate Admin WebApp, not bot commands.

### Dashboard
- current season, status, participants, total spins, prizes remaining, payout requests;
- quick navigation;
- create-season shortcut when appropriate;
- desktop/tablet primary, mobile responsive.

### Seasons
Create/edit season with:
- code/name;
- start/end date-time;
- status;
- free attempts;
- paid spins ON/OFF;
- paid spin price in Stars;
- payout deadline hours;
- minimum withdrawal Stars;
- Stars cap;
- participation/subscription requirement and channel ID.

### Prizes
- add/edit;
- image upload;
- type;
- quantity;
- weight/probability;
- active/inactive;
- won/remaining;
- low-inventory indicator.

### Participants
- Telegram ID;
- username;
- first-seen/join date;
- season(s);
- participation status;
- free/paid spins;
- won prizes;
- current Stars balance;
- status;
- search by username/Telegram ID;
- CSV export.

Only OWNER may perform manual balance corrections, with mandatory audit logging.

### Payouts
Tabs: Money / Stars / Premium / NFT.

Columns: username, Telegram ID, prize, status, win date, season.
Statuses: PENDING / PAID / PROBLEM.

Required:
- filters All/Pending/Paid/Problem;
- search;
- checkboxes;
- select-all;
- bulk mark as paid;
- confirmation modal with exact count;
- payout summary by type;
- total/paid/remaining;
- Stars owed;
- copy/export winner list;
- immutable history.

### Statistics
Dashboard with:
- participants;
- total/free/paid spins;
- wins;
- prize distribution;
- Stars earned/spent/owed;
- withdrawal requests;
- completed payouts;
- funnel metrics such as activation, paid conversion, D1/D7 retention, payout completion, prize-pool utilization.

### Admins
Only two roles:
- OWNER — full access, manages admins, critical settings, ownership transfer.
- ADMIN — seasons, prizes, participants, payouts, statistics, normal settings.

Owner-only actions: add/remove/disable admins, transfer ownership, critical corrections.

### Audit Logs
Immutable log with:
- timestamp;
- actor admin;
- action;
- target type/id;
- before/after JSON;
- metadata/reason.

## 6. Rules for changing seasons/prizes

After first spin, do not change economics retroactively.

- Start date: immutable after season starts.
- End date: may only be extended, never shortened below current time.
- Free attempts: locked after first spin.
- Paid spins: may be switched OFF for user protection; do not turn ON mid-season if it was OFF from the start.
- Spin price: locked after first spin.
- Minimum withdrawal: locked after first spin.
- Stars cap: locked after first spin.
- Participation conditions: locked after first spin.
- Prize type: never change after first spin.
- Prize title/image: cosmetic edits allowed.
- Prize quantity cannot be reduced below already-won amount.
- Increasing quantity or changing weight after start requires OWNER + mandatory reason + audit log.

## 7. Production backend

Recommended stack:
- FastAPI
- PostgreSQL
- Redis

Architecture: `router → service → repository`.

Core services:
- SpinService
- StarsLedgerService
- SeasonService
- WithdrawalService
- AdminService

Redis responsibilities: rate limiting, active-season/prize-pool cache, optional distributed lock as an additional protection layer.

Background jobs: automatic season transitions, ledger reconciliation, payout-deadline reminders.

Monitoring: structured JSON logs, Sentry for application errors, separate immutable business audit log.

## 8. Database

Core tables:
- users
- seasons
- season_settings
- prizes
- prize_inventory
- spins
- spin_results
- stars_accounts
- stars_ledger
- payments
- withdrawals
- gifts
- gift_claims
- admins
- admin_logs
- idempotency_keys

Important invariants:
- `prize_inventory.remaining >= 0` via DB constraint.
- `spins.idempotency_key` unique per user.
- one `spin_id` → at most one result.
- `stars_ledger` append-only; no UPDATE/DELETE by application role.
- `admin_logs` append-only.
- cached Stars balance must reconcile to ledger sum.
- withdrawal creation and Stars reservation/debit happen atomically.

## 9. Stars ledger

Use one `stars_account` per user/season if the product decides balances are per-season; otherwise make the scope explicit before implementation.

Ledger entry types:
- REWARD
- SPIN_SPEND
- DAILY_GIFT
- WITHDRAWAL
- REFUND_REVERSAL
- CAPPED_OVERFLOW_BURNED
- ADMIN_CORRECTION

Example `480 + 50` at cap `500`:
- credit `20` to the account;
- record the `30` capped overflow explicitly as `CAPPED_OVERFLOW_BURNED` with metadata containing the original reward amount;
- never create a second currency.

All balance-changing operations require a DB transaction and row locking/idempotency.

## 10. Spin request flow

`request → verify user/season → validate free spin or paid entitlement → DB transaction → lock relevant account/inventory → select eligible reward → decrement inventory → create spin_result → ledger if needed → commit → return result → frontend animation`.

Client sends an idempotency key. Client never sends the claimed reward amount.

## 11. Telegram integration

Required:
- server-side validation of Telegram WebApp `initData` using the official HMAC-SHA256 procedure;
- real Telegram user ID from validated data;
- do not trust `initDataUnsafe` as source of truth;
- channel subscription verification through Bot API `getChatMember` where applicable;
- season deep link resolved by backend to active `season_id`;
- Telegram Stars payment flow using official Bot Payments API (`XTR`) if paid spins are enabled;
- `/paysupport` support flow;
- refund handling via official Stars refund mechanism.

## 12. Security

Threat model must cover:
- fake user/initData;
- replay;
- double spin;
- duplicate requests;
- race conditions;
- reward duplication;
- inventory corruption;
- Stars manipulation;
- duplicate withdrawal;
- admin impersonation;
- unauthorized admin action;
- rate abuse;
- twin/farm abuse.

All critical checks must be server-side. Frontend state is never authoritative.

## 13. Season state machine

`DRAFT → SCHEDULED → ACTIVE → ENDING → CLOSED → PAYOUT → ARCHIVED`

- `SCHEDULED → ACTIVE` automatic at start time (or explicit OWNER early activation).
- `ACTIVE → ENDING` optional automatic UI phase.
- `ACTIVE/ENDING → CLOSED` automatic at end time; spins/gifts stop and results become immutable.
- `CLOSED → PAYOUT` automatic after final verification.
- `PAYOUT → ARCHIVED` automatic at payout deadline or earlier by OWNER if all payouts are complete.
- Backward transitions require OWNER, explicit reason, and audit log; avoid them in normal operation.

## 14. Russian UI / i18n

Default UI language: Russian.

Suggested structure:
- `src/locales/ru.json`
- `src/locales/en.json` (future)
- `src/locales/uk.json` (future)
- `src/lib/i18n.ts`

All visible user/admin strings should come from translation keys. No English copy should remain in production UI.

## 15. Retention roadmap

MVP:
- Daily Gift
- reward history
- real-event social proof

V2:
- streak
- full leaderboard
- referrals with anti-fraud
- missions

Later:
- Lucky Hour
- fragments/shards
- seasonal progression

Do not overload MVP.

## 16. Roadmap / implementation order

### Phase 1 — Existing frontend gaps
Fix prize inventory, Stars-cap exclusion, season transition validation.

### Phase 2 — Russian/i18n
Extract strings, add `ru.json`, translation layer, Russian UI.

### Phase 3 — Admin WebApp
Build Dashboard, Seasons, Prizes, Participants, Payouts, Statistics, Admins, Settings, Audit Logs using mock/API contracts.

### Phase 4 — Backend foundation
FastAPI project, routers/services/repositories, OpenAPI contracts.

### Phase 5 — Database
PostgreSQL schema, migrations, constraints, indexes.

### Phase 6 — Server-side Stars + spin engine
Weighted sampling without replacement, ledger, locking, idempotency.

### Phase 7 — Connect user frontend
Replace mock service bodies with real HTTP calls while preserving the current `ServiceResult<T>` contract where practical.

### Phase 8 — Connect admin frontend
Enforce RBAC on every backend endpoint, not only in UI.

### Phase 9 — Telegram integration
initData validation, real user IDs, subscription, deep links.

### Phase 10 — Payments / payouts
Paid spins via Telegram Stars only if enabled/approved; payout handling; support/refunds.

### Phase 11 — Security
Rate limits, race/replay testing, threat-model regression.

### Phase 12 — QA
Responsive QA at 375/390/412/430px, full regression of all edge states.

### Phase 13 — Launch Season #001
Limited rollout, monitoring, then full launch.

## 17. MVP scope

- Existing user frontend with Phase 1 + Phase 2 fixes.
- Complete Russian UI/i18n foundation.
- Full Admin WebApp with all 9 core sections.
- FastAPI + PostgreSQL + Redis backend.
- Server-side weighted sampling without replacement.
- Stars ledger and 500-cap accounting.
- Withdrawals and payout administration.
- Basic Telegram initData validation, real user ID, channel subscription, season deep links.
- Daily Gift.
- Reward history.
- Manual money-prize organizer resolution only.

## 18. V2

- paid Telegram Stars spins if approved;
- streak;
- referrals;
- full leaderboard;
- missions;
- restricted alternative payout for money prizes if separately approved.

## 19. Later

- Lucky Hour
- fragments/collectibles
- seasonal progression
- advanced anti-fraud analytics
- additional languages.

## 20. Rules for future coding work

Before changing code:
1. Read this file first.
2. Inspect the current repository implementation.
3. Preserve implemented functionality unless a requirement explicitly changes it.
4. Never invent a second currency.
5. Never treat mock frontend logic as production security.
6. Keep this specification and the codebase synchronized when product decisions change.
7. Mark new decisions explicitly as approved product changes before implementation.
