# CRICKET BOX

Telegram Mini App / WebApp for seasonal prize-box events.

## Source of truth

Product behavior and current MVP decisions are defined in [`docs/PRODUCT_DECISIONS.md`](docs/PRODUCT_DECISIONS.md).

The current production architecture is:

- React + TypeScript frontend
- TanStack Router server routes
- PostgreSQL persistence through `pg`
- Telegram Mini App `initData` validation on the server
- Telegram Stars payments through `XTR`
- PostgreSQL-backed rate limiting and idempotency
- append-only Stars ledger
- server-authoritative spin and prize allocation
- admin WebApp with seasons, prizes, spins, payouts, statistics, access, audit, activity, veteran and economics views
- LiveOps scheduler endpoint and scheduled drops

## Prize selection model

The MVP uses a transparent finite-pool model, versioned in audit records as `finite-pool-v1`.

For every eligible prize:

```text
finalWeight = configuredWeight × quantityRemaining
```

The winner is sampled server-side from those effective weights. Inventory is decremented atomically in the same database transaction.

This means:

- more remaining units increase a prize's chance;
- consuming units makes that prize progressively less likely;
- exhausted or inactive prizes have zero chance;
- `weight: 0` explicitly disables a prize;
- `EMPTY` can continue after finite rewards are exhausted;
- there is no hidden pity, anti-streak, online-user-count or time-based probability manipulation in the MVP.

The current model does **not** reduce or increase odds simply because more or fewer people are online. Any future adaptive economy must be explicitly approved as a product change before it is enabled.

## Seasons

A season moves through:

`DRAFT → SCHEDULED → ACTIVE → ENDING → CLOSED → PAYOUT → ARCHIVED`

Only one season may be `ACTIVE`/`ENDING` at a time. Prize economic fields are locked after a season has started being used, while remaining inventory can still be administered within the guardrails defined by the product decisions.

## Stars

The product uses one user-facing Stars concept. Telegram Stars (`XTR`) are the payment currency; the application also persists a Stars balance/ledger for the product's reward economy. The ledger is append-only and the cached balance is constrained to the configured maximum of 500.

Do not introduce a second virtual currency or rename the product Stars without an explicit product decision.

## Security / reliability

Critical operations are server-authoritative and transactional. The repository includes regression coverage for database invariants, concurrent inventory claims, spin idempotency, payment security/rate limits and prize-probability behavior.

Paid-spin completion validates the stored pending transaction, user, season and amount before settlement. Successful-payment settlement is idempotent by Telegram charge ID and payment transaction state.

## Development

```sh
npm install
npm run dev
```

Useful verification commands:

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

Demo data requires an explicit opt-in:

```sh
SEED_DEMO=true npm run seed:demo
```

## Deployment notes

The LiveOps workflow requires the deployed app URL and scheduler secret to be configured before automated production ticks can run.

Manual fulfillment remains the current model for Premium, money and NFT rewards. Provider automation and full live Telegram/browser QA are production follow-up work, not prerequisites hidden inside the local test suite.
