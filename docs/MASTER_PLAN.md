# CRICKET BOX — MASTER PLAN

Status: product planning baseline
Current repository: `querzz/cricket-box-sparkle`
Primary UI language: Russian

## 1. Product decision: one Stars system only

There is NO separate internal currency such as Cricket Credits, Cricket Points, or CB Credits.

The product uses Telegram Stars (`⭐`) as the only Stars currency concept in the product.

Visible balance example:

`⭐ 125 / 500`

The product must keep the reward/spending/withdrawal model clearly defined and must not introduce a second virtual currency.

Important implementation distinction:
- Product logic must distinguish user-facing Cricket Box Stars balances/entitlements and Telegram payment operations in backend data structures where needed.
- Never silently treat frontend state as authoritative.

## 2. Current implementation baseline — already built

The current repository contains the user-facing frontend and mock layer.

Implemented user routes include:
- Home
- Draw
- Daily Gift
- My Prizes
- Prize Details
- Profile
- Profile Sections
- Settings
- Withdraw

Implemented supporting UI/components include:
- CricketBox
- BottomNavigation
- Countdown
- GiftCard
- GlassCard
- Modal / ConfirmModal
- PrimaryButton
- PrizePool
- ProfileHeader
- RewardCard
- RewardModal
- Sparkles
- StarsBalance
- States
- StatusBadge
- WithdrawalModal

Mock/frontend functionality already implemented and browser-tested:
- free spin
- paid spin using Stars in mock flow
- reward reveal animation
- daily gift with cooldown
- Stars balance display and 500 cap behavior
- Stars spending on spins
- withdrawal UI and pending withdrawal state
- season UI states
- loading/error/empty states
- network error simulation
- mock session persistence across reload
- developer testing controls
- modal layering/portal fix

## 3. Known current gaps in the frontend

These must be fixed before production backend integration:

1. Prize pool is currently decorative in the mock implementation. Real spin selection does not consume `remaining` inventory.
2. Stars rewards are capped after selection, but when balance is full they are not excluded from the reward selection pool.
3. Season state currently allows arbitrary dev-state jumps; production needs an explicit transition machine.
4. User UI is currently English/hardcoded; production UI must be Russian with an i18n-ready architecture.
5. Profile sections such as leaderboard/rules/FAQ currently use local/mock data and must become backend-driven where appropriate.
6. Mock session/service state is not a substitute for production backend state.

## 4. Proposed retention feature — daily free spin

**Proposed for MVP/product testing:** active participants may receive **1 free spin per day** while the season is active, instead of only 1 free spin for the entire season.

This is a product decision to evaluate because it can materially improve daily retention, but it must be economically safe.

Rules to design:
- at most 1 free spin granted per user per UTC/calendar season day (exact timezone policy must be fixed before production);
- only active participants of the current season qualify;
- no unused daily free spins accumulate indefinitely unless explicitly configured;
- free spin availability resets each day;
- season close immediately stops future free spins.

### Prize-pool safety for daily free spins

Daily free spins do **not** mean the prize pool should automatically be emptied early. The system must treat the prize pool and season budget as separate constraints.

Before launch, the admin must see:
- expected maximum free spins = eligible participants × remaining active days (with configured caps/eligibility);
- expected paid spins separately;
- total maximum possible spins;
- prize-pool size and expected liability;
- warning when the configured prize inventory/budget is inconsistent with the projected number of spins.

The engine remains finite-inventory based: a prize with `remaining = 0` cannot be selected. The existence of daily free spins therefore consumes attempts, not guaranteed prize inventory. There may still be `EMPTY` outcomes after some prizes are exhausted.

The admin should be able to configure whether daily free spins are enabled and optionally cap the maximum free spins per user/season.

Do NOT solve prize depletion by secretly changing probabilities or inventing rewards. Any pacing or guaranteed-distribution change requires an explicit future product decision.

## 5. Proposed retention feature — Season Veteran / loyalty buffs

**Proposed for V2:** reward active users of previous seasons with small benefits in the next season.

Core idea:
- activity in Season #001 contributes to a persistent user `veteran_level` / reputation;
- at the beginning of Season #002, the user receives a small configurable buff based on the previous season(s);
- the buff improves retention without making new users hopelessly disadvantaged.

Potential tiers (examples only, to be finalized):
- Newcomer — no previous participation;
- Active — previous season participation threshold met;
- Veteran — higher activity threshold;
- Elite — top activity threshold.

Possible buffs:
- +1 starting free spin;
- improved Daily Gift value/chance for a limited number of days;
- special Veteran Gift;
- limited extra non-monetary convenience benefits.

Strict rules:
- do NOT transfer old-season Stars into a new season automatically;
- do NOT transfer unused paid/free spin balances across seasons;
- do NOT give large permanent advantages;
- do NOT increase jackpot/rare-prize probability solely because of veteran status unless separately approved and legally reviewed;
- buffs must be configurable per season in admin;
- all veteran calculations should be auditable.

This feature remains PROPOSED/V2 until the exact buff table and cross-season Stars policy are explicitly approved.

## 6. Admin WebApp — missing, must be built

Create a separate Admin WebApp interface. It must be visual, not bot-command based.

### Dashboard
- current season
- status
- participant count
- total spins
- remaining prizes
- payout requests
- navigation to all admin sections
- projected maximum free spins and season budget/liability warnings once daily free spins are enabled

### Seasons
Admin-configurable:
- season ID/name
- start date/time
- end date/time
- status
- free attempts mode (per-season vs daily)
- daily free spin enabled/disabled
- optional free-spin cap per user/season
- paid spins enabled/disabled
- spin price
- payout deadline
- minimum Stars withdrawal
- Stars cap
- participation conditions
- veteran/loyalty buff settings when V2 is enabled

### Prizes
Admin-configurable:
- name
- type
- image
- total quantity
- remaining
- won count
- probability/weight
- active/inactive

Prize types:
- Money
- Stars
- Telegram Premium
- NFT
- Empty

### Payouts
Categories:
- Money
- Stars
- Premium
- NFT

Fields:
- username
- Telegram ID
- reward
- status
- win date
- season

Statuses:
- PENDING
- PAID
- PROBLEM

Required:
- single payout action
- checkbox selection
- multi-select
- select all
- mass mark as paid
- confirmation before mass actions
- filters
- search by username / Telegram ID
- payout summary
- copy/export winner list
- persistent payout history

### Participants
Show:
- Telegram ID
- username
- join date
- season
- participated
- spin count
- won rewards
- Stars balance
- status
- veteran level/reputation when V2 is enabled

### Admin roles
Only two roles:
- OWNER
- ADMIN

OWNER can also:
- add/remove admins
- disable admins
- change critical permissions
- transfer ownership

ADMIN can:
- seasons
- prizes
- participants
- payouts
- statistics
- settings

### Admin management
- add by Telegram ID/username
- remove
- temporarily disable
- audit log

### Statistics
- participants
- total spins
- free spins
- paid spins
- wins
- prize distribution
- Stars won
- Stars spent
- Stars owed for payout
- withdrawal requests
- completed payouts
- daily free-spin participation/retention metrics once enabled
- veteran cohort retention metrics once V2 is enabled

## 7. Backend — missing

Recommended target architecture:
- FastAPI
- PostgreSQL
- Redis

The backend becomes authoritative for all critical state.

Responsibilities:
- Telegram identity validation
- authorization
- season lifecycle
- prize inventory
- spin resolution
- Stars accounting
- withdrawals
- payments
- gifts
- daily free spins
- veteran/reputation logic when enabled
- admin permissions
- audit logs
- rate limiting
- idempotency
- concurrency protection

## 8. Database baseline

Minimum entities to design and implement:
- users
- seasons
- season_settings
- prizes
- prize_inventory
- spins
- spin_results
- stars_accounts
- stars_ledger
- gifts
- gift_claims
- withdrawals
- payments
- admins
- admin_logs

When daily free spins are enabled, add the minimum persistent state needed to enforce one grant per user per day without relying on localStorage.

When veteran progression is enabled, add a persistent season participation/activity summary or equivalent auditable source for deriving veteran status.

Stars accounting must use an append-only ledger rather than trusting direct mutable frontend balance.

Examples of ledger events:
- REWARD
- SPIN_SPEND
- DAILY_GIFT
- WITHDRAWAL
- REFUND/REVERSAL where applicable
- CAPPED_OVERFLOW_BURNED when a reward exceeds available Stars capacity
- ADMIN_CORRECTION

## 9. Internal/Telegram Stars rules

- one Stars system only
- configurable maximum, default 500
- example balance: `125 / 500`
- Stars can be won
- Stars can be spent on additional spins
- spending Stars immediately frees capacity
- withdrawal is available according to season rules
- no secondary bonus balance
- no conversion into another in-app currency

Overflow example:
`480 + 50`
→ `20` credited
→ `30` explicitly recorded as uncredited/capped overflow

When balance is full:
- Stars rewards should be excluded from reward selection for that user
- after spending Stars, capacity becomes available again

Cross-season policy for Stars must be explicitly decided before production. Do not silently reset, transfer, or burn a user's eligible Stars at season transition.

## 10. Spin engine

Production result must be server-side and fixed before frontend reveal.

Required protections:
- unique spin ID
- idempotency key
- transaction
- concurrency-safe prize inventory
- no negative inventory
- exhausted prizes removed from selection
- balance rules enforced server-side
- frontend never decides authoritative reward

Candidate models to evaluate before implementation:
1. fixed weighted probability
2. weighted sampling without replacement
3. adaptive pacing
4. pre-generated tickets

Current project preference for MVP: **weighted sampling without replacement**, subject to final economic/legal review.

Daily free spins do not guarantee that every prize will be awarded. The engine only guarantees that exhausted inventory cannot be selected and that all outcomes follow the configured selection model.

## 11. Season state machine

States:
- DRAFT
- SCHEDULED
- ACTIVE
- ENDING
- CLOSED
- PAYOUT
- ARCHIVED

Production requirements:
- explicit allowed transitions
- automatic transitions based on time where appropriate
- immutable result history after close
- spins disabled after close
- daily free-spin grants disabled after close
- gift disabled after close
- payout enabled according to payout phase
- archived season remains queryable

## 12. Telegram integration — missing

Need:
- Telegram Mini App / WebApp integration
- server-side `initData` validation
- real Telegram user ID
- channel subscription verification
- season deep links / source tracking
- Telegram Stars payment flow for paid features if enabled
- payment verification
- support/refund handling as required by Telegram

Never trust `initDataUnsafe` or a frontend-supplied user ID as authoritative.

## 13. Money prizes

Current proposal is NOT automatically locked in.

The old idea “money prize → Stars equivalent OR reroll” requires separate product/legal review before implementation.

For now prefer a clearly defined manual resolution flow unless a later decision explicitly approves another mechanism.

Do not implement repeated rerolls that can be abused.

## 14. Anti-abuse / security

Must protect against:
- duplicate clicks
- replay
- duplicate requests
- race conditions
- manipulated frontend state
- fake Telegram identity/initData
- duplicate withdrawals
- reward duplication
- inventory corruption
- rate abuse
- referral farming
- unauthorized admin actions
- abuse of daily free-spin grants
- abuse of veteran buffs

All balance changes and critical operations must be server-authoritative and transactional.

## 15. Russian UI / i18n

All visible user UI must be Russian.

All visible admin UI must be Russian.

Code, variable names, database identifiers, and component names remain English.

Create an i18n-ready structure, e.g.:
- `src/locales/ru.json`

Future languages can be added later without rewriting components.

## 16. Retention roadmap

MVP candidates under controlled testing:
- Daily Gift
- reward history
- social proof only when based on real events
- daily free spin if approved after economic simulation

V2 candidates:
- Season Veteran / loyalty buffs
- streak
- referrals
- leaderboard improvements
- missions
- fragments/shards
- limited events / lucky hour

Later:
- seasonal progression
- more advanced gamification

Do not overload MVP.

## 17. Production roadmap

### Phase 1 — Finish current frontend
- connect mock reward selection to finite prize inventory
- exclude Stars rewards at full capacity
- enforce valid season transitions in production-shaped logic
- Russian UI + i18n
- decide/test daily free-spin model and season budget projection

Acceptance: user frontend behavior matches the documented product rules without decorative/mock contradictions.

### Phase 2 — Admin WebApp
Build the complete admin frontend on mock/API contracts:
- Dashboard
- Seasons
- Prizes
- Participants
- Payouts
- Statistics
- Admins
- Settings
- Audit Logs
- daily-free-spin configuration and projected budget warnings
- veteran settings UI behind V2/feature flag when approved

Acceptance: administrator can simulate full season setup, prize configuration, daily free-spin configuration, and payout workflows without editing code.

### Phase 3 — Backend architecture
Define API contracts, auth, authorization, services, jobs, rate limits, idempotency, audit logging.

### Phase 4 — Database
Implement PostgreSQL schema and transactional Stars ledger/inventory.

### Phase 5 — Server-side spin + core logic
Implement authoritative spin, prize pool, season state machine, Stars accounting, gifts, withdrawals, daily free spins.

### Phase 6 — Connect user frontend
Replace mock service calls with production API while preserving current UI contracts where practical.

### Phase 7 — Connect admin frontend
Use the same backend/database with strict role permissions.

### Phase 8 — Telegram integration
WebApp auth, subscription verification, season links, Telegram Stars payment where enabled.

### Phase 9 — Security + QA
Load tests, race-condition tests, replay tests, admin permission tests, responsive QA across target viewports.

### Phase 10 — Launch
Limited-audience Season #001, monitoring, payout verification, then wider release.

## 18. Source of truth rules

This file is the project baseline.

When modifying code:
1. Inspect the current repository state.
2. Check this master plan and `docs/MASTER_SPECIFICATION.md`.
3. Preserve accepted product decisions unless explicitly changed.
4. Clearly mark new proposals as proposals before treating them as requirements.
5. Never reintroduce a second currency.
6. Never treat mock frontend behavior as production security.
7. Never claim a feature is implemented unless verified in code.
8. New cross-season mechanics (including veteran buffs) require explicit approval before moving from PROPOSED/V2 to MVP.
9. Daily free-spin economics must be simulated before enabling it for a live season.
