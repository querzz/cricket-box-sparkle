# CRICKET BOX — Phase 1 QA Checklist

This checklist is for the local mock frontend before Admin WebApp work begins.

## Home
- [ ] Possible prizes show real names/values under each icon.
- [ ] Empty outcome is never shown in the possible-prize strip.
- [ ] Prize strip can be swiped horizontally on touch devices.
- [ ] Prize strip can be dragged horizontally with a mouse/trackpad.
- [ ] Prize strip does not reveal remaining inventory counts.
- [ ] “Твои призы” shows only the latest real reward.
- [ ] “Твои призы → Все” opens the full reward history.
- [ ] First-time user sees an empty-state CTA instead of a fake reward.
- [ ] “Как это работает” explains the basic three-step flow.
- [ ] Season activity counter reflects actual mock spins.

## Spin
- [ ] Empty result opens the reward modal but is not saved to My Prizes.
- [ ] Empty result is not shown in profile activity history.
- [ ] Real reward is saved to My Prizes.
- [ ] Exhausted inventory (`remaining = 0`) is never selected.
- [ ] At 500/500 Stars, Stars rewards are excluded before selection.
- [ ] Spending Stars creates free capacity again.
- [ ] Rapid repeated clicks create at most one spin.
- [ ] Failed spin does not consume a free attempt or paid Stars.

## Daily free spin
- [ ] Eligible active participant has one free spin on the current calendar day.
- [ ] Using it changes available free spins to zero for that day.
- [ ] Refresh/reload does not restore the used daily spin.
- [ ] A new calendar day grants one new free spin.
- [ ] Unused spins do not accumulate.
- [ ] Closing season prevents future daily grants.
- [ ] Settings “Выдать” can replay the current-day grant for QA.

## Season states
- [ ] Active allows participation.
- [ ] Closed/ended disables spin and gift.
- [ ] Ended home state does not show stale countdown/attempt copy.
- [ ] Invalid season transitions are rejected.

## Prizes
- [ ] My Prizes contains only actual rewards.
- [ ] Empty result never creates a reward detail route.
- [ ] Prize-pool page can still show inventory and remaining counts.
- [ ] Pending/received/problem filters work.

## Error states
- [ ] Settings can enable simulated network failure.
- [ ] Reload shows error state on routes that need session data.
- [ ] Retry works after disabling the simulation.

## Persistence
- [ ] Real rewards persist after reload.
- [ ] Stars balance persists after reload.
- [ ] Daily free-spin usage persists after reload.
- [ ] Gift cooldown persists after reload.
- [ ] Withdrawal history persists after reload.
- [ ] Reset mock session clears mock state.

## Before Phase 2
- [ ] No visible English user copy remains in the main user flow.
- [ ] Local mock is treated as QA only, not production authority.
- [ ] Admin WebApp remains the next implementation phase.
