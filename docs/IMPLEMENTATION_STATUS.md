# CRICKET BOX — IMPLEMENTATION STATUS

## Completed in the current frontend phase

- Russian user-facing UI across the main routes and shared components.
- Russian HTML document language.
- Finite prize inventory mock engine with weighted sampling without replacement.
- Exhausted rewards are excluded from selection.
- Stars rewards are excluded before selection for users at the 500/500 Stars cap.
- Persistent mock session across reloads.
- Network-error simulation and recovery controls.
- Season transition guard in the mock service.
- Daily Gift with its own 24-hour cooldown.
- Exactly one daily free spin for an eligible user, without accumulation.
- QA-only daily free-spin reset in Settings.
- Home prize showcase now displays readable reward names under icons, hides EMPTY and hides remaining inventory counts.
- Home now includes `Твои призы` and `Как это работает` sections.
- Home no longer contains a leaderboard block.
- Subscription area is compact and reserved as a future promotional/ad slot.
- Prize detail and withdrawal screens use Russian user-facing copy.

## Current baseline planning defaults

These are configuration examples for development/testing and are not hardcoded product promises:

- 150 target participants / 300 maximum eligible participants.
- 14-day season.
- 1 free spin/day.
- 2,000 planning outcomes.
- Paid spin starting recommendation: 100 Telegram Stars.
- Comparison scenario: 75 Stars.
- Example Season #001 reward template is documented in `PRODUCT_DECISIONS.md` and `ECONOMICS.md`.

## Not production-ready yet

- Real backend.
- PostgreSQL/Redis persistence.
- Real Telegram Mini App authentication.
- Real channel subscription verification.
- Real Telegram Stars payment confirmation.
- Production Stars ledger.
- Production-safe concurrent prize inventory transactions.
- Real withdrawal settlement process.
- Admin WebApp implementation.
- Economic Planner UI implementation.
- Production audit log storage.

## Next implementation phase

1. Build Admin WebApp shell and Dashboard.
2. Build Seasons CRUD and lifecycle controls.
3. Build Prize management and finite-pool configuration.
4. Build Economic Planner with scenario simulation and health warnings.
5. Build Participants, Spins, Payouts, Statistics and Audit Logs.
6. Define backend API contracts.
7. Build FastAPI/PostgreSQL/Redis backend.
8. Replace the mock service with production API calls.
9. Add Telegram integration and real Stars payments.
10. Run production QA, abuse tests and a limited Season #001.

## QA workflow

Local development is expected to use the GitHub repository in PyCharm:

```text
GitHub main
  ↓ git pull
PyCharm local project
  ↓ npm run dev
Browser QA
  ↓ screenshots / bug report
GitHub commit
```

Before calling a feature production-ready, verify it both in code and in the browser.
