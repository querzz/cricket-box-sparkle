# CRICKET BOX — 2026-10-05 Repair Plan

This document is the execution plan for the runtime repair batch requested on 2026-10-05. It is based on the latest repository documentation, the current code, and the observed deployed QA failures.

## Goal

Bring the user and admin flows back to one coherent model:

**Spin → real reward → real balance / fulfillment state → season close → post-season withdrawal → readable audit/report.**

The repair must not introduce a second currency, bypass the append-only Stars ledger, or use client-only state for economic effects.

## Block 0 — Source of truth and regression guard

Read and preserve:
- docs/MASTER_SPECIFICATION.md
- docs/MASTER_PLAN.md
- docs/PRODUCT_DECISIONS.md
- docs/IMPLEMENTATION_STATUS.md
- docs/AUDIT.md
- docs/PRIZE_ENGINE.md
- docs/PRODUCT_IDEAS.md

Acceptance:
- the 2026-10-05 Product Decisions addendum is present;
- older conflicting V2/deferred notes are explicitly overridden only where the new request approved them;
- no second currency is introduced.

## Block 1 — Stars accounting and post-season withdrawal

### 1.1 Main spin rewards
A STARS prize from /api/spin and paid-spin settlement must:
1. decrement prize inventory;
2. create the completed spin;
3. append a REWARD Stars-ledger row with season_id and spin_id;
4. immediately increase user_state.stars_balance by the credited amount;
5. explicitly record capped overflow when the 500 ⭐ balance cap is hit;
6. return credited/uncredited amounts to the user.

The normal Stars prize must no longer require a manual payout action.

### 1.2 Paid spin settlement
The Telegram paid-spin path uses the same Stars ledger behavior as free/bonus spins after the prize has been selected.

### 1.3 Historical repair
Previously completed Stars prizes that were never credited because they were awaiting manual payout must be backfilled exactly once, without double-crediting already fulfilled prizes.

### 1.4 User reward history
The user session must show Stars rewards as received/credited and must not depend on a normal payout row existing for those rewards.

### 1.5 Withdrawal
Withdrawal requests are only valid in CLOSED/PAYOUT. Minimum 50 ⭐. The request atomically reserves/debits the internal balance and creates an auditable payout request. Payouts then represent the external withdrawal workflow, not the initial prize credit.

Acceptance:
- win 20 ⭐ → balance +20 ⭐ immediately;
- profile/home/admin balances show the same balance;
- duplicate spin/payment completion does not double-credit;
- a live season cannot accept withdrawal;
- a closed season can accept a withdrawal of ≥50 ⭐;
- failed/cancelled withdrawal restores the reserved Stars.

## Block 2 — Seasons, actual close time and streak

### 2.1 Actual close timestamp
Add a nullable seasons.closed_at field. It is written when a season transitions to CLOSED and is retained through PAYOUT/ARCHIVED.

The admin/manual transition and LiveOps transition must both populate it. Repeated transitions must not rewrite an existing close time.

### 2.2 Time calculations
For CLOSED/PAYOUT/ARCHIVED seasons:
- actual season horizon = starts_at → closed_at;
- no future planned days are exposed;
- timers are disabled;
- streak and report calculations use the actual horizon.

For live seasons:
- planned ends_at remains the future estimate.

### 2.3 Daily Streak
Replace the old "full season length" logic with the approved 7-day reward cycle.

Days 1–6 auto-credit on the first valid daily check-in:
1, 1, 1, 2, 2, 3 Stars.

Day 7 exposes a one-time choice:
- +5 Stars;
- +1 bonus spin;
- +20% Daily Gift chance modifier;
- one next-spin boost.

All rewards are transactional, idempotent and season-scoped.

After season close the UI must show the final state (for example, "Сезон завершён — серия остановлена") rather than 2/9 or a live flame.

Acceptance:
- a 3-day season never renders a planned day 4;
- an early close immediately freezes the streak;
- a seven-day streak can reach the choice once and cannot claim it twice;
- awarded Stars are visible in balance/audit.

## Block 3 — Admin data paths

### 3.1 Payouts
Fix the PostgreSQL parameter binding in the counts query and make the page distinguish:
- Stars balance withdrawal requests;
- manual non-Stars fulfillment;
- already-credited Stars prizes (read-only informational state, not a second payout action).

### 3.2 Balances
Show real Stars and Free Spin balances for every production user. Manual Stars correction stays OWNER-only.

### 3.3 Spins
Make the season selector use a reliable all-seasons endpoint and add Bonus filtering alongside Free/Paid. Include type, result, amount/price, user and time.

Acceptance:
- no "не удалось загрузить ... из PostgreSQL" on these three pages;
- filters return the expected production rows.

## Block 4 — Owner Gifts

Move personal gift reward application to the real owner_gifts table instead of treating JSON settings as the authoritative record.

A gift can be prepared and then issued once. Issuance is transactional and applies exactly one configured reward payload:
- Stars;
- Free Spin;
- XP;
- or message-only.

Issuance writes an audit event and exposes the resulting status/amount. Repeated clicks are idempotent.

## Block 5 — Audit readability

Resolve target context before rendering:
- user → display name / @username;
- season → season title/code;
- prize → prize title;
- payout → "Вывод Stars" or reward title.

Show human-readable event titles and descriptions first. Raw UUIDs are secondary and copyable.

Acceptance:
- an admin can understand the event without reading a UUID;
- common Stars/spin/gift/payout actions have Russian labels.

## Block 6 — Entertainment mechanics

Turn the current admin settings into a real event-capable layer without mixing it into the mandatory finite prize pool.

### Existing approved concepts
- Owner Special → connected to personal owner gifts.
- Gift or Pass → an optional event where a prepared personal gift can be passed instead of claimed; pass count is bounded by admin settings.
- Good or Bad Gift → a separate event with its own result budget/state; no debit of previously earned Stars and no hidden negative economic effect.

Where a behavior is not fully specified by current docs, the implementation must use a configurable event payload and must not invent a new currency or an unapproved liability.

Acceptance:
- toggles have a visible runtime effect;
- event state is persisted;
- repeated event actions are idempotent;
- the main prize pool accounting is unchanged.

## Block 7 — Season Report and historical consistency

Report:
- actual duration for closed seasons;
- planned duration separately where useful;
- Stars awarded to balances from the Stars ledger;
- Stars withdrawn via post-season requests;
- remove the old implication that Stars prizes await manual issuance.

Daily charts must stop at the actual close date for closed seasons.

## Block 8 — Final QA / deploy checklist

Before calling the batch complete:
1. build/typecheck/lint;
2. DB init/migrations;
3. Stars ledger regression and idempotency checks;
4. manual Mini App tests on a real user;
5. end a test season early and verify streak/report/timers;
6. win a Stars prize and verify balance immediately;
7. verify CLOSED withdrawal;
8. create/issue Owner Gift;
9. verify Audit readability;
10. verify Payouts/Balances/Spins loading;
11. verify entertainment event runtime;
12. restart web and bot services.

## Known compatibility note

There is existing historical data produced by the older Stars-manual-fulfillment model. The migration must preserve already paid withdrawals/prizes and must not duplicate any previously credited Stars. Any ambiguous historical record must be surfaced in audit rather than silently credited twice.


## Live execution status — 2026-10-05

### Implemented in repository
- Admin dashboard SSR guard fixed after the first discoverability patch.
- Stars won by Free/Bonus/Paid spins are now credited to the internal Stars balance immediately through the append-only ledger, capped at 500 ⭐.
- Historical pending Stars prize rows have a safe idempotent backfill in DB init.
- Normal Stars prizes are no longer a manual Payout item; Payouts are reserved for post-season withdrawal requests and non-Stars fulfillment.
- Withdrawal remains CLOSED/PAYOUT-only with a 50 ⭐ minimum and one pending request per user.
- Season close timestamp is persisted in `seasons.closed_at` and LiveOps/manual close paths populate it.
- Daily Streak has the approved 7-day structure, day 1–6 automatic Stars rewards, day-7 choices, one-time claim endpoint, and early-close freeze behavior.
- Daily Gift supports the +20% Streak chance modifier and one-time next-spin boost is wired into the prize engine.
- Admin Spins has a real Bonus filter and repaired season loading.
- Participants have a direct Free Spin grant action.
- Admin Audit resolves human-readable target labels and hides raw UUIDs behind a technical-ID disclosure.
- Owner Gifts use the relational PostgreSQL table transactionally, with real Stars/Free Spin/XP effects and a user claim endpoint/card.
- Entertainment events now have persistent PostgreSQL state, admin event creation, user claim/pass runtime, and a user-facing event card.
- Season Report uses actual close time for closed seasons and separates Stars balance rewards from withdrawal requests.

### Still in the repair queue
- Full production QA on every changed route after deployment.
- Refine Gift-or-Pass transfer UX (replace raw Telegram ID prompt with participant picker) and verify notifications in Telegram.
- Verify the exact Payouts/Balances/Spins runtime queries against the current production DB and test one CLOSED withdrawal end-to-end.
- Verify historical Stars backfill against real rows and inspect any ambiguous legacy records before release.
- Complete remaining Season Report edge-case checks and confirm actual close timestamps for previously closed seasons.
- Add event history/expiry administration for entertainment mechanics after the current claim/pass runtime path is verified.


### Latest implementation checkpoint

Repository implementation has now covered the main runtime path for Blocks 1–7: immediate Stars balance credits, post-season withdrawal gating, actual season close timestamps, fixed 7-day Streak with day-7 choice, repaired admin Payouts/Balances/Spins paths, transactional Owner Gifts, human-readable Audit, and persistent entertainment events. The repository has not been production-built from this interface; deployment/runtime QA remains the release gate.
