# Cricket Box Sparkle

IMPORTANT — READ THIS FIRST. DO NOT BUILD OR MODIFY ANYTHING YET.

This is an EXISTING CRICKET BOX project.

Before doing anything, first inspect the connected GitHub repository and determine whether you can actually access the repository containing the CURRENT COMPLETE FRONTEND of the CRICKET BOX project.

You must verify that you can see the existing frontend source code, including the current pages/components/styles/assets structure.

FIRST RESPONSE MUST BE ONLY:

1. Confirm whether you can access the GitHub repository.

2. Confirm whether the repository contains the current complete CRICKET BOX frontend.

3. Briefly list the main frontend structure/files/pages you can see.

DO NOT modify code.

DO NOT create files.

DO NOT rebuild anything.

DO NOT make design changes.

DO NOT start implementation.

If you CANNOT access the repository, or if the repository does NOT contain the current complete frontend, STOP and tell me exactly what is missing.

ONLY if you confirm that the complete current frontend is accessible in GitHub, wait for my confirmation before making any changes.

==================================================

PROJECT

==================================================

Project: CRICKET BOX

This is a Telegram Mini App / WebApp built around seasonal prize-box events.

The current frontend already exists.

Your job is NOT to rebuild the project from scratch.

Your job is to improve the EXISTING frontend.

The visual reference screenshots I provide are the target design direction.

==================================================

CRITICAL PRODUCT LOGIC

==================================================

Keep the existing concept.

Each season is a separate event:

CRICKET BOX #001

CRICKET BOX #002

etc.

The frontend must be reusable for different seasons and must not hardcode season-specific values.

The application should support:

- current active season

- countdown

- participation status

- free attempts

- Cricket Box spin

- possible prizes

- internal Stars balance

- daily gift

- My Prizes

- withdrawals

- profile

- rules

- FAQ

- activity history

- support

==================================================

INTERNAL STARS

==================================================

IMPORTANT:

Do NOT introduce another currency such as Cricket Credits.

Keep the existing INTERNAL CRICKET BOX STARS concept.

Example:

⭐ 125 / 500

These internal Stars are separate from the user's real Telegram Stars balance.

Internal Cricket Box Stars can be:

- won as rewards

- spent on additional spins

- withdrawn according to season rules

Maximum internal balance is configurable.

Example:

500 / 500

The user may still participate in spins for other reward types, but Stars rewards must not increase the internal balance above the configured maximum.

If the user spends:

15 Stars

then:

500 / 500

becomes

485 / 500

and the user has room for new Stars rewards again.

Do NOT rename this internal currency.

==================================================

FRONTEND GOAL

==================================================

Preserve the existing implementation.

Do NOT rebuild the app from scratch.

Do NOT replace the current architecture unless absolutely necessary.

Refactor only when needed.

The result should remain a real working React/TypeScript frontend.

No static mockups.

No screenshot-as-background tricks.

All interfaces must be implemented as real components.

==================================================

VISUAL DIRECTION

==================================================

Use the attached screenshots as the main visual reference.

Desired style:

- dark

- moody

- glossy

- pink / raspberry / black

- cute luxury

- subtle grunge

- glassmorphism

- soft glow

- premium mobile-game feeling

- anime-inspired mascot

- polished 3D reward objects

It must feel like a premium Telegram mini-game.

It must NOT feel like:

- a generic SaaS dashboard

- a casino website

- a simple landing page

==================================================

VISUAL POLISH

==================================================

Improve the current implementation rather than replacing it.

Main priorities:

1. Better visual hierarchy.

2. More premium glass surfaces.

3. Stronger but controlled pink/magenta glow.

4. Dark background with better depth.

5. Better spacing.

6. Better typography hierarchy.

7. More polished buttons.

8. More polished cards.

9. More coherent decorative elements.

10. More exciting reward presentation.

Keep decoration behind important content.

The hierarchy should be:

1. Cricket Box / reward

2. primary CTA

3. Stars balance / attempts

4. prize pool

5. secondary information

==================================================

HOME

==================================================

Keep the existing Home structure.

The main screen should contain:

- avatar

- Cricket Box branding

- internal Stars balance

- gift button

- season countdown

- active status

- Cricket Box

- large SPIN button

- attempts information

- possible prizes

- link to all prizes

- participation/subscription information

Improve spacing and reduce unnecessary empty space.

Make the Cricket Box + mascot composition cinematic.

==================================================

DRAW

==================================================

Keep:

- season title

- active status

- internal Stars balance, for example 125 / 500

- Cricket Box

- SPIN

- EXTRA SPIN · 15 STARS

- free attempt information

- countdown

The Cricket Box should be slightly smaller than the current implementation if necessary so that the CTA and information remain visually balanced.

Add subtle ambient glow.

The SPIN CTA should be the strongest interactive element.

==================================================

MY PRIZES

==================================================

Keep:

ALL

PENDING

RECEIVED

Reward cards should show:

- icon/image

- reward name

- amount when applicable

- date

- status

Statuses:

PENDING

RECEIVED

PROBLEM

Also show the season prize pool.

Prize pool should communicate:

- reward

- remaining quantity

- rarity/value

==================================================

PROFILE

==================================================

Show:

- avatar

- username

- participant status

- internal Stars balance

Example:

⭐ 125 / 500

Keep the explanation:

Internal Cricket Box Stars are separate from Telegram Stars.

Sections:

- Leaderboard

- Rules

- FAQ

- Activity history

- Support

- Settings

Include withdrawal access.

==================================================

DAILY GIFT

==================================================

Keep the daily gift as a major retention mechanic.

States:

AVAILABLE

CLAIMED

COOLDOWN

Screen should include:

- premium 3D gift

- OPEN button

- availability information

- subtle particles/glow

The gift screen must visually belong to the same design system as the rest of the app.

==================================================

REWARD REVEAL

==================================================

This is one of the most important experiences.

When a user wins:

1. dim/blur background

2. suspense

3. reward enters

4. glow

5. scale animation

6. subtle particles

7. final reward state

8. CLAIM action

Make it feel genuinely rewarding.

Do not overdo effects or hurt mobile performance.

==================================================

EDGE STATES

==================================================

The frontend must have proper UI states for:

- loading

- network error

- free spin already used

- insufficient internal Stars

- internal Stars balance full

- season not started

- season active

- season ending

- season ended

- payout period

- archived season

- user not subscribed

- gift already claimed

- withdrawal pending

- reward received

- reward problem

- payment processing

Do not only build the happy path.

==================================================

MOBILE

==================================================

Primary target:

390 × 844

Also support:

375 × 812

412 × 915

430 × 932

Requirements:

- no horizontal scrolling

- correct safe areas

- bottom navigation always usable

- important actions remain visible

- no excessive empty space

- no oversized elements pushing primary actions too far down

==================================================

COMPONENT ARCHITECTURE

==================================================

Keep/create reusable components where appropriate:

- CricketBox

- PrimaryButton

- GlassCard

- RewardCard

- PrizePool

- StarsBalance

- Countdown

- GiftCard

- BottomNavigation

- StatusBadge

- RewardReveal

- WithdrawalModal

- ConfirmModal

- EmptyState

- ErrorState

- LoadingState

Avoid giant components.

Keep the code maintainable.

==================================================

DATA / BACKEND PREPARATION

==================================================

This task is FRONTEND ONLY.

Do not build the backend unless explicitly requested.

However, the frontend must be structured so that later it can connect to a real backend.

Use realistic mock data / service abstraction for:

- User

- Season

- Prize

- Spin

- Reward

- StarsBalance

- Gift

- Withdrawal

Do NOT trust frontend state for critical operations.

The eventual backend will be responsible for:

- spin results

- user identity

- internal Stars balance

- reward allocation

- withdrawals

- payment verification

Do not put security-sensitive business logic directly into UI components.

==================================================

IMPORTANT

==================================================

Do not erase or replace the current project.

Do not rebuild from zero.

Do not remove working functionality simply to simplify the implementation.

First inspect the existing GitHub project.

Then, after confirming that the complete frontend is accessible, make changes incrementally while preserving the current functionality.

Use the provided screenshots as visual references, not as static images.

The final result must be a real working frontend with actual navigation, state changes, modals, tabs, buttons and realistic mock interactions.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c400fef7-d943-4658-b17e-17f5eec09ce6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
