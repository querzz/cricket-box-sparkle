import type { PrizeKind } from "@/server/prize-types";

export type SpinEligiblePrize = {
  kind: PrizeKind;
  quantity_remaining: number;
  is_active?: boolean;
};

/**
 * MVP rule: Stars prizes remain eligible even when the user's balance is at
 * the 500 ⭐ cap. The cap is enforced during manual payout fulfillment.
 */
export function filterEligiblePrizesForSpin<T extends SpinEligiblePrize>(prizes: T[]): T[] {
  return prizes.filter((prize) => prize.quantity_remaining > 0 && prize.is_active !== false);
}
