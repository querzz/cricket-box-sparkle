# CRICKET BOX — HOME UX

## Purpose

The Home screen is the main conversion and retention surface of the Telegram Mini App. It should feel active without becoming visually crowded.

## Home content order

1. Hero: avatar, Stars balance, daily gift shortcut, season code/date range, Cricket Box artwork.
2. Season status card: live countdown while active; ended/payout status after the season closes.
3. Primary CTA: `Крутить` while the season is live; after closure, show `Мои призы` and `Вывести Stars` when permitted.
4. `Возможные призы`: horizontal prize showcase with icon + readable reward name. Do not show exact remaining inventory counts on Home. Do not show the `EMPTY` outcome.
5. `Твои призы`: compact empty CTA when there are no rewards; otherwise show the latest 1–2 rewards and a link to the full list.
6. `Как это работает`: three compact steps — spin, receive, claim/use — with a link to the full rules.
7. Subscription card: shown only to users who are not subscribed. This area is reserved for a future promotional/ad slot and must remain optional.

## Prize showcase rules

Home is a storefront, not an inventory dashboard. Do not expose remaining counts for valuable prizes on the Home screen, because this can reduce motivation after the most attractive rewards have been depleted.

Detailed `/prizes` is the place for the full prize pool and exact remaining inventory.

Each Home prize item should display what the icon represents, for example:

- `500 грн`
- `Telegram Premium · 3 месяца`
- `100 Stars`
- `50 Stars`
- `20 Stars`

## Daily free spin

Every eligible participant gets exactly one free spin per local calendar day while the season is `ACTIVE` or `ENDING`.

Eligibility:

- channel subscription is active;
- user is a season participant;
- season is live.

Unused daily attempts do not accumulate. A user can have at most one free attempt from the daily grant at a time.

The mock service persists the current day key and grants the next day's attempt on the first session/spin call for that new day. The developer Settings screen exposes a QA-only action to reset today's grant without waiting for the next day.

## Daily Gift

Daily Gift is a separate 24-hour reward loop. It is not the same as the daily free spin and has its own availability/cooldown.

## Future advertising slot

The subscription/promo area may later support Telegram channel promotions configured from Admin WebApp. Sponsored content must be clearly distinguishable from normal product content and must not replace core season information.

## Future retention content

Founder/Veteran rewards are separate from the main prize pool and must not change jackpot odds. They may grant next-season cosmetics, one-time starting bonuses, or other explicitly configured retention perks.
