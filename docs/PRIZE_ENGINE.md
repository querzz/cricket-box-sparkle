# CRICKET BOX — Prize Engine

## Canonical MVP model

The canonical production MVP selection model is `finite-pool-v1`.

For each eligible prize:

```text
finalWeight = configuredWeight × quantityRemaining
```

The server samples one prize from the sum of all effective weights. The selected inventory unit is then consumed atomically in the same database transaction.

## Consequences

A prize with many remaining units has proportionally more weight than the same prize after units have been consumed. A prize with `quantityRemaining = 0` has zero effective weight and cannot be selected. A prize with `weight = 0` remains visible to admins but cannot be selected. `EMPTY` is not a finite reward and may continue after finite rewards have been exhausted.

The number of concurrent users does not directly enter the probability formula. There is no hidden multiplier based on online users, elapsed season time, pity, anti-streak or recent outcomes in the MVP selector.

The selector receives some legacy context fields (`elapsedFraction`, `emptyStreak`, `recentKinds`) so callers can keep audit information stable, but the canonical MVP implementation intentionally does not use those fields to alter probability.

## Configuration rules

`weight` is optional and defaults to `1` when omitted. Explicit `0` is valid. Negative, non-finite or otherwise invalid values are rejected rather than silently converted to a usable weight.

Prize economic fields, including weight, are locked once a season is ACTIVE/ENDING or has recorded spins. This prevents changing odds retrospectively after users have started playing.

Activating a season also requires at least one active prize with remaining inventory and positive weight, so a live season cannot start with an empty playable pool.

## Prize fulfillment

Winning an external or manually issued prize does not automatically transfer the reward in the MVP. This includes `NFT`, `STARS`, `PREMIUM`, `MONEY`, `PHYSICAL` and `CUSTOM` prizes won from a paid spin. The spin creates a `PENDING` payout and an admin operator completes the real-world/Telegram delivery manually.

When an admin marks a payout as `PAID`, a fulfillment reference is required (for example transaction hash, order ID, delivery code or another traceable identifier) and is written to the payout and audit log. Bulk payout actions cannot mark rewards as paid because each reward needs its own fulfillment reference.

The future automation layer should replace this manual fulfillment path with provider integrations while keeping the same payout lifecycle and audit trail.

## Per-user Stars eligibility

The pool odds are global to the configured eligible inventory. A user whose Stars balance is already at the 500 maximum does not receive Stars prize entries in their personal eligible pool until their balance has room again. This is a user-level eligibility filter, not a global probability adjustment.

## Verification

`npm run test:prize-probabilities` covers:

- weighted sampling over a representative finite pool;
- explicit `weight = 0` exclusion;
- exhausted inventory exclusion;
- sequential depletion of a finite pool without replacement;
- exact exhaustion of the configured inventory;
- fail-closed behavior for invalid negative weights.

`npm run check:season-odds` reads the currently active/ending database season and prints the configured weight, remaining inventory, effective weight and baseline probability for every prize without mutating the database.

## Product policy

Adaptive economy can be revisited as a separate product decision. It must not be enabled implicitly by changing the selector implementation or by adding hidden multipliers to the MVP path.
