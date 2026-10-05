# CRICKET BOX — Economy Roadmap & Product Backlog

This document records agreed future economy ideas plus the current admin/product worklist. Features in the backlog are not considered implemented until explicitly completed and verified in production.

### Current implementation notes — 2026-10-05

The agreed admin/economy batch is now tracked as the active implementation scope. The repository currently contains the corresponding code changes, but production deployment/verification is still required before calling them live.

Paid-spin clarification: **the paid spin in the main season is intended to have better reward odds than a free spin**. The current implementation uses a **1.25× relative weight multiplier for non-EMPTY outcomes on paid spins**; this is an initial tunable value, not a final economy decision.

The Store is deliberately deferred. The first planned store scope is **Titles + Cosmetics**; Premium/Gifts/NFTs and other monetization products remain later experiments.

The withdrawal rule is **50 ⭐ minimum**. Balances below 50 ⭐ at season end carry forward instead of being deleted.

## 🔴 Current agreed work — implement next

### 1. 🎲 Free Spin issuing

Add admin tools to issue free spins manually.

Required:
- choose a user;
- issue a selected amount of free spins;
- show the new balance of free spins after the operation;
- keep an audit/history entry for the grant.

Add a separate random option:

**🎲 Выдать случайно**

- random amount from **1 to 5** free spins;
- hard maximum: 5 per random grant;
- show exactly how many spins were granted.

Use cases: promotions, compensation, contests, events, support.

### 2. ⭐ Paid-spin probability

**Important clarification:** this refers to the probability inside the **main-season paid spin**, not Daily Gift.

When a user buys a paid spin with real Telegram Stars, the paid spin should have a **better reward probability / more favorable prize pool or weights** than the ordinary/free spin, subject to the final economy balance.

Do not confuse this with:
- Daily Gift reward chance;
- free-spin issuance;
- general Daily Gift weights.

The exact numerical advantage is still to be tested and approved. The goal is for a user who explicitly paid for a spin to receive a meaningfully better expected outcome, without making the system obviously pay-to-win or economically unsafe.

### 3. ⏸️ Season pause

Add a real season pause control for admins.

Expected behavior:
- admin can pause the active/ending season;
- spinning and other season actions that depend on the active season are blocked while paused;
- users see a clear “Сезон временно приостановлен” state;
- the season clock should stop while paused rather than silently continuing;
- resume continues the season with the remaining time preserved;
- pause/resume actions must be audited.

This is primarily an operational safety feature for fixes, incidents and maintenance.

### 4. 💸 Automatic total payout per user

In the payouts section, calculate and display the **total amount owed to each user** across all their pending winnings.

Example:

**@Pecheenkkaaa**
- 5 ⭐ + 7 ⭐ + 2 ⭐
- **Итого к выплате: 14 ⭐**
- action: **Выдать всё — 14 ⭐**

The admin must not have to manually add individual winnings.

The top-level payout summary should remain consistent with the user totals, e.g.:
- ⭐ total Stars to pay;
- 👥 users;
- ⏳ pending users.

### 5. 🎁 Personal gifts

Finish the personal-gift/admin reward flow.

Admin should be able to select one user and issue a personal reward such as:
- Stars;
- free spins;
- XP;
- another supported reward type.

Every personal grant must have an audit/history entry.

### 6. 📋 Mobile copy actions

Make user identifiers easy to copy on phones.

Add copy actions for:
- Telegram ID;
- @username;
- other important user identifiers where useful.

After tapping, show a short confirmation such as “Скопировано”.

### 7. 📊 Spin analytics by day

Fix the existing **“Прокрутки за 7 дней”** analytics because the current table/chart is not reliably working.

Add a daily view as well.

Preferred controls:
- Сегодня;
- 7 дней;
- 30 дней (later if useful).

For each day, show the total number of spins.

Where practical, allow breakdown by type:
- free spin;
- paid spin;
- bonus/veteran/campaign spin;
- total.

The current 7-day chart must use real PostgreSQL/payment/spin records and refresh correctly.

### 8. 👥 User balance in admin

Add a clear Stars balance view for users in the admin panel.

Required capabilities:
- total Stars across user balances;
- number of users;
- average balance;
- search by @username / name / Telegram ID;
- filter users with balance / zero balance;
- sort by balance;
- quick action to issue or deduct Stars;
- clear indication of current balance.

The user/participant list should also show the balance without requiring a separate screen.

Example:

@username
🟢 Активен
ID: 123456789
⭐ **Баланс: 14**

Opening a user can show:
- current Stars balance;
- total winnings;
- spin count;
- pending payout;
- reward history;
- actions to issue Stars / free spins.

### 9. 💸 Minimum withdrawal threshold and season carry-over

Add the rule:

**Minimum withdrawal amount = 50 ⭐.**

When a season ends:
- balance **50 ⭐ or more** can be withdrawn when withdrawals are open;
- balance **below 50 ⭐ must not disappear**;
- the balance carries over to the next season;
- carried balance is added to the user's existing balance in the next season;
- once the user reaches 50 ⭐, withdrawal becomes available according to the normal withdrawal rules.

Example:

#001 → 37 ⭐

#002 → starts with 37 ⭐

Then user earns 20 ⭐:

37 + 20 = 57 ⭐ → withdrawal threshold reached.

This rule must be reflected consistently in the user UI, admin UI and payout logic.

### 10. 🧮 Admin balance actions

The balance-management area should support the operational actions needed by the admin team, with audit protection:
- issue Stars;
- deduct Stars;
- optionally bulk-select users;
- show selected total;
- confirm destructive operations;
- keep a reason/history for manual corrections.

## 🟡 Deferred product work

These items should be tracked but **not implemented in the current batch**.

### 🛍️ Store

The store remains a later phase.

Planned first categories:
1. **Titles**
2. **Cosmetics**
3. Other store products from the economy roadmap after the core economy is tested.

Possible future title products:
- seasonal titles;
- status titles;
- limited titles;
- special achievement titles.

Possible future cosmetics:
- profile frames;
- animated profile effects;
- seasonal profile styles;
- badges;
- special spin/profile animations.

Do not build the full store until the balance/payout system and core season economy are stable.

### 💰 Other monetization systems

Keep the broader monetization ideas below for later discussion/testing, not current implementation:
- VIP subscription;
- Season Pass / Battle Pass;
- VIP Drops;
- Limited Drops;
- paid Mystery Gifts;
- Lucky Track / guaranteed reward after several paid spins;
- Shards / fragments / collections;
- paid access / special opportunities;
- bundles;
- other future monetization ideas.

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

This is a product direction, not yet an implementation specification. Do not implement paid season phases until pricing, eligibility, rewards and legal requirements are explicitly approved.

## 💸 Monetization ideas to evaluate later

These are ideas for discussion and testing, not approved implementation requirements. The current batch deliberately leaves them deferred.

### 1. ⭐ Paid extra spins

Possible starting structure:
- 1 extra spin — **5 ⭐**
- 5 spins — **22 ⭐**
- 10 spins — **40 ⭐**

Exact price and bundle discounts should be tested.

### 2. 👑 VIP membership / subscription

Possible recurring product, for example **99 ⭐ / month**, with:
- increased Daily Gift frequency/chance;
- free bonus spins;
- stronger streak rewards;
- VIP badge;
- access to VIP Drops;
- closed draws;
- early access;
- occasional exclusive rewards.

Do not make VIP simply “massively better prize odds”.

### 3. 🎟️ Season Pass / Battle Pass

Possible paid progression track, for example **99–199 ⭐**, with:
- progression rewards;
- exclusive cosmetics;
- exclusive prizes;
- bonus attempts;
- Stars/XP;
- milestone rewards;
- final guaranteed reward.

### 4. 🔥 VIP Drops

Short, limited events for VIP users with exclusive or unusual rewards.

### 5. 💎 Limited Drops

Time- or quantity-limited events with real, transparent scarcity.

### 6. 🎁 Paid Mystery Gifts

A paid randomized reward product. Requires legal/platform/compliance review before implementation.

### 7. 🍀 Lucky Track

A guaranteed reward after a number of paid spins, e.g. after 5, with exact reward quality determined by the final economy.

### 8. 🏦 Lifetime VIP through the Piggy Bank

At **2,000 ⭐ accumulated** in the Piggy Bank, VIP becomes permanent.

### 9. 🎨 Cosmetics / status items

Deferred. See the Store section above.

### 10. 🧩 Shards / fragments / collections

Deferred collection mechanics for later testing.

### 11. 🎯 Paid access / special opportunities

Sell access, extra opportunities, early access or special challenge paths instead of only selling stronger raw odds.

### 12. 📦 Bundles

Combine useful products such as spins + XP, pass + bonus attempts, event ticket + reward, etc.

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
- paid extra spins with real Telegram Stars;
- paid spins may have a better reward probability/pool than free spins, with exact advantage tested and approved.

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
- later: titles, cosmetics and other useful/collectible products.

A key principle is to monetize **access, extra opportunities, progression, exclusivity and cosmetics**, while keeping the prize economy understandable and not economically unsafe.

Do not launch every monetization system at once. Test a small number of mechanics, measure conversion and retention, then add the next layer.

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
- Possible VIP benefits:
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

Future store scope:
- titles;
- profile cosmetics / frames / effects;
- Telegram Premium rewards;
- Telegram gifts;
- NFTs or other available rewards;
- XP or other non-spin progression items;
- special event access.

The **current planned first launch of the store is limited to Titles + Cosmetics**. Other store products stay later until the core economy is proven.

Internal prices must be based on actual project cost/margin rather than a 1:1 Stars assumption.

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
- Balances below 50 ⭐ at season end carry to the next season instead of disappearing.

## Balance-full messaging

Never tell the user “spend Stars to free space” unless there is an implemented spending destination. Once the store exists, a full balance can say:

“Баланс заполнен — используй Stars в магазине или выведи их после завершения сезона.”

Until then, explain that withdrawal after season end is the available way to free balance, subject to the 50 ⭐ minimum.

## Future implementation order

### Current batch
1. Free Spin manual issuing.
2. Random Free Spin grant (1–5).
3. Paid-spin reward-probability tuning.
4. Season pause/resume.
5. Automatic total payout per user.
6. Personal gifts.
7. Mobile copy actions.
8. Fix 7-day spin analytics.
9. Daily spin analytics.
10. Admin Stars balance management.
11. Balance shown in participant/user views.
12. Minimum withdrawal threshold of 50 ⭐ + season carry-over.
13. Audit-safe manual balance corrections.

### Later
14. Separate spendable balance and Piggy Bank in PostgreSQL.
15. Piggy Bank transfer flow with transaction/audit protection.
16. Lifetime VIP milestone and profile badge.
17. Lifetime status/season counters.
18. Internal store — first Titles + Cosmetics.
19. Other store products.
20. Special events and VIP-only drops.
21. Economy analytics: earned, spent, banked, withdrawn, outstanding liability, prize cost, revenue and margin.
22. Season Pass / Battle Pass.
23. VIP / subscription.
24. Limited Drops / VIP Drops / special event access.
25. Collections, shards, Lucky Track, bundles and other monetization experiments.

Do not treat this roadmap/backlog as a final implementation specification for any deferred feature until pricing, economy, eligibility, platform and legal requirements are approved.