# CRICKET BOX — Economy Roadmap (future)

This document records ideas agreed for a later phase. Do not implement these features until the core product flow is stable.

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

Do not treat this roadmap as an active feature specification until explicitly approved for implementation.