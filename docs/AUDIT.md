# CRICKET BOX — Production Code Audit
Date: 2026-10-05
Repository checkpoint reviewed: `main` at `8733a3cfa4acd857ac8e6f994bd7450350004c97`.

This is a code/read-model audit, not a claim that every item below is currently reproducible in production. Findings are limited to behavior visible in the repository.

## Priority

### CRITICAL

1. **Clean database bootstrap ordering**
   `db/schema.sql` contains `ALTER TABLE seasons ...` statements before the `seasons` table is created. A truly clean PostgreSQL bootstrap can therefore fail before the table exists. Existing databases may hide this because the table is already present.

2. **Season Report mixes test users into multiple metrics**
   The Season Report filters `is_test=FALSE` for some sections, but not consistently. The inconsistency can pollute participants, spins, rewards, payments, payouts, gifts, streak, engagement, retention, prize usage, daily activity and repeat-player metrics.

## HIGH

3. **Season Report veteran history counts spins, not seasons**
   The report's historical tier query uses `COUNT(*)` over completed spins. It should count distinct completed season IDs per user.

4. **Admin Spins includes test users**
   `/api/admin/spins` joins users but has no `u.is_test=FALSE` predicate.

5. **Admin Payouts includes test users**
   `/api/admin/payouts` does not exclude test users in either the payout list or aggregate counters.

6. **Admin Economics can include test spins**
   The economics view uses season/spin data without a consistent test-user exclusion.

7. **Admin Statistics has inconsistent test filtering**
   Headline aggregates use test-user filtering in several places, while the daily spin series and retention paths are not consistently filtered the same way.

8. **Admin dashboard selected-season mismatch**
   The dashboard statistics request does not consistently pass the selected historical season, so headline statistics can describe the current season while a historical season is selected.

9. **GET /api/admin/seasons has a write side effect**
   The read endpoint calls live-season repair logic that can mutate the database by closing duplicate active/ending seasons.

10. **Channel Activity ingestion is operationally fragile**
    Activity depends on the Telegram bot receiving the right update types and resolving the linked discussion chat. Historical discussion messages cannot be backfilled through the Bot API. The admin activity API also performs live Telegram API calls on page load.

11. **Channel Activity season attribution is only time-window based**
    `channel_activity` has no `season_id`, so historical season reports infer activity by timestamps rather than exact season ownership.

12. **Prize editor writes are not atomic**
    The admin UI saves prize rows through separate requests. A partial failure can leave only some edits applied.

13. **Prize economic override is backend/frontend asymmetric**
    The backend supports an economics override/reason, but the current prize editor does not expose that capability.

14. **Free-spin campaign schedule fields are not fully enforced**
    Campaigns have start/end fields in the data/UI, but the runtime grant path primarily checks campaign enabled/season state; the displayed schedule is therefore not a complete enforcement boundary.

15. **Owner-gifts settings update has a race window**
    The personal-gift configuration path uses read/modify/write of app settings without a transaction/lock, so concurrent admins can overwrite one another.

16. **Manual free-spin grant can silently do nothing without user_state**
    The balance admin free-spin branch can update zero rows when a user has no `user_state` yet instead of first creating that state.

17. **Channel Activity aggregates can include test users**
    Aggregate counters in the activity admin API do not consistently apply the same test-user exclusion as the per-user list.

18. **Participants “All seasons” is not truly all seasons**
    The empty season filter resolves to the latest/current season rather than a true cross-season union.

## MEDIUM

19. **Season display codes are generated positionally**
    Some admin/public display code paths derive the visible ordinal from list position rather than always using the persisted database code.

20. **Season Report activity metrics are timestamp proxies**
    Because activity rows lack `season_id`, a report can only attribute them by date range.

21. **Historical withdrawal attribution can be incomplete**
    The report relies on `stars_ledger.season_id` for withdrawal attribution, so older withdrawal entries that lack a season ID can disappear from historical season totals.

22. **Retention logic is duplicated**
    Season Report and Admin Statistics calculate retention independently, which creates a risk of future drift.

23. **Economy planner path may be stale/unused**
    The repository contains an economics planner and a persisted economy-snapshot flow; the live selection engine and report are the more important runtime sources of truth.

24. **Implementation status documentation can lag code**
    `docs/IMPLEMENTATION_STATUS.md` contains historical checkpoints and must be treated as handoff documentation, not an authoritative proof of the current Git head.

## Fix plan

### Block 1 — reporting/data correctness
- normalize Season Report to exclude test users everywhere it represents player-facing/operational production metrics;
- count distinct completed previous seasons for veteran/elite history;
- keep the report season-specific.

### Block 2 — admin read models
- exclude test users from Spins, Payouts and Economics;
- align Statistics daily/retention filters with headline filters;
- fix dashboard selected-season statistics;
- remove database mutation from season GET.

### Block 3 — operational/reliability
- enforce campaign start/end windows in the actual grant path;
- harden Channel Activity configuration/aggregation and document the no-backfill limitation;
- fix clean-schema ordering.

### Block 4 — mutation safety
- make prize saves atomic;
- close the economics-override UI/backend gap;
- make owner-gift settings updates concurrency-safe;
- initialize user state before manual free-spin grants;
- make historical “all seasons” semantics explicit.

Do not rewrite working features solely for style. Each change should be small, verified against the existing data model, and committed separately or in a tightly scoped batch.


## Fix status — 2026-10-05

### Block 1 — reporting/data correctness ✅
Implemented:
- Season Report production metrics now exclude `users.is_test=TRUE`.
- Historical Veteran/Elite calculation now counts distinct previous seasons, not completed spins.
Commit: `86def1b03910849a91bba53f2d0387e57b361aa3`.

### Block 2 — admin read models ✅
Implemented:
- Admin Spins excludes test users.
- Admin Payouts excludes test users in list and aggregates.
- Admin Economics spin counters exclude test users.
- Admin Statistics aligns test-user filtering for payout, withdrawal, daily-spin and retention paths.
- Statistics can target an explicitly selected season.
- Admin dashboard passes the selected season to statistics.
- Season list GET no longer repairs/mutates live seasons.
Commits:
`24dd2fe8e813dd90dbb415790ac7159ea6df4f24`
`f89009f82bd4589794b1f1487aa8c4ea92d6fd2e`
`298692defaaed9ba1090269f6381bd9b6b1a4d59`
`53a57d8e03a376071d53857d4fcf8c6bafcf0099`
`1e736815194c742fcbad910a723f7a158e3e36e9`
`6288a151c24529af8a0543babc330c8730a85db2`
`85752de05bced944d3e8996f09750deed12b8e64`
`753749838c7383a0be7ef754419b563959f20cad`.

### Block 3 — operational/reliability ✅
Implemented:
- Free-spin campaign grants now respect their configured start/end window, including the current-participant grant path.
- Channel Activity aggregate counters exclude test users consistently.
- Clean schema bootstrap no longer references `seasons` before the table exists.
Commits:
`43a2ad3cf597c3c5df0b28d8b972f8b959e9e44d`
`69849c1b5eb4cf0b9961006e0a4f70cc54d8fd24`
`9a83666441ce11abfb0b6ebca1f5c64534260d80`.

### Block 4 — mutation safety / semantics ✅ (targeted fixes)
Implemented:
- Manual free-spin grants initialize `user_state` before updating it.
- Personal owner-gift creation now reads/modifies/writes the settings row inside a transaction.
- Participants “Все сезоны” is now a real cross-season query rather than silently falling back to the current season.
Commits:
`82d82a272d3a5cd9cdc639564b462087b4df4b25`
`01e3a699c06a71acc000af2325014b91d874e8eb`
`4f6a7000c590dd00653d4cb5b6578132ae5045a7`
`e9580d39159d94fc10e744ba372b4c3f1362dcd5`
`52f1f5de2fea1e2082ff26a341f08a5da8fcfc6c`.

### Remaining audit items
The following are intentionally not marked fixed yet:
- atomic multi-prize editor save;
- economics-override UI/backend parity;
- deeper Channel Activity ingestion/runtime validation and no-backfill limitation;
- historical withdrawal attribution gaps;
- duplicated retention implementation;
- positional season display codes;
- stale implementation-status documentation;
- any issue that still needs real Telegram/browser/PostgreSQL runtime verification.

The code changes above are repository-level fixes. They do not by themselves prove production deployment or end-to-end runtime success.


## 2026-10-05 repair findings and implementation target

The latest deployed QA pass exposed several real runtime gaps that were not covered by the earlier green static/integration checks:

- Stars spin rewards were still modeled as manual payout rows instead of immediate user-balance credits.
- The Payouts list has a PostgreSQL parameter-binding bug in its counts query.
- Admin Spins season loading needs a runtime-safe season list path and Bonus filtering.
- Daily Streak derives its horizon from planned end dates and therefore survives an early close visually.
- Season Report also derives duration from the planned end instead of the actual close.
- Audit still exposes raw entity UUIDs prominently.
- Owner Gifts and Entertainment Mechanics need end-to-end behavior, not just forms/settings.

The accepted repair sequence is documented in docs/REPAIR_PLAN_2026-10-05.md.
