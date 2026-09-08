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

Prize economic fields, including weight, are locked after the season has started being used. This prevents changing odds retrospectively after users have already spun.

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
