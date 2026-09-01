import type { SessionSnapshot } from "./types";

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

export const STARS_MAX = 500;
export const WITHDRAWAL_MINIMUM = 50;

export function createInitialSnapshot(): SessionSnapshot {
  return {
    user: {
      id: "u_1",
      username: "@username",
      isParticipant: true,
      isSubscribed: true,
      xp: 0,
      level: 1,
    },
    season: {
      id: "s_001",
      code: "CRICKET BOX #001",
      title: "Founder Season",
      state: "ACTIVE",
      startsAt: new Date(now - 2 * day).toISOString(),
      endsAt: new Date(now + 12 * day).toISOString(),
      paidSpinPrice: 100,
    },
    stars: { amount: 125, max: STARS_MAX },
    spin: { freeSpins: 1, paidSpinPrice: 100, totalSpins: 0 },
    gift: { state: "AVAILABLE", availableAt: new Date(now).toISOString() },
    prizes: [
      { id: "p_money", kind: "MONEY", title: "500 грн", remaining: 1, total: 1, weight: 1, amount: 500 },
      { id: "p_prem3", kind: "PREMIUM", title: "Telegram Premium", subtitle: "3 месяца", remaining: 1, total: 1, weight: 1 },
      { id: "p_stars100", kind: "STARS", title: "100 Stars", amount: 100, remaining: 2, total: 2, weight: 1 },
      { id: "p_stars50", kind: "STARS", title: "50 Stars", amount: 50, remaining: 5, total: 5, weight: 1 },
      { id: "p_stars20", kind: "STARS", title: "20 Stars", amount: 20, remaining: 11, total: 11, weight: 1 },
      { id: "p_empty", kind: "EMPTY", title: "Пусто", remaining: 1980, total: 1980, weight: 1 },
    ],
    rewards: [],
    withdrawals: [],
    withdrawalMinimum: WITHDRAWAL_MINIMUM,
    dev: { simulateNetworkError: false },
  };
}
