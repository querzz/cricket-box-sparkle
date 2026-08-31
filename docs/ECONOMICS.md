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
- target participants: ~150
- season duration: 14 days
- free spins: 1 per active participant per active day
- expected average daily activity/return: 50% baseline, 30–70% scenario range
- paid spin price: 75–100 ⭐ candidate range; final price not yet approved
- expected paid conversion and paid spins are scenario variables, not locked settings
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

Planning range for Season #001: approximately 1,050–1,260 free spins, using 50–60% average daily activity as a working planning range.

The absolute maximum is still useful for risk analysis: 2,100 free spins for 150 participants over 14 days.

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

### Target / strong
- 40% of 150 participants buy
- average ~4 paid spins per buyer
- ~240 paid spins

These are modeling scenarios only. Real conversion must be measured after launch.

## 5. Revenue model

Gross Stars from paid spins:

`paid spins × paid spin price`

Illustrative values:

| Paid spins | 50 ⭐ | 75 ⭐ | 100 ⭐ |
|---:|---:|---:|---:|
| 100 | 5,000 ⭐ | 7,500 ⭐ | 10,000 ⭐ |
| 200 | 10,000 ⭐ | 15,000 ⭐ | 20,000 ⭐ |
| 300 | 15,000 ⭐ | 22,500 ⭐ | 30,000 ⭐ |
| 500 | 25,000 ⭐ | 37,500 ⭐ | 50,000 ⭐ |
|
These are gross user charges in Stars, not a promise of net developer proceeds. Actual developer revenue must be modeled using Telegram's current revenue/withdrawal rules at implementation time.

## 6. Break-even model

For planning, define:

`total season cost = cash prize cost + Premium/NFT procurement + Stars prize liability + operational reserve + other approved costs`

`break-even paid spins = total season cost / net economic value per paid spin`

The exact net economic value per paid spin must be calculated from the actual Telegram payment/revenue mechanics used in production. Do NOT hardcode a historical Stars→USD conversion into product logic.

## 7. Provisional Season #001 prize direction

Preferred first-season shape:

- 500 UAH × 1
- Premium 3 months × 1
- 100 ⭐ × 1
- 50 ⭐ × 2
- 20 ⭐ × 5–11 depending on final pool size
- Founder / cosmetic / next-season retention bonuses as low-cost rewards
- Empty for the overwhelming majority of outcomes

This is a planning direction, not a final locked prize table.

Known procurement costs supplied by product owner:
- Premium 3 months: 14 CHF
- Premium 6 months: 18 CHF
- NFT: $9–12
- cash prize example: 500 UAH

Because Season #001 is small, NFT is currently deferred by default to a later season unless its use materially improves acquisition/retention enough to justify the cost.

## 8. Recommended reward-frequency target

For Season #001, aim for approximately:

- ~1% main/meaningful prize outcomes across the finite pool
- optionally another ~1% low-cost retention outcomes (Founder/next-season/cosmetic), if these rewards are approved
- the remaining outcomes are Empty or other explicitly budgeted outcomes

This is a target for user experience, not a fixed probability promise. The final probability/weight structure must be simulated with the actual finite inventory.

## 9. Example prize pool for simulation

Candidate balanced pool:

| Reward | Quantity |
|---|---:|
| 500 UAH | 1 |
| Premium 3M | 1 |
| 100 ⭐ | 2 |
| 50 ⭐ | 5 |
| 20 ⭐ | 11 |
| Main meaningful winners | 20 |

Stars liability in this candidate pool:

`2×100 + 5×50 + 11×20 = 670 ⭐`

This is only the Stars component. Cash and Premium costs are separate.

## 10. Prize-pool behavior by spin volume

For a 20-main-winner candidate pool:

| Total spins | Main-winning outcomes / spins |
|---:|---:|
| 1,500 | 20 / 1,500 = 1.33% |
| 2,000 | 20 / 2,000 = 1.00% |
| 3,000 | 20 / 3,000 = 0.67% |

When a specific prize reaches `remaining = 0`, it is removed from selection. Do not replenish it automatically unless explicitly configured in a future product decision.

## 11. Daily free-spin safety model

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

## 12. Participant-cap safety

Season #001 should support a configurable maximum eligible participant count.

Reason:
If the channel unexpectedly grows from ~200 members to thousands during a live season, unlimited daily free spins could multiply the economic exposure unexpectedly.

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
- projected margin
- status: HEALTHY / LOW MARGIN / LOSS RISK

## 13. Economic Planner — required Admin feature

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
- optional safety multiplier

Outputs:
- expected free spins
- maximum free spins
- expected paid spins
- expected total spins
- planning spins
- gross Stars charged
- estimated developer revenue using the current approved Telegram model
- cash prize cost
- Premium cost
- NFT cost
- Stars prize liability
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

The planner must show assumptions used in the calculation so the admin understands why a result is produced.

## 14. Scenario matrix for Season #001

### 150 participants, 14 days

| Scenario | Daily activity | Free spins | Paid conversion | Avg paid spins | Paid spins |
|---|---:|---:|---:|---:|---:|
| Conservative | 30% | 630 | 15% | 2 | ~45 |
| Baseline | 50% | 1,050 | 25% | 3 | ~113 |
| Strong | 70% | 1,470 | 40% | 4 | ~240 |

Add a separate stress case with 100% daily activity and maximum participants for worst-case exposure.

## 15. Paid spin price decision

Candidate range: 75–100 ⭐.

Do NOT permanently lock the price from theory alone.

The planner must show the relationship between:
- price
- paid conversion
- average spins per buyer
- gross Stars volume
- expected margin

A higher price is not automatically better because conversion may fall.

Recommended MVP testing strategy:
- choose one initial price for a controlled cohort/season;
- measure paid conversion and average paid spins;
- compare actual revenue against projections;
- adjust the next season rather than frequently changing price mid-season.

## 16. Revenue and prize-budget principle

The project must not assume that all gross Stars charged are profit.

Before a season is approved:

`expected developer revenue > total expected season cost + safety reserve`

For a small first season, prioritize proving positive unit economics and retention over maximizing prize generosity.

Do not subsidize expensive rewards without explicitly accepting the cost as a marketing/acquisition budget.

## 17. Daily Gift budget

Daily Gift is a separate economic pool from spin prizes.

The admin planner should separately track:
- gift claims
- expected claims
- gift reward liability
- gift budget

Do not silently borrow from the main prize pool to fund Daily Gift rewards.

## 18. Veteran / Founder economics

Veteran and Founder mechanics should primarily use low-cost retention value:
- cosmetic badge
- profile status
- limited next-season convenience bonus
- special gift

Avoid direct transfer of old Stars or permanent economic advantages.

A future free-spin bonus has an economic cost and must be represented in the planner as projected additional attempt volume.

## 19. What is currently approved vs provisional

Approved directions:
- 1 free spin/day as the preferred product direction for testing
- separate Daily Gift
- finite prize inventory
- no tiny 1–3 ⭐ rewards in Season #001
- economic planner
- target/max participant controls
- no hidden probability manipulation
- Veteran/Founder as retention concepts, with Veteran primarily V2

Provisional / requires explicit approval:
- final paid spin price (75 vs 100 ⭐)
- exact number of participants for #001
- exact prize quantities
- exact Stars prize mix
- whether Premium is 3M or 6M
- whether NFT appears in #001
- exact safety multiplier
- exact free-spin pause/budget threshold
- final cross-season Stars policy

## 20. Next economics step

Before finalizing Season #001, run the planner for at least:
- 100 / 150 / 200 / 500 / 1,000 participants
- 7 / 14 / 30 days
- 30% / 50% / 70% daily activity
- multiple paid conversion rates
- multiple average paid-spins-per-buyer values
- 75 / 100 ⭐ paid-spin price

The output should identify the smallest prize budget that still creates an attractive reward experience while keeping baseline economics positive and worst-case exposure controlled.
