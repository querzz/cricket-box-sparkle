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
    },
    season: {
      id: "s_001",
      code: "CRICKET BOX #001",
      title: "Season One",
      state: "ACTIVE",
      startsAt: new Date(now - 2 * day).toISOString(),
      endsAt: new Date(now + 2 * day + 17 * 60 * 60 * 1000 + 45 * 1000).toISOString(),
      paidSpinPrice: 15,
    },
    stars: { amount: 125, max: STARS_MAX },
    spin: { freeSpins: 1, paidSpinPrice: 15, totalSpins: 6 },
    gift: { state: "AVAILABLE", availableAt: new Date(now).toISOString() },
    prizes: [
      { id: "p_money", kind: "MONEY", title: "500 UAH", remaining: 3, total: 5 },
      {
        id: "p_prem3",
        kind: "PREMIUM",
        title: "Telegram Premium",
        subtitle: "3 months",
        remaining: 2,
        total: 4,
      },
      {
        id: "p_prem6",
        kind: "PREMIUM",
        title: "Telegram Premium",
        subtitle: "6 months",
        remaining: 1,
        total: 2,
      },
      { id: "p_nft", kind: "NFT", title: "NFT Collectible", remaining: 2, total: 3 },
      { id: "p_stars", kind: "STARS", title: "20 Stars", remaining: 10, total: 40 },
    ],
    rewards: [
      {
        id: "r_1",
        kind: "STARS",
        title: "20 Stars",
        amount: 20,
        wonAt: new Date(now - 3 * day).toISOString(),
        status: "RECEIVED",
        payoutNote: "Credited to your internal Stars balance.",
      },
      {
        id: "r_2",
        kind: "PREMIUM",
        title: "Telegram Premium",
        subtitle: "3 months",
        wonAt: new Date(now - 4 * day).toISOString(),
        status: "PENDING",
        payoutNote: "An administrator issues the prize within 48 hours.",
      },
      {
        id: "r_3",
        kind: "MONEY",
        title: "5000 UAH",
        amount: 5000,
        wonAt: new Date(now - 5 * day).toISOString(),
        status: "PENDING",
        payoutNote: "Paid out after the season closes.",
      },
      {
        id: "r_4",
        kind: "NFT",
        title: "NFT Collectible",
        wonAt: new Date(now - 6 * day).toISOString(),
        status: "PROBLEM",
        payoutNote: "Transfer failed. Support is reviewing your case.",
      },
    ],
    withdrawals: [
      {
        id: "w_1",
        rewardTitle: "Internal Stars",
        amount: 60,
        requestedAt: new Date(now - 2 * day).toISOString(),
        status: "PENDING",
      },
      {
        id: "w_2",
        rewardTitle: "Internal Stars",
        amount: 120,
        requestedAt: new Date(now - 8 * day).toISOString(),
        status: "PAID",
      },
    ],
    withdrawalMinimum: WITHDRAWAL_MINIMUM,
  };
}
