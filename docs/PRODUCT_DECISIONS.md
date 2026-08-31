# CRICKET BOX — APPROVED PRODUCT DECISIONS

This file records product decisions approved after the initial MASTER SPECIFICATION. Check it together with `docs/MASTER_PLAN.md`, `docs/MASTER_SPECIFICATION.md`, `docs/ECONOMICS.md`, and `docs/HOME_UX.md` before future product or coding work.

## 1. Stars — one currency only

There is only one Stars concept in the product: **Telegram Stars (⭐)**.

Do NOT introduce:
- Cricket Credits
- Cricket Points
- CB Credits
- any second virtual currency

User-facing balance example:

`⭐ 125 / 500`

The 500 value is the default configurable capacity/cap. Production implementation must respect the final Telegram-supported payment/reward model.

## 2. Daily free spin

Approved product direction for MVP testing:

- An active participant receives **1 free spin per active season day**.
- Unused daily free spins do not accumulate by default.
- Season close immediately stops future free-spin grants.
- The rule must be enforced server-side in production.
- Exact calendar/timezone behavior must be fixed before production launch.

Daily free spins are a retention/acquisition mechanism, not direct revenue.

## 3. Season #001 planning defaults

These are **recommended starting settings**, not permanent global values. The admin must be able to change them for future seasons.

- Target participants: **150**
- Maximum eligible participants: **300**
- Duration: **14 days**
- Free spins: **1/day**
- Baseline expected daily activity: **50%**
- Planning free spins: around **1,050–1,260** depending on retention assumption
- Planning total spin volume: around **2,000** outcomes

These numbers are used as the first economic baseline and must be recalculated automatically by the Economic Planner.

## 4. Paid spin — starting recommendation

Recommended starting price for Season #001: **100 Telegram Stars per paid spin**.

Why:
- it gives the first season enough unit revenue headroom for a meaningful prize pool;
- 75 Stars remains a useful comparison scenario in the Economic Planner;
- price remains configurable by admin for future seasons;
- do not change the price mid-season after the first paid transaction.

This is a product recommendation, not a hardcoded technical constant.

## 5. Season #001 provisional prize direction

Recommended starting pool for simulation:

- **500 UAH × 1**
- **Telegram Premium 6 months × 1**
- **100 Stars × 2**
- **50 Stars × 5**
- **20 Stars × 11**
- `EMPTY` for the remaining outcomes

Main meaningful winners: **20**.

Stars liability:

`2×100 + 5×50 + 11×20 = 670 ⭐`

This is a **planning template only**. Final prize quantities, availability, procurement costs, and Stars fulfillment must be confirmed before the season is launched.

## 6. Premium / NFT decision

For Season #001:

- Prefer **Premium 6 months** over 3 months when using a Premium prize because the supplied cost difference is small relative to the increased perceived value.
- **NFT is deferred by default** to Season #002 or a larger audience unless its acquisition/retention value clearly justifies the additional cost.

Known supplied costs:
- Premium 3 months: 14 CHF
- Premium 6 months: 18 CHF
- NFT: $9–12
- cash prize example: 500 UAH

## 7. Prize-pool behavior

- `remaining = 0` → reward is excluded from selection.
- Exhausting one reward does **not** end the season.
- `EMPTY` may continue throughout the season.
- No hidden probability manipulation to hide depleted rewards.
- Daily free spins increase attempt volume but do not guarantee that all rewards will be claimed.
- The admin planner must warn when expected/max attempt volume is inconsistent with the configured pool.

## 8. Prize engine

Preferred MVP model: **weighted sampling without replacement**.

Conceptually, each remaining reward unit participates in the finite pool. For each spin:
- eligible rewards must have `remaining > 0` and be active;
- Stars rewards are excluded for users already at their Stars cap;
- one outcome is selected;
- the selected inventory is decremented atomically;
- the result is recorded server-side before the client reveal.

Do not use adaptive pacing in MVP unless explicitly approved later.

## 9. Stars cap

Default cap: **500 ⭐**.

Example:

`480 ⭐ + 50 ⭐ reward → 20 ⭐ credited`

The 30 ⭐ overflow must be explicitly recorded/audited and never become a second balance/currency.

At `500 / 500`:
- Stars rewards are removed from that user's eligible pool;
- other rewards remain eligible;
- spending Stars immediately frees capacity.

## 10. Daily Gift

Daily Gift is separate from the main spin prize pool.

- one claim per cooldown/day;
- active participants only;
- own reward budget/liability tracking;
- no silent borrowing from the main prize pool.

Streak remains V2.

## 11. Veteran / Loyalty

Approved as **V2 retention**.

Previous-season activity may create a persistent veteran level/reputation that gives small next-season benefits.

Potential tiers:
- Newcomer
- Active
- Veteran
- Elite

Potential low-cost benefits:
- +1 starting free spin;
- temporary improved Daily Gift;
- Veteran Gift;
- cosmetic badge/status.

Strictly:
- no automatic transfer of old Stars;
- no transfer of unused spins;
- no large permanent advantage;
- no automatic higher jackpot probability;
- exact bonuses must be approved before implementation.

## 12. Founder / early-community recognition

Potential Season #001 participants can receive a **Founder / Early Supporter** cosmetic status retained into later seasons.

Prefer cosmetic or low-cost retention value. Do not make it a strong economic advantage.

## 13. Economic Planner — required Admin feature

The Admin WebApp must automatically calculate:
- target/max participants;
- expected daily activity;
- expected/max free spins;
- expected paid spins;
- planning total spins;
- paid-spin price;
- gross Stars charged;
- estimated developer revenue under the current approved Telegram model;
- cash/Premium/NFT costs;
- Stars prize liability;
- Daily Gift liability;
- safety reserve;
- break-even paid spins;
- break-even paid conversion;
- projected margin;
- worst-case exposure;
- prize-pool utilization.

Statuses:
- `HEALTHY`
- `LOW MARGIN`
- `LOSS RISK`

The planner must always show the assumptions behind the calculation.

## 14. Cross-season rule

Season #001 and later seasons remain independent.

Default:
- old Stars are not automatically transferred by Veteran;
- old free/paid spin balances are not transferred;
- Founder/Veteran status can persist as metadata;
- final cross-season Stars settlement behavior must be explicitly approved before production.

## 15. Home UX

Approved Home behavior:
- `Возможные призы` is a visual showcase, not an inventory dashboard.
- Each prize icon on Home must include a short readable label under it, e.g. `500 грн`, `Telegram Premium · 3 месяца`, `100 Stars`.
- The Home prize strip must hide the `EMPTY` outcome and exact remaining counts.
- Exact inventory remains available on the full prizes screen.
- Home includes `Твои призы`: compact empty state before the first win; latest 1–2 rewards after a win.
- Home includes `Как это работает` with three compact steps and a link to full rules.
- Do not put Leaderboard on Home.
- The subscription/promo area is reserved for future Telegram-channel advertising support and must remain optional.

## 16. Production-priority decisions

Before adding more retention features:
1. finalize Stars payment/reward fulfillment model;
2. finalize Daily Free Spin economics;
3. finalize finite prize-pool mechanics;
4. implement Russian UI/i18n;
5. build Admin WebApp;
6. implement backend and database.

## 17. Source-of-truth rule

These decisions are approved unless explicitly changed later.

Future coding work must:
1. read `docs/MASTER_SPECIFICATION.md`;
2. read `docs/MASTER_PLAN.md`;
3. read this file;
4. read `docs/ECONOMICS.md` for economic assumptions;
5. read `docs/HOME_UX.md` for Home behavior;
6. inspect the current code;
7. preserve approved decisions;
8. label new ideas as PROPOSED until approved.
