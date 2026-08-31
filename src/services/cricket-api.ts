/**
 * Mock CRICKET BOX API.
 *
 * This module is the ONLY place where authoritative state lives. It stands in
 * for the future backend: spin results, balances, gift availability and
 * withdrawals are all decided here, never inside React components.
 * Replacing the bodies of these methods with real `fetch` calls is the only
 * change required to go live.
 */
import { createInitialSnapshot } from "@/lib/mock-data";
import type {
  Gift,
  Reward,
  RewardKind,
  ServiceError,
  ServiceResult,
  SessionSnapshot,
  Withdrawal,
} from "@/lib/types";

const LATENCY = 550;

let state: SessionSnapshot = createInitialSnapshot();

const delay = <T>(value: T, ms = LATENCY) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const fail = (code: ServiceError["code"], message: string): ServiceResult<never> => ({
  ok: false,
  error: { code, message },
});

const clone = (): SessionSnapshot => structuredClone(state);

/** Server-side reward table. Intentionally not exported. */
const rewardTable: Array<{ kind: RewardKind; title: string; subtitle?: string; amount?: number; weight: number }> = [
  { kind: "STARS", title: "20 Stars", amount: 20, weight: 42 },
  { kind: "STARS", title: "50 Stars", amount: 50, weight: 14 },
  { kind: "PREMIUM", title: "Telegram Premium", subtitle: "3 months", weight: 8 },
  { kind: "NFT", title: "NFT Collectible", weight: 5 },
  { kind: "MONEY", title: "500 UAH", amount: 500, weight: 4 },
  { kind: "EMPTY", title: "Nothing this time", weight: 27 },
];

function rollReward(): Reward {
  const total = rewardTable.reduce((sum, r) => sum + r.weight, 0);
  let roll = Math.random() * total;
  let picked = rewardTable[rewardTable.length - 1]!;
  for (const entry of rewardTable) {
    roll -= entry.weight;
    if (roll <= 0) {
      picked = entry;
      break;
    }
  }
  return {
    id: `r_${Math.random().toString(36).slice(2, 9)}`,
    kind: picked.kind,
    title: picked.title,
    subtitle: picked.subtitle,
    amount: picked.amount,
    wonAt: new Date().toISOString(),
    status: picked.kind === "STARS" ? "RECEIVED" : "PENDING",
    payoutNote:
      picked.kind === "STARS"
        ? "Credited to your internal Stars balance."
        : "An administrator issues the prize within 48 hours.",
  };
}

function guardSeason(): ServiceResult<null> {
  const { state: s } = state.season;
  if (s === "DRAFT" || s === "SCHEDULED") return fail("SEASON_NOT_STARTED", "Season has not started yet.");
  if (s !== "ACTIVE" && s !== "ENDING") return fail("SEASON_CLOSED", "This season is closed.");
  if (!state.user.isSubscribed) return fail("NOT_SUBSCRIBED", "Subscribe to the channel to participate.");
  return ok(null);
}

function creditReward(reward: Reward) {
  if (reward.kind === "STARS" && reward.amount) {
    const room = state.stars.max - state.stars.amount;
    const credited = Math.min(room, reward.amount);
    state.stars.amount += credited;
    if (credited < reward.amount) {
      reward.payoutNote = `Balance limit reached — only ${credited} of ${reward.amount} Stars were credited.`;
    }
  }
  state.rewards = [reward, ...state.rewards];
}

export interface SpinOptions {
  /** Pay with internal Stars instead of using a free attempt. */
  paid?: boolean;
}

export const cricketApi = {
  async getSession(): Promise<ServiceResult<SessionSnapshot>> {
    return delay(ok(clone()), 350);
  },

  async spin(options: SpinOptions = {}): Promise<ServiceResult<{ reward: Reward; snapshot: SessionSnapshot }>> {
    const guard = guardSeason();
    if (!guard.ok) return delay(guard);

    if (options.paid) {
      const price = state.spin.paidSpinPrice;
      if (price === null) return delay(fail("NO_ATTEMPTS", "Paid spins are disabled for this season."));
      if (state.stars.amount < price)
        return delay(fail("INSUFFICIENT_STARS", "Not enough internal Stars for a paid spin."));
      state.stars.amount -= price;
    } else {
      if (state.spin.freeSpins <= 0) return delay(fail("NO_ATTEMPTS", "No free attempts left."));
      state.spin.freeSpins -= 1;
    }

    state.spin.totalSpins += 1;
    const reward = rollReward();
    creditReward(reward);
    return delay(ok({ reward, snapshot: clone() }), 900);
  },

  async claimGift(): Promise<ServiceResult<{ reward: Reward; snapshot: SessionSnapshot }>> {
    const guard = guardSeason();
    if (!guard.ok) return delay(guard);
    if (!state.user.isParticipant)
      return delay(fail("GIFT_UNAVAILABLE", "Only active season participants can claim the daily gift."));
    if (state.gift.state !== "AVAILABLE") return delay(fail("GIFT_UNAVAILABLE", "Your gift is on cooldown."));

    const reward: Reward = {
      id: `g_${Math.random().toString(36).slice(2, 9)}`,
      kind: "STARS",
      title: "15 Stars",
      amount: 15,
      wonAt: new Date().toISOString(),
      status: "RECEIVED",
      payoutNote: "Daily gift credited to your internal Stars balance.",
    };
    creditReward(reward);
    state.gift = {
      state: "COOLDOWN",
      availableAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    } satisfies Gift;
    return delay(ok({ reward, snapshot: clone() }), 800);
  },

  async requestWithdrawal(amount: number): Promise<ServiceResult<{ withdrawal: Withdrawal; snapshot: SessionSnapshot }>> {
    if (amount < state.withdrawalMinimum)
      return delay(fail("BELOW_MINIMUM", `Minimum withdrawal is ${state.withdrawalMinimum} Stars.`));
    if (amount > state.stars.amount) return delay(fail("INSUFFICIENT_STARS", "Not enough internal Stars."));

    state.stars.amount -= amount;
    const withdrawal: Withdrawal = {
      id: `w_${Math.random().toString(36).slice(2, 9)}`,
      rewardTitle: "Internal Stars",
      amount,
      requestedAt: new Date().toISOString(),
      status: "PENDING",
    };
    state.withdrawals = [withdrawal, ...state.withdrawals];
    return delay(ok({ withdrawal, snapshot: clone() }), 1100);
  },

  /** Dev-only helper used by the season-state switcher in Settings. */
  async setSeasonState(next: SessionSnapshot["season"]["state"]): Promise<ServiceResult<SessionSnapshot>> {
    state.season.state = next;
    return delay(ok(clone()), 200);
  },

  async setSubscribed(value: boolean): Promise<ServiceResult<SessionSnapshot>> {
    state.user.isSubscribed = value;
    return delay(ok(clone()), 200);
  },

  async reset(): Promise<ServiceResult<SessionSnapshot>> {
    state = createInitialSnapshot();
    return delay(ok(clone()), 200);
  },
};
