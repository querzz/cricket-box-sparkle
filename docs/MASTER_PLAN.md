# CRICKET BOX — MASTER PLAN

> **Canonical specification:** see [`docs/MASTER_SPECIFICATION.md`](./MASTER_SPECIFICATION.md) (v3.0).
>
> This file is the quick roadmap. The specification above is the detailed source of truth.

## Non-negotiable product decisions

- **Only Telegram Stars (⭐).** There is no Cricket Credits, Cricket Points, CB Credits, or any second/internal currency.
- Default UI language: **Russian**; code/identifiers may remain English; architecture must be i18n-ready.
- Current repository: `querzz/cricket-box-sparkle`.
- Preserve the existing user frontend; do not rebuild it from scratch.

## Current status

### Already implemented
- User WebApp screens: Home, Draw, Daily Gift, My Prizes, Prize Details, Profile, Profile Sections, Settings, Withdraw.
- Reusable UI kit, reward reveal, loading/error/empty states.
- Mock session and service layer.
- Stars cap/overflow behavior, gift cooldown, withdrawal UI, season states, persistence, QA/dev controls.

### Still missing / to build
- Frontend fixes: real prize inventory in spin, Stars exclusion at full capacity, validated season transitions, Russian UI/i18n.
- Admin WebApp.
- Production backend/API.
- PostgreSQL + Redis.
- Server-side spin/inventory logic.
- Stars ledger/accounting.
- Telegram initData validation, real user identity, subscription verification, season deep links.
- Production payment/payout integration where approved.
- Production anti-abuse/security.

## Roadmap

1. **Finish current frontend** — fix finite prize inventory, full-balance Stars exclusion, season transition rules, Russian UI/i18n.
2. **Admin WebApp** — Dashboard, Seasons, Prizes, Participants, Payouts, Statistics, Admins, Settings, Audit Logs.
3. **Backend architecture** — API contracts, auth, RBAC, services, jobs, idempotency, rate limits, audit logging.
4. **Database** — PostgreSQL schema, constraints, indexes, transactional Stars ledger/inventory.
5. **Server-side spin + core logic** — weighted sampling without replacement, atomic inventory, season state machine, Stars accounting, gifts, withdrawals.
6. **Connect user frontend** — replace mock service calls with production API.
7. **Connect admin frontend** — same backend with strict OWNER/ADMIN permissions.
8. **Telegram integration** — validated initData, real Telegram user ID, channel subscription checks, season deep links.
9. **Payments/payouts** — Telegram Stars payments only where enabled/approved; support/refund handling; manual money-prize organizer resolution in MVP.
10. **Security + QA** — replay/race/idempotency/rate-limit/admin permission tests plus responsive regression.
11. **Launch Season #001** — limited rollout, monitoring, payout verification, then wider release.

## Rules for future coding work

Before changing code:
1. Read `docs/MASTER_SPECIFICATION.md`.
2. Inspect the current repository implementation.
3. Preserve accepted product decisions unless explicitly changed.
4. Never introduce a second currency.
5. Never treat mock behavior as production security.
6. Do not claim a feature is implemented without verifying the code.
7. Update documentation when an approved product decision changes.
