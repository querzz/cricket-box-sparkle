# CRICKET BOX — ECONOMICS MODEL

Status: planning model for Season #001
Repository: `querzz/cricket-box-sparkle`

This document complements:
- `docs/MASTER_SPECIFICATION.md`
- `docs/MASTER_PLAN.md`
- `docs/PRODUCT_DECISIONS.md`

It contains the current economic model and simulation assumptions. Numbers marked as planning assumptions are NOT locked production settings until explicitly approved.

## 1. Product economics principles

- Only Telegram Stars (`⭐`) are used. No second/internal currency exists.
- Free spins are a retention/acquisition mechanism, not direct revenue.
- Paid spins are the direct monetization mechanism when enabled and legally/technically approved.
- Prize inventory is finite; an exhausted reward is removed from the eligible pool.
- A single reward type reaching zero does NOT automatically end the season.
- Do not secretly alter probabilities to conceal depletion.
- Tiny 1–3 ⭐ rewards are not planned for Season #001 while the production Stars reward/payout mechanism is being finalized.
- Economic decisions must be evaluated using scenarios rather than intuition alone.

## 2. Current planning baseline for Season #001

Current audience: approximately 200 Telegram channel members.

Planning assumptions:
- target participants: ~150 (scenario range 100–200)
- season duration: 14 days
- free spins: 1 per active participant per active day
- expected average daily activity/return: 50% baseline, 30–70% scenario range
- paid spin price: **100 ⭐ is the current preferred starting test**, with 75 ⭐ retained as a lower-price comparison scenario; final price is not permanently locked
- expected paid conversion and paid spins are scenario variables, not guarantees
- NFT is not planned for the first season by default; revisit for larger audience/Season #002

## 3. Free-spin volume

Formula:

`expected free spins = participants × active days × average daily activity rate`

For 150 target participants and 14 days:

| Daily activity | Expected free spins |
|---:|---:|
| 30% | 630 |
| 50% | 1,050 |
| 70% | 1,470 |
| 100% maximum | 2,100 |

Planning baseline: approximately **1,050 expected free spins** at 50% average daily activity.

A 20% planning buffer gives:

`1,050 × 1.20 = 1,260 planning free spins`

The absolute maximum remains 2,100 for 150 participants over 14 days.

## 4. Paid-spin scenarios

Paid spins are modeled independently from free-spin volume.

### Conservative
- 15% of 150 participants buy
- average 2 paid spins per buyer
- ~45 paid spins

### Baseline
- 25% of 150 participants buy
- average 3 paid spins per buyer
- ~113 paid spins

### Strong
- 40% of 150 participants buy
- average 4 paid spins per buyer
- ~240 paid spins

These are modeling scenarios only. Real conversion must be measured after launch.

## 5. Revenue model

Gross Stars charged from paid spins:

`paid spins × paid spin price`

Illustrative gross volumes:

| Paid spins | 50 ⭐ | 75 ⭐ | **100 ⭐** |
|---:|---:|---:|---:|
| 100 | 5,000 ⭐ | 7,500 ⭐ | **10,000 ⭐** |
| 200 | 10,000 ⭐ | 15,000 ⭐ | **20,000 ⭐** |
| 300 | 15,000 ⭐ | 22,500 ⭐ | **30,000 ⭐** |
| 500 | 25,000 ⭐ | 37,500 ⭐ | **50,000 ⭐** |

These are gross user charges, not a promise of net developer proceeds. Production economics must use Telegram's current revenue/withdrawal data and actual bot revenue status rather than a hardcoded historical rate.

## 6. Break-even model

For planning:

`total season cost = cash prize cost + Premium/NFT procurement + Stars prize liability + Daily Gift budget + operational reserve + other approved costs`

`break-even paid spins = total season cost / net economic value per paid spin`

The exact net economic value per paid spin must be calculated from the real Telegram Stars revenue available to the bot. Do NOT hardcode a fixed Stars→USD conversion into product logic.

Current Telegram client configuration exposes a `stars_usd_withdraw_rate_x1000` value and a `withdrawal_min`; these should be read from current Telegram-supported behavior at implementation/reconciliation time, not copied as fixed product constants. citeturn648383search0turn648383search2

## 7. Season #001 candidate prize pool — BALANCED

Current preferred simulation pool for a ~2,000-outcome planning volume:

| Reward | Quantity | Meaningful winner share |
|---|---:|---:|
| 500 UAH | 1 | 0.05% |
| Premium 3M | 1 | 0.05% |
| 100 ⭐ | 2 | 0.10% |
| 50 ⭐ | 5 | 0.25% |
| 20 ⭐ | 11 | 0.55% |
| **Total meaningful winners** | **20** | **1.00%** |
| Empty | 1,980 | 99.00% |
| **Total finite outcomes** | **2,000** | **100%** |

Known procurement costs supplied by product owner:
- Premium 3 months: 14 CHF
- Premium 6 months: 18 CHF
- NFT: $9–12
- cash prize example: 500 UAH

NFT is deferred from Season #001 by default.

### Stars liability in this candidate pool

`2×100 + 5×50 + 11×20 = 670 ⭐`

This is the maximum Stars reward liability of the candidate pool if every Stars outcome is awarded.

## 8. Exact MVP sampling model for the candidate pool

For the Season #001 simulation, model the 2,000-outcome pool as **2,000 finite outcome units** with equal unit weight:

- 1 unit = 500 UAH
- 1 unit = Premium 3M
- 2 units = 100 ⭐
- 5 units = 50 ⭐
- 11 units = 20 ⭐
- 1,980 units = Empty

Each spin draws one eligible unit **without replacement**.

This means the starting probabilities are exactly:

| Reward | Starting probability |
|---|---:|
| 500 UAH | 1 / 2,000 = **0.05%** |
| Premium 3M | 1 / 2,000 = **0.05%** |
| 100 ⭐ | 2 / 2,000 = **0.10%** |
| 50 ⭐ | 5 / 2,000 = **0.25%** |
| 20 ⭐ | 11 / 2,000 = **0.55%** |
| Any meaningful reward | 20 / 2,000 = **1.00%** |
| Empty | 1,980 / 2,000 = **99.00%** |

After every spin, the selected unit is removed. Therefore the exact next-spin probability is:

`remaining eligible units for reward / total remaining eligible units`

No hidden pacing or probability manipulation is used.

When a reward reaches `remaining = 0`, its probability becomes exactly 0.

### User-specific Stars-cap rule

If a particular user is already at the Stars cap, all Stars units (100/50/20) are excluded from that user's eligible set before sampling. The total denominator is recalculated from the remaining eligible units for that user.

If the user later spends Stars and creates capacity, Stars units become eligible again subject to global inventory remaining.

## 9. Prize-pool behavior by season volume

For the candidate 20-main-winner pool:

| Total spins completed | Maximum meaningful winners available | Winner density relative to completed spins |
|---:|---:|---:|
| 1,000 | up to 20 | up to 2.00% if all winners happen to be drawn |
| 1,500 | up to 20 | up to 1.33% |
| 2,000 | 20 | 1.00% |
| 3,000 | 20 | 0.67% or lower because the finite pool has only 20 meaningful winners |

Important: these percentages describe the finite pool's total winner inventory versus completed spins, not a promise that the first N spins will contain exactly N×1% winners. The order is random without replacement.

## 10. Daily free-spin safety model

Daily free spins create attempt volume, not guaranteed prize distribution.

Admin planner must calculate:

`maximum free spins = eligible participants × active season days`

`expected free spins = participants × days × expected daily activity`

`expected total spins = expected free spins + expected paid spins`

`planning total spins = expected total spins × safety multiplier`

Suggested initial safety multiplier: 1.20, subject to revision after real Season #001 data.

Example:

150 participants × 14 days × 50% activity = 1,050 expected free spins.

With 20% planning buffer:

1,050 × 1.20 = 1,260 planning free spins.

The 2,000-outcome candidate pool therefore provides an initial planning headroom above the baseline scenario. A stress case with maximum participants/activity must still be shown in admin.

## 11. Participant-cap safety

Season #001 should support a configurable maximum eligible participant count.

Reason:
If the channel unexpectedly grows from ~200 members to thousands during a live season, unlimited daily free spins could multiply economic exposure unexpectedly.

Admin planner should show:
- target participants
- maximum eligible participants
- expected spins
- maximum free spins
- expected paid spins
- planning spins
- prize liability
- estimated Stars revenue
- break-even paid spins
- break-even conversion
- projected margin
- status: HEALTHY / LOW MARGIN / LOSS RISK

## 12. Economic Planner — required Admin feature

The Admin WebApp should include an economic simulator.

Inputs:
- target participants
- maximum participants
- season duration
- free spins/day
- expected daily activity/retention
- paid spins enabled
- paid spin price
- paid conversion
- average paid spins per buyer
- prize quantities
- prize costs
- Stars prize liability
- Daily Gift budget
- optional safety multiplier

Outputs:
- expected free spins
- maximum free spins
- expected paid spins
- expected total spins
- planning spins
- gross Stars charged
- current estimated developer revenue using the current approved Telegram model
- cash prize cost
- Premium cost
- NFT cost
- Stars prize liability
- Daily Gift liability
- total expected season cost
- break-even paid spins
- break-even paid conversion
- projected margin
- worst-case exposure
- prize-pool utilization
- warnings

Example status logic:
- HEALTHY: projected margin comfortably positive under baseline assumptions
- LOW MARGIN: positive but below configured safety margin
- LOSS RISK: projected baseline or stress case is negative

The planner must show the assumptions used so the admin can understand why the result was produced.

## 13. Scenario matrix for Season #001

### 150 participants, 14 days

| Scenario | Daily activity | Free spins | Paid conversion | Avg paid spins | Paid spins |
|---|---:|---:|---:|---:|---:|
| Conservative | 30% | 630 | 15% | 2 | ~45 |
| Baseline | 50% | 1,050 | 25% | 3 | ~113 |
| Strong | 70% | 1,470 | 40% | 4 | ~240 |

Add a separate stress case with maximum participants and 100% daily activity for worst-case exposure.

## 14. Paid-spin price decision

### Preferred starting test: **100 ⭐**

Reason:
- 15 ⭐ is too low to support meaningful prizes under the currently documented Telegram Stars withdrawal-value model for a very small audience.
- 75 ⭐ remains a useful lower-price comparison scenario.
- 100 ⭐ provides materially more economic headroom while keeping the entire price configurable in admin.

Do NOT permanently hardcode 100 ⭐ into code.

The Admin Economic Planner must model at least:
- 50 ⭐
- 75 ⭐
- 100 ⭐

and show how changes in price alter conversion, paid-spin volume, revenue, break-even and margin.

The first live season should preferably use one price rather than changing it mid-season, so results are interpretable.

## 15. Break-even targets for the candidate balanced pool

Candidate main-pool costs currently include:
- 500 UAH cash prize
- Premium 3M at 14 CHF
- Stars liability of 670 ⭐
- no NFT by default

Because the exact developer revenue from paid Stars must be taken from the live bot's revenue status, the system should calculate break-even from live/approved revenue data rather than a fixed historical USD conversion.

Operational planning target:
- build for positive baseline margin;
- keep enough headroom to absorb refunds, support and unexpected prize cost;
- if baseline margin is negative, reduce prize liability or raise/retest monetization assumptions before launch.

The target is NOT to guarantee a specific dollar profit from a fixed number of spins; it is to make the planner show exactly what conditions are required for positive economics.

## 16. Daily Gift budget

Daily Gift is a separate economic pool from spin prizes.

The admin planner should separately track:
- gift claims
- expected claims
- gift reward liability
- gift budget

Do not silently borrow from the main prize pool to fund Daily Gift rewards.

## 17. Veteran / Founder economics

Veteran and Founder mechanics should primarily use low-cost retention value:
- cosmetic badge
- profile status
- limited next-season convenience bonus
- special gift

Avoid direct transfer of old Stars or permanent economic advantages.

A future free-spin bonus has an economic cost and must be represented in the planner as projected additional attempt volume.

## 18. What is currently approved vs provisional

Approved directions:
- 1 free spin/day as the preferred product direction for testing
- separate Daily Gift
- finite prize inventory
- no tiny 1–3 ⭐ rewards in Season #001
- economic planner
- target/max participant controls
- no hidden probability manipulation
- Veteran/Founder as retention concepts, with Veteran primarily V2
- 20 meaningful winner units as the current balanced simulation target
- 2,000 finite-outcome planning pool as the current balanced simulation target

Provisional / requires explicit approval:
- final paid spin price (100 ⭐ preferred; 75 ⭐ comparison)
- exact number of participants for #001
- exact prize quantities
- exact Stars prize mix
- whether Premium is 3M or 6M
- exact cash prize budget
- whether NFT appears in #001
- exact safety multiplier
- exact free-spin pause/budget threshold
- final cross-season Stars policy

## 19. Next economics step

Before finalizing Season #001, run the planner for at least:
- 100 / 150 / 200 / 500 / 1,000 participants
- 7 / 14 / 30 days
- 30% / 50% / 70% daily activity
- multiple paid conversion rates
- multiple average paid-spins-per-buyer values
- 75 / 100 ⭐ paid-spin price

The output should identify the smallest prize budget that still creates an attractive reward experience while keeping baseline economics positive and worst-case exposure controlled.

## 20. Implementation note for developers

The finite-outcome pool should be represented in data as inventory units and sampled without replacement. Do not implement the above probabilities as independent `Math.random()` percentages that ignore inventory.

For production:
- reward selection is server-side;
- inventory decrement and spin result creation are atomic;
- repeated requests are idempotent;
- frontend only animates the already-resolved result.
