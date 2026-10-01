# CRICKET BOX — CURRENT STATE / HANDOFF

Updated: 2026-10-01
Repository: `querzz/cricket-box-sparkle`
Production/test target: Telegram Mini App + Telegram bot + PostgreSQL on Hetzner

## Purpose of this file

This is the handoff document for a new AI/chat session.

If the current chat is lost, the next AI should read this file first, then read:

- `docs/PRODUCT_DECISIONS.md` — product source of truth.
- `docs/IMPLEMENTATION_STATUS.md` — implementation status, tests and remaining production work.
- `docs/PRIZE_ENGINE.md` — current finite-pool prize selector.
- `README.md` — project architecture and normal development commands.

Do not invent a new architecture or overwrite existing decisions before checking those documents.

---

## 1. What the project is

CRICKET BOX is a Telegram Mini App for seasonal prize-box events.

Main stack:

- React + TypeScript
- TanStack Start / TanStack Router
- Nitro production server
- PostgreSQL through `pg`
- Telegram Mini App `initData` HMAC validation
- Telegram Stars (`XTR`) payments
- PostgreSQL-backed rate limiting and idempotency
- Telegram bot using long polling
- Server-authoritative finite-pool prize selection
- Admin WebApp
- LiveOps scheduler
- Caddy reverse proxy / HTTPS on the production host

The current selector is:

```
finalWeight = configuredWeight × quantityRemaining
```

There is no hidden online-user-count multiplier, pity, anti-streak or time-based probability correction in the current MVP.

---

## 2. CURRENT DEPLOYMENT — Hetzner

A real Hetzner Cloud server has already been created.

Current server:

- Provider: Hetzner Cloud
- Location: Helsinki, Finland
- Type: CPX12
- Resources: 1 vCPU / 2 GB RAM / 40 GB local disk
- OS: Ubuntu 26.04.1 LTS
- SSH access: working with the existing local `id_ed25519` key pair
- Public IPv4: configured on the server (do not hard-code the IP in this documentation)
- Hetzner Firewall: configured with inbound TCP 22, 80 and 443
- PostgreSQL is installed locally on the same server
- Node.js: v22.23.3
- npm: 10.9.9

The server is currently named `cricket-bot`.

### SSH

The local Windows machine already has:

```
C:\Users\sergi\.ssh\id_ed25519
C:\Users\sergi\.ssh\id_ed25519.pub
```

The private key must never be copied into the repository or shared in chat.

---

## 3. APPLICATION PATHS / SERVICES

Project path on Hetzner:

```
/opt/cricket-box-sparkle
```

Node binary:

```
/root/.nvm/versions/node/v22.23.3/bin/node
```

Production build:

```
.output/server/index.mjs
```

Nitro production preset has been verified as:

```
node-server
```

Two systemd services have been created:

### Web

```
cricket-box-web.service
```

Runs:

```
node /opt/cricket-box-sparkle/.output/server/index.mjs
```

Current production listener:

```
http://127.0.0.1:3000
```

Health endpoint:

```
/api/health
```

Verified response:

```
{"ok":true,"database":true}
```

### Bot

```
cricket-box-bot.service
```

Runs:

```
/root/.nvm/versions/node/v22.23.3/bin/node /opt/cricket-box-sparkle/scripts/telegram-bot-entry.mjs
```

The bot is expected to stay running continuously.

The bot uses PostgreSQL advisory locking so only one bot instance can poll at a time, and processes message batches concurrently.

Important: a recent bot bug was fixed in commit:

```
7e076429 — fix: restore bot lock and polling helpers
```

After pulling the latest code, the bot successfully reached:

```
🤖 @CricketBoxBot polling started
```

Do not remove the advisory lock or polling concurrency without a specific reason.

---

## 4. DATABASE — FRESH PRODUCTION/TEST DATABASE

The decision was made **not to migrate the old local database**.

The Hetzner database is intentionally fresh.

Database:

```
cricket_box
```

Database user:

```
cricket_box
```

The local PostgreSQL connection is intended to be:

```
postgresql://cricket_box:<DB_PASSWORD>@127.0.0.1:5432/cricket_box
```

The password was generated on the server and is stored outside GitHub/repository files.

The schema was initialized successfully with:

```
npm run db:init
```

Initialization output confirmed owner/admin bootstrap and successful migrations.

The fresh database currently contains 17 application tables, including:

- admins
- users
- user_state
- seasons
- prizes
- spins
- payouts
- daily_gift_claims
- owner_gifts
- channel_activity
- audit_logs
- star_transactions
- stars_ledger
- api_rate_limit_buckets
- season_drop_events
- season_economy_snapshots
- app_settings

There is intentionally no old season/user data.

---

## 5. ENVIRONMENT / SECRETS

The real `.env` exists only on the server.

Never commit it and never put real secrets into documentation.

Expected server-side variables include:

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=CricketBoxBot
TELEGRAM_BOT_ID=
TELEGRAM_CHANNEL_ID=
TELEGRAM_SUPPORT_USERNAME=

VITE_ADMIN_BOT_URL=https://t.me/CricketBoxBot?startapp=admin
APP_URL=https://cricketbox.site

OWNER_TELEGRAM_ID=
ADMIN_TELEGRAM_IDS=

DATABASE_URL=postgresql://cricket_box:<DB_PASSWORD>@127.0.0.1:5432/cricket_box

LIVEOPS_CRON_SECRET=
```

Actual values must remain only in server/GitHub secret storage.

GitHub Actions needs these repository secrets:

```
CRICKET_BOX_APP_URL=https://cricketbox.site
LIVEOPS_CRON_SECRET=<same secret as server>
```

The LiveOps workflow calls:

```
POST /api/internal/liveops/tick
Authorization: Bearer <LIVEOPS_CRON_SECRET>
```

on a 5-minute schedule.

---

## 6. DOMAIN / HTTPS

Domain purchased:

```
cricketbox.site
```

DNS root A record was configured to the Hetzner public IPv4.

DNS resolution has been verified from the server:

```
getent hosts cricketbox.site
```

resolved to the Hetzner public IPv4.

The intended reverse-proxy topology is:

```
https://cricketbox.site
        |
        v
      Caddy
        |
        v
127.0.0.1:3000
        |
        v
CRICKET BOX Node server
```

Caddy should terminate HTTPS and proxy to port 3000.

Before declaring production-ready, verify from outside the server:

```
curl -I https://cricketbox.site
curl https://cricketbox.site/api/health
```

Do not expose port 3000 through the Hetzner Firewall.

---

## 7. TELEGRAM BOT / ADMIN

Bot username:

```
@CricketBoxBot
```

Bot uses:

- `/start`
- `/help`
- `/paysupport`
- Telegram Stars pre-checkout handling
- successful payment completion
- refund recovery
- Mini App launch buttons

Admin button:

```
🛠 Админ-панель
```

Admin authorization is database-backed.

The initial owner/admin bootstrap was done by:

```
npm run db:init
```

using the real `OWNER_TELEGRAM_ID` / `ADMIN_TELEGRAM_IDS` from server `.env`.

If one Telegram account sees the admin button and another does not, inspect:

```
SELECT telegram_id, role, is_active, is_test FROM admins;
```

Do not weaken server-side admin checks just to make the button appear.

---

## 8. CURRENT PRODUCT STATE

The application is implemented far enough for a controlled test season.

Implemented core pieces include:

- server-authoritative spin engine
- finite inventory
- atomic prize inventory decrement
- spin idempotency
- PostgreSQL rate limiting
- Telegram initData validation
- subscription checks
- Daily Gift persistence/cooldown
- Telegram Stars payment flow
- payment completion idempotency
- refund-pending recovery
- admin seasons/prizes/participants/spins/payouts/statistics/access/audit/channel activity/economics/mechanics/settings
- LiveOps scheduled lifecycle
- health endpoint
- Russian admin/user UI work already performed
- production Node build
- systemd web and bot services

---

## 9. CURRENT TEST SEASON PLAN

The next immediate task is to create a clean one-week test season through the admin panel.

Target settings:

```
Name: CRICKET BOX TEST
Duration: 7 days
Daily free spin: ON
Paid spin: choose the desired test price in Telegram Stars
State: ACTIVE
```

Important implementation detail:

The admin UI's **Create season** dialog contains a "days" field, but the create request currently does not carry that value. Therefore:

1. create the season;
2. open its main settings;
3. set Duration = 7;
4. set State = ACTIVE;
5. save the season;
6. configure the prize pool;
7. test a real user spin before inviting the rest of the testers.

Only one season may be ACTIVE/ENDING at a time.

---

### Recent UX update (2026-10-01)

The admin prize editor was simplified for easier day-to-day use:

- The prize add menu now has a dedicated **NFT** type.
- NFT uses the prize value field as an estimated **Stars** value.
- The technical `Weight` label was changed to **Вес выпадения** with an explanation that it is a relative factor and remaining inventory also affects the final odds.
- The visible **Картинка URL** field was removed from the editor to reduce clutter; the backend/database image fields remain supported for compatibility.
- The existing **Себестоимость** field is now explicitly described as an economics-only value and not part of the selection chance.

Latest related commit:
```
1d5bed892 — feat: simplify prize editor and add NFT controls
```

## 10. TEST PRIZE POOL

Prize pool is configured in:

```
/admin/prizes
```

The current admin builder supports:

- MONEY
- STARS
- PREMIUM
- NFT
- PHYSICAL
- CUSTOM
- FREE_SPIN
- EMPTY

For the first test, a simple finite pool is appropriate.

Example only (do not treat these values as product decisions):

```
EMPTY       — 100 units
20 Stars    — 10 units
50 Stars    — 5 units
100 Stars   — 2 units
Premium 3m  — 1 unit
```

Each prize has:

- quantity
- remaining quantity
- relative weight
- active/inactive state
- amount
- fulfillment metadata

Remember that current effective selection uses:

```
configured weight × quantity remaining
```

so EMPTY quantity and reward quantities materially affect the observed odds.

Do not invent new adaptive modifiers.

---

## 11. IMMEDIATE NEXT STEPS

When continuing from this state, do this in order:

### A. Verify HTTPS externally

```
curl -I https://cricketbox.site
curl https://cricketbox.site/api/health
```

Expected health:

```
{"ok":true,"database":true}
```

### B. Verify production APP_URL

Server `.env` should contain:

```
APP_URL=https://cricketbox.site
```

After changing it:

```
systemctl restart cricket-box-web
systemctl restart cricket-box-bot
```

### C. Configure GitHub Actions

Repository secrets:

```
CRICKET_BOX_APP_URL
LIVEOPS_CRON_SECRET
```

Then manually run the LiveOps workflow once and inspect the result.

### D. Create the seven-day test season

Use the admin WebApp.

### E. Configure prize pool

Save the pool and verify remaining inventory.

### F. Test with one or two Telegram accounts

Test:

```
/start
→ open Mini App
→ subscribe to channel
→ participate
→ free spin
→ reward appears in profile/prizes
→ repeat attempt behavior
→ paid Stars spin
→ admin sees spin/payment
```

### G. Only then invite the larger test group

The target is approximately 50 testers for the first controlled season.

Do not claim zero downtime without a real runtime/load test.

---

## 11A. NEW DYNAMIC PRIZE BEHAVIOR (2026-10-01)

The season selector now has the dynamic balancing that was discussed for the test season.

### Player pity / anti-EMPTY

The selector tracks a user's recent completed prize kinds.

- First 0–2 consecutive EMPTY results: no pity boost.
- From the 3rd consecutive EMPTY result onward, non-EMPTY prizes receive a pity multiplier.
- The multiplier grows by 15% per additional EMPTY result, capped at 2.5×.
- EMPTY receives the inverse anti-streak multiplier, so a long EMPTY streak shifts probability toward receiving something.

The mechanic is applied server-side and is the same for free and paid spins.

### Season inventory pacing

The existing economy multiplier is now active inside the real selector.

The multiplier compares how much of a prize has been consumed with how far the season has progressed:

- a prize disappearing faster than the season pace is down-weighted;
- a prize lagging behind the season pace is up-weighted;
- exhausted inventory remains unavailable.

This provides the intended dynamic balancing without using an online-user-count multiplier.

The diagnostics written to the spin audit include the dynamic multipliers.

Latest selector commit:
```
be7f71dca — feat: restore dynamic pity and economy prize balancing
```

## 11B. DAILY GIFT — SIMPLIFIED TIER CHANCE

Daily Gift no longer treats the "chance of getting anything" as a separate weight for every reward.

The model is now two-stage:

1. Determine whether the user receives any non-EMPTY reward.
2. If yes, select the concrete reward from the existing non-EMPTY reward pool.

Configurable server-side values are stored in `app_settings.daily_gift`:

```
ROOKIE   1%
VETERAN  3%
ELITE    5%
```

These are defaults and can be changed from **Admin → System settings → Daily Gift**.

The reward types inside the successful pool remain:

- Stars: 10 / 15 / 25 / 50 / 100
- FREE_SPIN: 1
- XP: 25 / 50

This keeps the admin UI simple: one percentage per tier instead of a large table of reward weights.

A user's Daily Gift tier is normally taken from veteran history:

- 0 completed previous seasons → ROOKIE
- 2+ → VETERAN
- 4+ → ELITE

The current season is excluded when calculating historical veteran status.

The owner can manually assign an individual user's rank (ROOKIE/VETERAN/ELITE) from the Veteran admin screen. The manual rank overrides automatic season-history calculation and is used for both Daily Gift and veteran bonus eligibility. The change is audited. A search field and direct Telegram-ID assignment form are available, so the owner can promote a specific account even when it is not convenient to find in the list.

Relevant commits:
```
b22c501f — feat: add tier-based daily gift odds
ed7fd933 — fix: keep current season out of gift tier history
771526df — feat: add per-user Daily Gift tier override
6799983d — fix: repair veteran admin route syntax
4c4c1854 — feat: add Daily Gift tier override control
```

## 11C. GLOBAL EXTRA FREE-SPIN CAMPAIGNS

A separate LiveOps mechanism now exists for "today everyone gets an extra free spin" style campaigns.

Admin route:
```
/admin/bonuses
```

A campaign has:

- name
- season
- start time
- end time
- free spins per participant (1–20)
- enabled/disabled state

A participant receives the campaign reward at most once per campaign, enforced by a database unique constraint.

Multiple campaigns can exist in one season, so the operator can schedule separate bonuses for the beginning, middle and end of the season.

The bonus is lazily granted on an eligible session/spin while the campaign is active and is persisted in `bonus_free_spins`.

Relevant implementation:
```
free_spin_campaigns
free_spin_campaign_claims
src/server/free-spin-campaigns.ts
```

## 11D. CHANNEL ACTIVITY RULES / SWITCH

Channel Activity now has a server-side enable/disable setting.

The intended MVP rule is:

- 2 comments = 1 activity point.
- Maximum 20 counted comments per user per day.
- Therefore up to 10 activity points/day from comments.
- 10 activity points = 1 automatic bonus spin.
- Maximum 20 automatic activity bonus spins per season remains.

The bot now attempts to record text messages from the channel's linked discussion chat as COMMENT activity. Comment processing is limited to the first 20 counted comments per day for each user, and the point is awarded on every second counted comment.

The bot intentionally does not try to judge whether a comment is "meaningful" using AI. The product rule is communicated to users and moderation is manual.

There is also an admin switch to pause new activity-point accrual. Existing bonus spins are not silently deleted.

Telegram-specific operational prerequisite: the bot must actually receive discussion-group messages. Telegram's Bot API privacy rules mean a bot should be an administrator in the discussion group (or otherwise configured to receive the required messages). Reactions have a separate update path and are not currently used for point calculation.

Relevant implementation:
```
src/routes/api.admin.channel-activity.ts
src/routes/admin.channel-activity.tsx
scripts/telegram-bot.mjs
```

## 11E. PRIZE CHANCE QUICK CONTROL

The prize pool editor now has a simple quick-setting block:

- 5%
- 10%
- 15%
- 20%

These buttons target the approximate **base chance of receiving any non-EMPTY result** for the selected season. The helper adjusts the EMPTY weight while preserving the relative weights of actual prizes.

The displayed percentage is calculated from the current active inventory as `weight × remaining quantity`. It is explicitly only a base estimate: live season pacing and player pity can change the final per-spin probability.

The operator can still edit each prize's individual "Вес выпадения" manually when finer control is needed.

## 11E. PRIZE EDITOR UX

The admin prize editor was simplified:

- dedicated NFT button
- NFT value is displayed as estimated Stars value
- "Weight" is now "Вес выпадения" with an explanation
- image URL input removed from the visible form to reduce clutter (backend fields remain)
- "Себестоимость" is explicitly described as an economics-only value and not part of selection probability

Relevant commit:
```
1d5bed892 — feat: simplify prize editor and add NFT controls
```

## 12. SECURITY / RELIABILITY NOTES

Current protections include:

- Telegram HMAC verification
- server-authoritative identity
- PostgreSQL transactions
- row locking for inventory
- idempotency keys
- Telegram charge-ID idempotency
- payment amount/currency/user/season validation
- rate limiting
- advisory lock for the Telegram bot
- HTTPS reverse proxy
- closed PostgreSQL exposure (DB stays local)
- Hetzner Firewall with only 22/80/443 inbound

Known production gaps remain documented in `docs/IMPLEMENTATION_STATUS.md`.

In particular:

- full live HTTP replay/double-click/payment-recovery testing is still required
- real browser/Telegram QA is still required
- payout/refund verification is still required
- LiveOps GitHub secrets must be configured
- Telegram payment and PostgreSQL cannot be made one atomic external transaction
- manual fulfillment remains the MVP for Premium/money/NFT
- legal/product review of exact odds is still pending

Do not describe the system as "fully production-safe" until the remaining runtime checks are completed.

---

## 13. IMPORTANT COMMANDS

On the Hetzner server:

```
cd /opt/cricket-box-sparkle

systemctl status cricket-box-web --no-pager
systemctl status cricket-box-bot --no-pager

journalctl -u cricket-box-web -n 50 --no-pager
journalctl -u cricket-box-bot -n 50 --no-pager

curl http://127.0.0.1:3000/api/health

git pull --ff-only origin main
```

Useful project commands:

```
npm install
npm run build
npm run db:init
npm run test:product-qa
npm run test:payment-security
npm run test:spin-idempotency
npm run test:prize-probabilities
npm run check:season-odds
npm run test:bot
```

Because the repository currently has `bun.lock` rather than `package-lock.json`, the Hetzner deployment uses:

```
npm install
```

not `npm ci`.

---

## 14. GIT / LOVABLE RULE

This repository is connected to Lovable.

Do not rewrite published Git history.

Do not force-push, rebase, amend or squash already-published commits.

Keep `main` in a working state.

The current deployment pulls from:

```
origin/main
```

---

## 14A. LATEST FEATURE COMMITS (2026-10-01)

The first implementation pass introduced two JSX build errors in the new admin pages; both were corrected before production deployment:
- `admin.bonuses.tsx`: removed an extra closing `</section>`.
- `admin.channel-activity.tsx`: repaired malformed nested JSX in the header.
The web service should not be restarted from a failed build; deploy only after `npm run build` succeeds.



The latest feature work directly addresses the product feedback from testing:

```
be7f71dca  restore dynamic pity + economy prize balancing
1d5bed892  simplify prize editor + dedicated NFT control
10c383567  Daily Gift default tier odds → 1% / 3% / 5%
a35148af7  admin Daily Gift odds API
16d61c60c  admin Daily Gift odds UI
771526df9  per-user Daily Gift tier override API
4c4c18543  Daily Gift tier override UI
15a5e5aee  global free-spin campaign API
6a7910201  global free-spin campaign UI
fa5ac4b09  expose bonus campaigns from system settings
e50aebacb  channel activity system switch
755004289  session honors activity switch
6e4341ac8  channel comment activity tracking
95b4015cb  channel activity admin UI/rules
a09c9f22e  user-facing explanation of dynamic balancing
86d61777a  dynamic pity/economy regression tests
40e4d951a  migrate old Daily Gift default values
039ddcde8  reflect campaign grants in session snapshot
ed7fd9334  keep current season out of Daily Gift history
01a1e22c3  type-safe Daily Gift effective reward
ccf13706c  clean Daily Gift integration
c8e6af7af  repair veteran admin route delimiter
6799983d  repair veteran admin route syntax
c284718f7  load Daily Gift settings correctly
4cd26d23a  update this handoff documentation
```

The current Daily Gift defaults are intentionally conservative for the first test:
1% for Rookie, 3% for Veteran, 5% for Elite. They are admin-configurable.

The dynamic season selector is active in production code, but the remaining runtime proof still must be collected during the real one-week test. The test should compare observed prize distribution and inventory depletion against the configured weights and dynamic diagnostics.

## 15. LAST KNOWN WORKING CHECKPOINT

At the time this handoff was written:

- Hetzner SSH: working
- Node 22.23.3: working
- npm 10.9.9: working
- PostgreSQL: working
- fresh database schema: initialized
- production build: successful
- Nitro preset: `node-server`
- web systemd service: active
- bot systemd service: active
- bot polling: active
- `/api/health`: returns `{"ok":true,"database":true}`
- domain DNS: resolving to the Hetzner server
- firewall: TCP 22/80/443 inbound
- first test season: **NOT YET CONFIGURED**
- production live test with real users: **NOT YET COMPLETED**

### Current stopping point

The project is at the point immediately before the first real one-week test season.

Next AI should not rebuild the server from scratch. Start by verifying HTTPS/APP_URL and then create the test season in the admin panel.
