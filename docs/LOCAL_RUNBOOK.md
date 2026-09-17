# CRICKET BOX — Local Runbook

This is the shortest local setup for running the Mini App, Telegram bot, PostgreSQL and a public HTTPS tunnel.

## 1. Install dependencies

```sh
npm install
```

## 2. Prepare `.env`

Copy `.env.example` to `.env` and fill the real local values:

```sh
cp .env.example .env
```

Required values for the normal local flow:

- `DATABASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_CHANNEL_ID`
- `TELEGRAM_SUPPORT_USERNAME`
- `APP_URL`
- `OWNER_TELEGRAM_ID`
- `ADMIN_TELEGRAM_IDS`

`OWNER_TELEGRAM_ID` and `ADMIN_TELEGRAM_IDS` are bootstrap inputs only. Once an admin record exists in PostgreSQL, running `npm run db:init` does not reactivate or overwrite that record. Manage active/revoked admin access in the Admin WebApp.

## 3. Initialize PostgreSQL

```sh
npm run db:init
```

This applies `db/schema.sql` and compatibility migrations.

## 4. Start the Mini App

Terminal 1:

```sh
npm run dev
```

The local app is served on:

```text
http://localhost:8081
```

## 5. Expose it through Cloudflare

Terminal 2:

```sh
cloudflared tunnel --url http://localhost:8081
```

Cloudflare prints a temporary public HTTPS URL such as:

```text
https://something.trycloudflare.com
```

Put that URL into `.env`:

```text
APP_URL=https://something.trycloudflare.com
```

Then restart the dev server so the bot and server-side configuration use the new value.

For a permanent Cloudflare Tunnel, use the normal named-tunnel setup instead of the temporary `trycloudflare.com` URL.

## 6. Start the Telegram bot

Terminal 3:

```sh
npm run bot
```

The bot uses long polling (`getUpdates`). Only run one polling instance at a time.

On startup it checks the configured channel and prints the Mini App URL. Telegram Web Apps and production invoices require an HTTPS `APP_URL`.

## 7. Recommended local start order

```text
Terminal 1: npm run dev
Terminal 2: cloudflared tunnel --url http://localhost:8081
Edit .env: APP_URL=https://<cloudflare-url>
Restart Terminal 1: npm run dev
Terminal 3: npm run bot
```

## 8. Optional verification

```sh
npm run test:prize-probabilities
npm run test:db
npm run test:liveops
npm run test:spin-idempotency
npm run test:payment-security
npx tsc --noEmit
npm run lint
npm run build
```

## 9. Demo data

Only run this when demo data is explicitly needed:

```sh
npm run db:seed:demo
```

Do not use demo seeding against a real production database.
