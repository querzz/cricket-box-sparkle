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
