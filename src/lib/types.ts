/**
 * Domain types for CRICKET BOX.
 * These mirror the future backend contract — the UI never invents business data.
 */

export type SeasonState =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "ENDING"
  | "CLOSED"
  | "PAYOUT"
  | "ARCHIVED";

export type RewardKind = "STARS" | "PREMIUM" | "NFT" | "MONEY" | "EMPTY";

export type RewardStatus = "PENDING" | "RECEIVED" | "PROBLEM";

export type GiftState = "AVAILABLE" | "CLAIMED" | "COOLDOWN" | "LOCKED";

export type WithdrawalStatus = "PENDING" | "PROCESSING" | "PAID" | "REJECTED";

export interface User {
  id: string;
  username: string;
  avatarUrl?: string | undefined;
  isParticipant: boolean;
  isSubscribed: boolean;
}

export interface StarsBalance {
  /** Internal Cricket Box Stars — NOT the user's Telegram Stars. */
  amount: number;
  max: number;
}

export interface Season {
  id: string;
  code: string;
  title: string;
  state: SeasonState;
  startsAt: string;
  endsAt: string;
  /** Price of one extra spin, in internal Stars. Null when paid spins are off. */
  paidSpinPrice: number | null;
}

export interface Prize {
  id: string;
  kind: RewardKind;
  title: string;
  subtitle?: string | undefined;
  remaining: number;
  total: number;
}

export interface Reward {
  id: string;
  kind: RewardKind;
  title: string;
  subtitle?: string | undefined;
  amount?: number | undefined;
  wonAt: string;
  status: RewardStatus;
  payoutNote?: string | undefined;
}

export interface SpinState {
  freeSpins: number;
  paidSpinPrice: number | null;
  totalSpins: number;
}

export interface Gift {
  state: GiftState;
  /** ISO timestamp when the next gift unlocks. */
  availableAt: string;
}

export interface Withdrawal {
  id: string;
  rewardTitle: string;
  amount: number;
  requestedAt: string;
  status: WithdrawalStatus;
}

export interface SessionSnapshot {
  user: User;
  season: Season;
  stars: StarsBalance;
  spin: SpinState;
  gift: Gift;
  prizes: Prize[];
  rewards: Reward[];
  withdrawals: Withdrawal[];
  withdrawalMinimum: number;
}

/** Result envelope returned by every service call (backend-shaped). */
export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ServiceError };

export interface ServiceError {
  code:
    | "NO_ATTEMPTS"
    | "INSUFFICIENT_STARS"
    | "STARS_FULL"
    | "SEASON_CLOSED"
    | "SEASON_NOT_STARTED"
    | "NOT_SUBSCRIBED"
    | "GIFT_UNAVAILABLE"
    | "BELOW_MINIMUM"
    | "NETWORK";
  message: string;
}
