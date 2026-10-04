# CRICKET BOX — Economy Roadmap (future)

This document records ideas agreed for a later phase. Do not implement these features until the core product flow is stable.

## 🎟️ Season monetization strategy

Approved product direction for the initial launch:

### First 3 seasons — completely free

- Seasons **#001, #002 and #003** are fully free for users.
- No paid entry is required.
- The goal is to collect real usage data, test retention, prize economy, Daily Gift, streaks and the overall season loop before introducing paid participation.
- Paid spin purchases may remain a separate feature if enabled; “free season” refers to **season entry**, not necessarily to every possible paid action.

### After the first 3 seasons — one season, two phases

Do **not** run a separate free season and a separate paid season at the same time as the default model.

Instead, one season should progress through two stages:

**Phase 1 — 🆓 Free**
- Users enter and use the season normally.
- They can try the product and build engagement.
- This phase acts as onboarding and creates demand for the next stage.

**Phase 2 — 💎 Paid**
- The same season continues, but access to the paid stage requires a purchase/paid participation condition.
- The exact price, access rules and benefits are to be finalized before implementation.
- The paid stage should offer a clear reason to pay: stronger rewards, exclusive prizes, additional opportunities or other measurable benefits.

The preferred model is therefore:

**один сезон → бесплатный этап → платный этап → завершение сезона**

rather than:

**бесплатный сезон + платный сезон одновременно**.

This keeps the audience, season identity, statistics and prize/event context together while allowing monetization after users have already experienced the product for free.

This is a product direction, not yet an implementation specification. Do not implement paid season phases until the pricing, eligibility, rewards and legal requirements are explicitly approved.

## 💸 Monetization ideas to evaluate later

These are ideas for discussion and testing, not approved implementation requirements. The goal is to give users reasons to spend real Telegram Stars without making the core experience feel purely pay-to-win.

### 1. ⭐ Paid extra spins

Keep the ordinary paid spin as the simplest monetization action.

Possible starting structure:
- 1 extra spin — **5 ⭐**
- 5 spins — **22 ⭐**
- 10 spins — **40 ⭐**

The exact price and bundle discounts should be tested against retention, conversion, prize cost and revenue.

### 2. 👑 VIP membership / subscription

Possible recurring product, for example **99 ⭐ / month**, with a package of non-guaranteed-value benefits:
- increased Daily Gift frequency/chance;
- free bonus spins;
- stronger streak rewards;
- VIP badge;
- access to VIP Drops;
- access to closed draws;
- early access to limited events;
- occasional exclusive rewards.

Do not make VIP simply “more chance to win expensive prizes”; benefits should have a clear utility/progression component.

### 3. 🎟️ Season Pass / Battle Pass

A paid progression track for a season, for example **99–199 ⭐**.

Possible contents:
- additional progression rewards;
- exclusive cosmetics;
- exclusive prizes;
- bonus attempts;
- Stars/XP rewards;
- milestone rewards;
- a final guaranteed reward for completing the pass.

The pass should be valuable even when the user does not win a rare main prize.

### 4. 🔥 VIP Drops

Short, limited events aimed at VIP users.

Examples:
- limited number of entries;
- stronger or more unusual prize pool;
- exclusive cosmetics/rewards;
- access purchased with real Telegram Stars or earned CRICKET BOX Stars, depending on the final economy.

The event should feel special rather than being permanently available.

### 5. 💎 Limited Drops

Time-limited or quantity-limited events available to a broader audience.

Possible mechanics:
- limited number of entries;
- limited prize stock;
- exclusive seasonal rewards;
- event-specific progression;
- countdown / “only X spots left”.

Scarcity should be real and transparent, not fake.

### 6. 🎁 Paid Mystery Gifts

A paid random-reward product, for example a **25 ⭐** mystery gift.

Possible reward pool:
- small Star rewards;
- XP;
- free spins;
- cosmetics;
- rare items;
- occasional premium/high-value rewards.

**Important:** this is a paid randomized mechanic and may create legal/platform/compliance considerations depending on implementation and jurisdiction. Do not implement until reviewed.

### 7. 🍀 Lucky Track / guaranteed reward after several paid spins

A protection mechanic to reduce the feeling that paid spins are “wasted”.

Example:
- after 5 paid spins, the user receives a guaranteed reward;
- progress resets after the guaranteed reward;
- exact reward quality should be balanced against the spin price and prize economy.

This can make repeated spending feel like progression rather than pure randomness.

### 8. 🏦 Lifetime VIP through the Piggy Bank

Already part of the long-term economy design.

- User moves CRICKET BOX Stars into the Piggy Bank.
- At **2,000 ⭐ accumulated**, VIP becomes permanent.
- This creates a long-term reason to keep earning and banking Stars instead of immediately spending everything.

Potential future extension:
- higher lifetime milestones for special cosmetic/status rewards;
- OG-style status for long-term participants.

### 9. 🎨 Cosmetics / status items

Monetize identity rather than prize odds.

Possible purchases:
- profile frames;
- animated avatars/effects;
- titles;
- badges;
- seasonal profile styles;
- limited-edition cosmetics;
- special spin/profile animations.

Cosmetics can be sold directly or through limited events.

### 10. 🧩 Shards / fragments / collections

A collection system where users collect fragments of a larger reward.

Examples:
- 5 shards → Premium reward;
- complete a seasonal collection → exclusive cosmetic;
- rare shard → special reward;
- collection progress persists or resets depending on the event.

This can create long-term engagement without simply increasing spin odds.

### 11. 🎯 Paid access / special opportunities

Instead of selling stronger odds, sell access to special content.

Possible products:
- entry to a special event;
- access to an exclusive draw;
- limited extra action;
- early access to a drop;
- special challenge with a guaranteed reward path.

The core principle: **sell access, opportunity, progression and exclusivity more than raw winning probability.**

### 12. 📦 Bundles

Combine several useful things into one purchase.

Examples:
- spins + XP;
- spins + cosmetic;
- season pass + bonus attempts;
- VIP event ticket + guaranteed small reward;
- event entry + collection item.

Bundles can make the purchase feel more valuable than buying one action repeatedly.

## 🧠 Monetization principles

The project should avoid turning the whole experience into “pay more = massively better odds”.

Preferred hierarchy:

**FREE**
- free season access;
- Daily Gift;
- free attempts;
- streak/progression;
- normal rewards.

**SPIN**
- paid extra spins with real Telegram Stars.

**PASS**
- Season Pass / Battle Pass with progression and exclusive rewards.

**VIP**
- long-term status and useful privileges.

**EVENTS**
- VIP Drops;
- Limited Drops;
- Secret Events;
- special access.

**STORE**
- spend earned CRICKET BOX Stars on useful or collectible items.

A key principle is to monetize **access, extra opportunities, progression, exclusivity and cosmetics**, while keeping the core prize economy understandable and not overly pay-to-win.

Do not launch every monetization system at once. Prefer testing a small number of mechanics, measuring conversion and retention, then adding the next layer.

## Currency model

### ⭐ CRICKET BOX Stars balance
- User-facing spendable balance.
- Maximum balance: 500 ⭐.
- Can be used for the internal store and, after a season ends, withdrawal.
- Must NOT be used to pay for ordinary paid spins.
- Ordinary paid spins use real Telegram Stars through Telegram Payments.

### 🏦 Piggy Bank
- Separate long-term progress balance.
- User can move CRICKET BOX Stars from the spendable balance into the Piggy Bank.
- Piggy Bank balance persists across seasons.
- Stars moved into the Piggy Bank cannot be converted back into spendable Stars and cannot be withdrawn.
- Piggy Bank should show progress toward the lifetime VIP threshold.
- Example: 1,750 / 2,000 ⭐, 250 ⭐ remaining to VIP.

## 👑 VIP

VIP is earned, not purchased directly.

- Lifetime threshold: 2,000 ⭐ accumulated in the Piggy Bank.
- Once the threshold is reached, VIP becomes permanent.
- Later spending from the Piggy Bank must not revoke VIP.
- Possible VIP benefits (to balance carefully before implementation):
  - small bonus toward rare-prize odds (target idea: +5%, subject to final economy design);
  - access to VIP-only draws;
  - occasional bonus Stars/XP;
  - VIP profile badge;
  - early access to seasons/limited events;
  - exclusive prizes.

## 🎖️ Lifetime statuses

Possible profile status progression:
- 👤 Новичок — 0 completed seasons.
- 🌱 Постоянный — 2 seasons.
- 💎 Old — 3 seasons.
- 👑 VIP — 2,000 ⭐ accumulated in Piggy Bank.
- 🔥 OG VIP — 5+ seasons and VIP.

Final thresholds/labels are subject to product testing.

## 🛍️ Internal store

Possible purchases using spendable CRICKET BOX Stars:
- Telegram Premium rewards;
- Telegram gifts;
- NFTs or other available rewards;
- profile cosmetics / frames / titles;
- XP or other non-spin progression items;
- special event access.

Internal prices must be set using actual project cost/margin rather than a 1:1 Stars assumption.

## 🔥 Special events

Keep special events separate from the ordinary season spin economy.

Possible formats:
- VIP Drop;
- Secret Event;
- Limited Event;
- VIP-only draw;
- special actions where CRICKET BOX Stars may buy access or limited extra actions.

CRICKET BOX Stars should not become a direct payment method for the ordinary main-season paid spin.

## UI concept

Dedicated “⭐ Мои Stars” screen:

- 💰 На балансе: 340 ⭐
- 🏦 В копилке: 1,650 ⭐
- 👑 До VIP: 350 ⭐
- progress bar toward VIP

Actions:
- 💎 Premium
- 🎁 Telegram-подарок
- 🖼 NFT
- 💸 Вывести (when withdrawal is open)
- 🏦 Положить в копилку

Clarifying text:
- Spendable CRICKET BOX Stars are internal product rewards.
- Ordinary paid spins are paid separately with real Telegram Stars.
- Piggy Bank Stars cannot be withdrawn or converted back to the spendable balance.

## Balance-full messaging

Never tell the user “spend Stars to free space” unless there is an implemented spending destination. Once the store exists, a full balance can say:

“Баланс заполнен — используй Stars в магазине или выведи их после завершения сезона.”

Until then, explain that withdrawal after season end is the available way to free balance.

## Future implementation order

1. Separate spendable balance and Piggy Bank in PostgreSQL.
2. Piggy Bank transfer flow with transaction/audit protection.
3. Lifetime VIP milestone and profile badge.
4. Lifetime status/season counters.
5. Internal store and inventory-backed redemptions.
6. Special events and VIP-only drops.
7. Economy analytics: earned, spent, banked, withdrawn, outstanding liability, prize cost, revenue and margin.
8. Test paid extra spins and bundles.
9. Design and test Season Pass / Battle Pass.
10. Design VIP / subscription benefits.
11. Build Limited Drops / VIP Drops / special event access.
12. Evaluate collections, cosmetics, Lucky Track and other progression monetization.

Do not treat this roadmap as an active feature specification until explicitly approved for implementation.