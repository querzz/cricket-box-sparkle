# CRICKET BOX — ADMIN WEBAPP SPECIFICATION

Status: approved implementation design baseline
Repository: `querzz/cricket-box-sparkle`
Language: Russian UI
Purpose: separate web interface for operating seasons, prizes, participants, payouts, economics, statistics, admins and audit logs without code changes.

## 1. Global admin layout

Primary target: desktop/tablet; responsive on mobile.

Layout:
- fixed left sidebar on desktop;
- compact top bar with current season, notifications, admin identity and role;
- main content area;
- mobile: collapsible navigation drawer and horizontally scrollable tables/cards where needed.

Sidebar order:
1. Dashboard
2. Сезоны
3. Призы
4. Участники
5. Спины
6. Выдача
7. Экономика
8. Статистика
9. Админы
10. Настройки
11. Логи

All visible UI is Russian.

## 2. Dashboard

Purpose: immediate season health overview.

Top cards:
- Активный сезон
- Участники
- Всего спинов
- Бесплатные спины
- Платные спины
- Остаток призов
- Заявки на вывод
- Stars в обязательствах

Season status card:
- state;
- start/end;
- time remaining;
- participants target/max;
- free-spin mode.

Economic health card:
- expected free spins;
- expected paid spins;
- total planning spins;
- expected gross Stars charged;
- estimated developer revenue;
- prize liability;
- projected margin;
- break-even paid spins;
- HEALTHY / LOW MARGIN / LOSS RISK.

Alerts:
- low prize inventory;
- projected activity above planning capacity;
- payout backlog;
- unusual spin/reward rate;
- season transition pending;
- failed jobs/reconciliation.

Quick actions:
- Создать сезон
- Открыть призы
- Открыть выплаты
- Открыть экономику

## 3. Seasons

### Season list
Columns:
- ID
- Название
- Status
- Start
- End
- Participants
- Spins
- Prize inventory
- Payout status
- Actions

Filters:
- All
- Draft
- Scheduled
- Active
- Ending
- Closed
- Payout
- Archived

Search by season ID/name.

### Create season
Fields:
- season code/name;
- start date/time;
- end date/time;
- free attempts mode;
- daily free spin ON/OFF;
- max participants;
- paid spins ON/OFF;
- paid spin price in Stars;
- payout deadline hours;
- minimum Stars withdrawal;
- Stars cap;
- required channel ID;
- participation conditions;
- rules/FAQ content reference.

Buttons:
- Сохранить черновик
- Предпросмотр сезона
- Запланировать
- Активировать (only when allowed)

### Season preview
Before activation show:
- participant assumptions;
- expected/max free spins;
- expected paid spins;
- planning spins;
- prize pool size;
- Stars liability;
- material prize cost;
- estimated revenue;
- projected margin;
- warnings.

### Change locks
After first spin:
- lock price, Stars cap, minimum withdrawal, participation conditions, free-attempt rules and prize types;
- do not shorten a live season below current time;
- paid spins may be switched OFF for protection;
- increasing prize quantity/weight requires OWNER + reason + audit log.

## 4. Prizes

### Prize list
Columns:
- image
- name
- type
- quantity
- won
- remaining
- weight
- active
- estimated cost
- actions

Filters:
- type
- active/inactive
- low inventory
- exhausted

Types:
- Money
- Stars
- Telegram Premium
- NFT
- Empty

### Add/edit prize
Fields:
- name
- description
- image
- type
- quantity
- weight/probability
- active
- cost for economics planner
- payout instructions/reference

Validation:
- quantity >= won;
- weight >= 0;
- no negative remaining;
- type locked after first spin.

### Prize preview
Show user-facing card appearance and reward reveal presentation.

## 5. Participants

Table:
- Telegram ID
- username
- first seen/join date
- current season
- participation status
- free spins used
- paid spins
- total spins
- rewards won
- current Stars balance
- status

Filters:
- season
- participated/not participated
- reward status
- suspicious/high activity

Search:
- username
- Telegram ID

Actions:
- open participant detail;
- export CSV.

Participant detail:
- profile summary;
- season history;
- spin history;
- reward history;
- Stars ledger summary;
- withdrawals;
- abuse/security flags if present.

Manual balance correction:
- OWNER only;
- amount + reason + confirmation;
- creates ADMIN_CORRECTION ledger entry and audit log.

## 6. Spins

Purpose: operational/audit view of every spin.

Columns:
- spin ID
- user
- season
- timestamp
- free/paid
- payment reference if paid
- result
- prize ID/type
- Stars delta
- status
- idempotency key (masked)

Filters:
- season
- free/paid
- reward type
- date range
- success/error

Search:
- spin ID
- Telegram ID
- username

Detail view:
- request time;
- validated user/season;
- idempotency result;
- selected reward;
- inventory before/after;
- Stars ledger entries;
- error/retry metadata.

Admin cannot manually rewrite a historical spin result.

## 7. Payouts / Выдача

Tabs:
- Money
- Stars
- Premium
- NFT

Columns:
- username
- Telegram ID
- prize
- amount/term
- status
- win date
- season
- payout deadline

Statuses:
- PENDING
- PROCESSING
- PAID
- PROBLEM
- REJECTED where applicable

Actions:
- open payout;
- mark processing;
- mark paid;
- mark problem/rejected with mandatory reason;
- bulk actions.

Bulk:
- row checkbox;
- select all filtered;
- mass mark processing/paid;
- confirmation modal showing exact count and affected amount/types.

Summary cards:
- total winners
- pending
- processing
- paid
- problem
- total cash value
- Stars owed
- Premium count
- NFT count

Export/copy:
- winner list;
- filtered payout list;
- payout summary.

Historical payouts are immutable.

## 8. Economics / Экономика

This is a first-class admin feature.

### Inputs
- target participants
- max participants
- season days
- free spins/day
- daily activity assumption
- paid spins ON/OFF
- paid spin price
- paid conversion
- average paid spins/buyer
- prize quantities
- prize costs
- Stars prize quantities
- operational reserve
- safety multiplier

### Outputs
- expected free spins
- max free spins
- expected paid spins
- expected total spins
- planning spins
- gross Stars charged
- estimated developer revenue using currently approved Telegram model
- cash prize cost
- Premium cost
- NFT cost
- Stars reward liability
- Daily Gift liability
- total expected cost
- break-even paid spins
- break-even paid conversion
- projected margin
- worst-case exposure
- prize-pool utilization

### Scenario controls
Presets:
- Conservative
- Baseline
- Strong
- Stress

User can override assumptions.

### Health verdict
- HEALTHY
- LOW MARGIN
- LOSS RISK

Always show the assumptions behind the verdict.

### Recommendations
The planner may explain what to change, for example:
- reduce prize cost;
- raise spin price;
- reduce participant cap;
- increase expected paid conversion target;
- increase prize inventory only if margin remains healthy.

It must NEVER silently change product settings.

## 9. Statistics

Time range selector: 24h / 7d / 14d / 30d / season / custom.

Sections:
- participants
- new participants
- active users
- total/free/paid spins
- paid conversion
- average paid spins per buyer
- Stars charged
- Stars awarded
- Stars spent
- Stars reserved/owed
- withdrawals
- paid payouts
- prize distribution
- prize-pool utilization

Funnel:
Channel → Mini App open → eligible → first spin → return next day → paid spin → repeat paid spin → reward claim → next-season return.

Retention:
- D1
- D7
- season-to-season return

Charts must support season comparison once multiple seasons exist.

## 10. Admins

Roles:
- OWNER
- ADMIN

Permission matrix must be enforced server-side.

OWNER:
- all access;
- manage admins;
- ownership transfer;
- critical corrections;
- production-sensitive settings.

ADMIN:
- dashboard;
- seasons;
- prizes;
- participants;
- spins;
- payouts;
- economics;
- statistics;
- normal settings.

Owner-only:
- manual Stars balance correction;
- ownership transfer;
- add/remove/disable admins;
- change critical security/payment configuration.

Admin list:
- Telegram ID
- username
- role
- status
- added date
- last activity
- actions.

Admin actions:
- add
- disable
- remove
- change allowed only according to role policy.

## 11. Logs / Audit

Immutable audit records:
- timestamp
- actor admin
- role
- action
- target type/id
- before JSON
- after JSON
- reason
- metadata

Search/filter by:
- admin
- action
- target
- season
- date.

Never edit or delete audit logs from normal UI.

## 12. Settings

### Product settings
- default season duration
- default free spin mode
- daily free spin ON/OFF
- max participants
- paid spin ON/OFF
- default paid spin price
- default Stars cap
- default minimum withdrawal
- payout deadline

### Safety
- rate-limit thresholds
- participant cap defaults
- economic safety multiplier
- free-spin pause threshold
- low inventory threshold
- abnormal activity alerts

### Telegram
- required channel ID
- bot settings references
- payment feature flag
- support configuration.

Critical settings require OWNER and explicit confirmation.

## 13. Daily free-spin controls

Admin must be able to choose:
- daily free spin enabled/disabled;
- 1/day default;
- non-accumulating default;
- optional maximum per user/season;
- participant eligibility rule.

Planner must immediately show:
- expected free spins;
- maximum free spins;
- expected total spins;
- economic exposure.

When configured safety threshold is reached, system may pause new free-spin grants only according to explicit season settings and must log the event.

## 14. Veteran / Founder V2

Veteran settings remain disabled by default.

When enabled:
- configure eligibility thresholds;
- configure buff table;
- configure duration;
- configure max benefit;
- show projected additional free-spin/economic exposure.

No automatic jackpot probability boost.

Founder badge can be configured as cosmetic-only.

## 15. Common UI states

Every admin page must support:
- loading skeleton;
- empty state with next action;
- server/network error with retry;
- permission denied;
- destructive-action confirmation;
- unsaved changes warning;
- stale-data warning where relevant.

## 16. Implementation sequence

Build mock/API-contract frontend first:
1. App shell/navigation
2. Dashboard
3. Seasons
4. Prizes
5. Participants
6. Spins
7. Payouts
8. Economics
9. Statistics
10. Admins
11. Logs
12. Settings

Acceptance criteria:
- all screens are usable in Russian;
- no section requires editing source code for normal operations;
- permission states are visible;
- mock data supports realistic workflows;
- economic planner explains its assumptions;
- no frontend-only permission check is treated as security.
