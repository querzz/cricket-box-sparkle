/**
 * Domain types for CRICKET BOX.
 * These mirror the future backend contract — the UI never invents business data.
 */

export type SeasonState = "DRAFT" | "SCHEDULED" | "ACTIVE" | "ENDING" | "CLOSED" | "PAYOUT" | "ARCHIVED";
export type RewardKind = "STARS" | "PREMIUM" | "NFT" | "MONEY" | "EMPTY" | "NOTHING" | "FREE_SPIN" | "XP";
export type RewardStatus = "PENDING" | "RECEIVED" | "PROBLEM";
export type GiftState = "AVAILABLE" | "CLAIMED" | "COOLDOWN" | "LOCKED";
export type WithdrawalStatus = "PENDING" | "PROCESSING" | "PAID" | "REJECTED";

export interface User {
  id: string;
  username: string;
  avatarUrl?: string | undefined;
  isParticipant: boolean;
  isSubscribed: boolean;
  veteranTier: "ROOKIE" | "VETERAN" | "ELITE";
  xp: number;
  level: number;
  levelTitle?: string | undefined;
  levelProgress?: number | undefined;
  nextLevelXp?: number | undefined;
  levelBenefit?: string | undefined;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl?: string | undefined;
  spins: number;
  wins: number;
  starsWon: number;
  level: number;
  isCurrentUser: boolean;
}

export interface StarsBalance { amount: number; max: number; }
export interface Season { id: string; code: string; title: string; state: SeasonState; startsAt: string; endsAt: string; closedAt?: string | undefined; isPaused: boolean; pausedAt?: string | undefined; paidSpinPrice: number | null; }
export interface Prize { id: string; kind: RewardKind; title: string; subtitle?: string | undefined; amount?: number | undefined; remaining: number; total: number; weight?: number | undefined; active?: boolean | undefined; imageUrl?: string | undefined; }
export interface Reward { id: string; kind: RewardKind; title: string; subtitle?: string | undefined; amount?: number | undefined; wonAt: string; status: RewardStatus; payoutNote?: string | undefined; creditedAmount?: number | undefined; uncreditedAmount?: number | undefined; }
export interface SpinState { freeSpins: number; paidSpinPrice: number | null; totalSpins: number; freeSpinDate?: string | undefined; bonusFreeSpins?: number | undefined; }
export interface Gift { state: GiftState; availableAt: string; }
export interface DailyStreakChoice { type: "STARS" | "FREE_SPIN" | "DAILY_GIFT_BOOST" | "NEXT_SPIN_BOOST"; title: string; amount: number; }
export interface DailyStreakSnapshot { enabled: boolean; totalDays: number; currentDay: number; visitedDays: number; currentStreak: number; visitedDayIndexes?: number[]; checkedInToday: boolean; eligibleForReward: boolean; rewardStars: number; cycleNo?: number; dayRewards?: number[]; day7Choices?: DailyStreakChoice[]; day7ChoiceAvailable?: boolean; closed?: boolean; stoppedReason?: string | undefined; }

export interface ActivitySnapshot { points: number; pointsPerBonus: number; pointsToNext: number; progressPercent: number; reactions: number; comments: number; joins: number; activeDays: number; bonusSpinsGranted: number; bonusSpinsRemaining: number; maxBonusSpins: number; }
export interface Withdrawal { id: string; rewardTitle: string; amount: number; requestedAt: string; status: WithdrawalStatus; }

export interface OwnerGift { id:string; title:string; message?:string; rewardType:"STARS"|"FREE_SPIN"|"XP"|"NOTE"; amount:number; createdAt:string; }

export interface SessionSnapshot {
  user: User;
  season: Season;
  stars: StarsBalance;
  spin: SpinState;
  gift: Gift;
  streak: DailyStreakSnapshot;
  ownerGift: OwnerGift | null;
  activity: ActivitySnapshot;
  prizes: Prize[];
  rewards: Reward[];
  withdrawals: Withdrawal[];
  leaderboard?: LeaderboardEntry[];
  withdrawalMinimum: number;
  dev: { simulateNetworkError: boolean };
}

export type ServiceResult<T> = | { ok: true; data: T } | { ok: false; error: ServiceError };
export interface ServiceError {
  code: "NO_ATTEMPTS" | "SEASON_PAUSED" | "INSUFFICIENT_STARS" | "STARS_FULL" | "SEASON_CLOSED" | "SEASON_NOT_ACTIVE" | "SEASON_NOT_STARTED" | "NOT_SUBSCRIBED" | "NOT_PARTICIPANT" | "NO_PRIZES" | "GIFT_UNAVAILABLE" | "GIFT_COOLDOWN" | "GIFT_BALANCE_FULL" | "WITHDRAW_NOT_OPEN" | "WITHDRAWAL_PENDING" | "WITHDRAW_FAILED" | "BELOW_MINIMUM" | "PAYMENT_REQUIRED" | "PAYMENT_CANCELLED" | "PAYMENT_FAILED" | "PAYMENT_PROCESSING" | "NETWORK";
  message: string;
}
