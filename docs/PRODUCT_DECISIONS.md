# CRICKET BOX — APPROVED PRODUCT DECISIONS

This file records product decisions approved after the initial MASTER SPECIFICATION. It must be checked together with `docs/MASTER_PLAN.md` and `docs/MASTER_SPECIFICATION.md` before future product or coding work.

## 1. Stars — one currency only

There is only one Stars concept in the product: **Telegram Stars (⭐)**.

Do NOT introduce:
- Cricket Credits
- Cricket Points
- CB Credits
- any second virtual currency

User-facing balance example:

`⭐ 125 / 500`

The 500 value is the default configurable capacity/cap defined by the product rules. Production implementation must respect the final Telegram-supported payout/payment model and legal review.

## 2. Daily free spin

Approved as a product direction for testing/MVP economics:

- An active participant can receive **1 free spin per active season day** instead of only one free spin for the entire season.
- Unused daily free spins do not accumulate unless a later product decision explicitly enables accumulation.
- Season close immediately stops future free-spin grants.
- The rule must be enforced server-side in production, not with localStorage.
- Exact calendar/timezone behavior must be fixed before production launch.

### Prize-pool safety

Daily free spins increase the maximum number of attempts but do NOT guarantee that the prize pool will be fully distributed.

For every season the Admin WebApp must show:
- target participants;
- season duration;
- expected daily return/retention assumption;
- expected free spins;
- maximum free spins;
- expected paid spins (when enabled);
- planning spin volume;
- prize-pool size;
- expected prize liability;
- warning when the configured prize pool/budget is inconsistent with projected volume.

A prize with `remaining = 0` is removed from selection. Other rewards and `EMPTY` can continue after a particular prize is exhausted.

The system must NOT secretly alter probabilities or invent rewards merely to prevent the pool from ending early.

The admin may have a configurable season-level safety/budget switch that can pause new free-spin grants when a predefined safe exposure threshold is reached. The exact budget formula must be approved before production.

## 3. First-season planning baseline

Current audience is approximately **200 Telegram channel members**. This is not the same as guaranteed season participants.

For planning only, a first test season can be modeled around:
- ~150 target participants;
- 14 days;
- 1 free spin/day;
- approximately 50–70% average daily return as a planning range;
- expected free spins around 1,050–1,260 depending on the retention assumption;
- an additional safety margin before final prize-pool sizing.

These numbers are NOT locked production settings. They are a starting point for simulation.

## 4. Prize pool for Season #001 — provisional direction

Do not use tiny Stars rewards (for example 1–3 ⭐) in the first season while the production mechanism for Stars rewards/payouts is still being finalized.

Prefer a small number of meaningful Stars rewards, e.g.:
- 50 ⭐
- 100 ⭐

plus a limited number of:
- Money rewards;
- Telegram Premium;
- NFT;
- `EMPTY` outcomes.

Example only, NOT a final locked pool:
- 500 UAH × 1
- Premium 3M × 2
- NFT × 1
- 50 ⭐ × 3
- 100 ⭐ × 1
- `EMPTY` for the remaining outcomes.

Final quantities, costs, and Stars payout rules require economic simulation and product/legal approval.

## 5. Prize depletion policy

Do NOT close the season merely because one reward type reaches zero.

Rules:
- `remaining = 0` → reward is excluded from the spin pool;
- other available rewards remain eligible according to the configured model;
- `EMPTY` may remain available throughout the season;
- if the overall season safety/budget threshold is reached, the system may pause new free spins according to an explicitly configured rule;
- no hidden probability manipulation to conceal an exhausted prize pool.

## 6. Veteran / Loyalty system

Approved as a **V2 retention feature**.

Activity in previous seasons can create a persistent veteran level/reputation that grants small configurable benefits in the next season.

Potential tiers (to finalize later):
- Newcomer
- Active
- Veteran
- Elite

Potential benefits:
- +1 starting free spin;
- improved Daily Gift for a limited period;
- special Veteran Gift;
- cosmetic badge/status;
- other small non-economic conveniences.

Strict rules:
- old-season Stars are NOT automatically transferred by this feature;
- old unused spins are NOT transferred;
- veteran status must NOT provide a large permanent advantage;
- veteran status must NOT automatically increase jackpot/rare-prize probability;
- exact buffs are configurable per season and auditable;
- feature stays behind V2/feature flag until explicitly approved.

## 7. Founder / early-community recognition

Potential extension for Season #001 participants:

A non-economic **Founder / Early Supporter badge** can be retained into later seasons.

Purpose:
- reward early participation;
- create identity/community status;
- improve return rate;
- do not create an unfair economic advantage.

This is a low-risk V2 candidate and must remain cosmetic unless explicitly expanded.

## 8. Economic simulation required before enabling daily free spins live

Before production launch, simulate at least:
- 100 participants;
- 200 participants;
- 1,000 participants;
- 10,000 participants;

and season lengths:
- 7 days;
- 14 days;
- 30 days.

For each scenario calculate:
- maximum free spins;
- expected free spins under multiple retention assumptions;
- expected paid spins under multiple conversion assumptions;
- total spins;
- prize-pool utilization;
- Stars awarded;
- Stars spent;
- Stars payout liability;
- cash/premium/NFT reward liability;
- projected gross Stars revenue from paid spins;
- safety margin / worst-case exposure.

No live season budget should be finalized from intuition alone.

## 9. Current product priority

Do NOT add more retention mechanics before these are resolved:
1. daily free-spin economics;
2. final Stars payout/payment model;
3. finite prize-pool behavior;
4. Russian UI/i18n;
5. Admin WebApp.

After those are stable, evaluate V2 mechanics such as Veteran, streak, referrals, missions, leaderboard improvements, and limited events.

## 10. Source-of-truth rule

These decisions are approved unless explicitly changed in a later product decision.

Future coding work must:
1. read `docs/MASTER_SPECIFICATION.md`;
2. read `docs/MASTER_PLAN.md`;
3. read this file;
4. inspect the current code;
5. preserve approved decisions;
6. label new ideas as PROPOSED until approved.
