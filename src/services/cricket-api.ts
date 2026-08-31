/**
 * Mock CRICKET BOX API.
 *
 * This module is the ONLY place where authoritative state lives in the mock.
 * It stands in for the future backend: spin results, balances, gift
 * availability and withdrawals are all decided here, never inside React.
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
const STORAGE_KEY = "cricket-box:mock-session:v1";

function loadState(): SessionSnapshot {
  const initial = createInitialSnapshot();
  if (typeof localStorage === "undefined") return initial;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    const saved = JSON.parse(raw) as Partial<SessionSnapshot>;
    return {
      ...initial,
      ...saved,
      user: { ...initial.user, ...saved.user },
      season: { ...initial.season, ...saved.season },
      stars: { ...initial.stars, ...saved.stars },
      spin: { ...initial.spin, ...saved.spin },
      gift: { ...initial.gift, ...saved.gift },
      dev: { ...initial.dev, ...saved.dev },
    };
  } catch {
    return initial;
  }
}

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage is optional in the mock.
  }
}

let state: SessionSnapshot = loadState();
let hydrated = typeof localStorage !== "undefined";

function ensureHydrated() {
  if (hydrated || typeof localStorage === "undefined") return;
  state = loadState();
  hydrated = true;
}

function networkError() {
  return fail("NETWORK", "Network request failed. Check your connection and try again.");
}

const delay = <T>(value: T, ms = LATENCY) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const fail = (code: ServiceError["code"], message: string): ServiceResult<never> => ({
  ok: false,
  error: { code, message },
});

const clone = (): SessionSnapshot => {
  persist();
  return structuredClone(state);
};

const SEASON_TRANSITIONS: Record<SessionSnapshot["season"]["state"], readonly SessionSnapshot["season"]["state"][]> = {
  DRAFT: ["SCHEDULED"],
  SCHEDULED: ["ACTIVE"],
  ACTIVE: ["ENDING", "CLOSED"],
  ENDING: ["CLOSED"],
  CLOSED: ["PAYOUT"],
  PAYOUT: ["ARCHIVED"],
  ARCHIVED: [],
};

function guardSeason(): ServiceResult<null> {
  const { state: s } = state.season;
  if (s === "DRAFT" || s === "SCHEDULED") return fail("SEASON_NOT_STARTED", "Season has not started yet.");
  if (s !== "ACTIVE" && s !== "ENDING") return fail("SEASON_CLOSED", "This season is closed.");
  if (!state.user.isSubscribed) return fail("NOT_SUBSCRIBED", "Subscribe to the channel to participate.");
  return ok(null);
}

function getEligiblePrizes(): SessionSnapshot["prizes"] {
  const starsAreFull = state.stars.amount >= state.stars.max;

  return state.prizes.filter((prize) => {
    if (prize.remaining <= 0) return false;
    if (prize.kind === "STARS" && starsAreFull) return false;
    return prize.weight === undefined || prize.weight > 0;
  });
}

/**
 * Finite inventory draw: each remaining prize unit is an eligible outcome.
 * This is the mock implementation of weighted sampling without replacement.
 */
function rollReward(): Reward | null {
  const eligible = getEligiblePrizes();
  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce(
    (sum, prize) => sum + prize.remaining * (prize.weight ?? 1),
    0,
  );

  let roll = Math.random() * totalWeight;
  let picked = eligible[eligible.length - 1]!;

  for (const prize of eligible) {
    roll -= prize.remaining * (prize.weight ?? 1);
    if (roll <= 0) {
      picked = prize;
      break;
    }
  }

  const inventory = state.prizes.find((prize) => prize.id === picked.id);
  if (!inventory || inventory.remaining <= 0) return null;

  inventory.remaining -= 1;

  const amount = picked.kind === "STARS"
    ? Number(picked.title.replace(/[^0-9]/g, "")) || undefined
    : undefined;

  return {
    id: `r_${Math.random().toString(36).slice(2, 9)}`,
    kind: picked.kind as RewardKind,
    title: picked.title,
    subtitle: picked.subtitle,
    amount,
    wonAt: new Date().toISOString(),
    status: picked.kind === "STARS" ? "RECEIVED" : "PENDING",
    payoutNote:
      picked.kind === "STARS"
        ? "Stars were added to your Cricket Box balance."
        : "An administrator issues the prize within 48 hours.",
  };
}

function creditReward(reward: Reward) {
  if (reward.kind === "STARS" && reward.amount) {
    const room = Math.max(0, state.stars.max - state.stars.amount);
    const credited = Math.min(room, reward.amount);
    state.stars.amount += credited;
    reward.creditedAmount = credited;
    reward.uncreditedAmount = reward.amount - credited;
    if (credited < reward.amount) {
      reward.payoutNote = `Balance limit reached — only ${credited} of ${reward.amount} Stars were credited.`;
    }
  }
  state.rewards = [reward, ...state.rewards];
}

export interface SpinOptions {
  /** Pay with Telegram Stars instead of using a free attempt. */
  paid?: boolean;
}

export const cricketApi = {
  async getSession(): Promise<ServiceResult<SessionSnapshot>> {
    ensureHydrated();
    if (state.dev.simulateNetworkError) return delay(networkError(), 350);
    return delay(ok(clone()), 350);
  },

  async spin(options: SpinOptions = {}): Promise<ServiceResult<{ reward: Reward; snapshot: SessionSnapshot }>> {
    if (state.dev.simulateNetworkError) return delay(networkError());
    const guard = guardSeason();
    if (!guard.ok) return delay(guard);

    if (options.paid) {
      const price = state.spin.paidSpinPrice;
      if (price === null) return delay(fail("NO_ATTEMPTS", "Paid spins are disabled for this season."));
      if (state.stars.amount < price)
        return delay(fail("INSUFFICIENT_STARS", "Not enough Stars for a paid spin."));
      state.stars.amount -= price;
    } else {
      if (state.spin.freeSpins <= 0) return delay(fail("NO_ATTEMPTS", "No free attempts left."));
      state.spin.freeSpins -= 1;
    }

    const reward = rollReward();
    if (!reward) {
      // Restore the attempt/payment if there is no eligible reward at all.
      if (options.paid) {
        state.stars.amount += state.spin.paidSpinPrice ?? 0;
      } else {
        state.spin.freeSpins += 1;
      }
      return delay(fail("NO_ATTEMPTS", "No eligible rewards remain in this season."));
    }

    state.spin.totalSpins += 1;
    creditReward(reward);
    return delay(ok({ reward, snapshot: clone() }), 900);
  },

  async claimGift(): Promise<ServiceResult<{ reward: Reward; snapshot: SessionSnapshot }>> {
    if (state.dev.simulateNetworkError) return delay(networkError());
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
      payoutNote: "Daily gift credited to your Stars balance.",
    };
    creditReward(reward);
    state.gift = {
      state: "COOLDOWN",
      availableAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    } satisfies Gift;
    return delay(ok({ reward, snapshot: clone() }), 800);
  },

  async requestWithdrawal(amount: number): Promise<ServiceResult<{ withdrawal: Withdrawal; snapshot: SessionSnapshot }>> {
    if (state.dev.simulateNetworkError) return delay(networkError());
    if (amount < state.withdrawalMinimum)
      return delay(fail("BELOW_MINIMUM", `Minimum withdrawal is ${state.withdrawalMinimum} Stars.`));
    if (amount > state.stars.amount) return delay(fail("INSUFFICIENT_STARS", "Not enough Stars."));

    state.stars.amount -= amount;
    const withdrawal: Withdrawal = {
      id: `w_${Math.random().toString(36).slice(2, 9)}`,
      rewardTitle: "Telegram Stars",
      amount,
      requestedAt: new Date().toISOString(),
      status: "PENDING",
    };
    state.withdrawals = [withdrawal, ...state.withdrawals];
    return delay(ok({ withdrawal, snapshot: clone() }), 1100);
  },

  /** Dev-only helper used by the season-state switcher in Settings. */
  async setSeasonState(next: SessionSnapshot["season"]["state"]): Promise<ServiceResult<SessionSnapshot>> {
    const current = state.season.state;
    if (current === next) return delay(ok(clone()), 200);
    if (!SEASON_TRANSITIONS[current].includes(next)) {
      return delay(fail("SEASON_CLOSED", `Invalid season transition: ${current} → ${next}.`));
    }
    state.season.state = next;
    return delay(ok(clone()), 200);
  },

  async setSubscribed(value: boolean): Promise<ServiceResult<SessionSnapshot>> {
    state.user.isSubscribed = value;
    return delay(ok(clone()), 200);
  },

  /** Dev-only: jump the Stars balance to an exact value for QA. */
  async setStarsAmount(amount: number): Promise<ServiceResult<SessionSnapshot>> {
    state.stars.amount = Math.max(0, Math.min(state.stars.max, Math.round(amount)));
    return delay(ok(clone()), 200);
  },

  /** Dev-only: make every subsequent call fail like a dropped connection. */
  async setSimulateNetworkError(value: boolean): Promise<ServiceResult<SessionSnapshot>> {
    state.dev.simulateNetworkError = value;
    return delay(ok(clone()), 150);
  },

  async reset(): Promise<ServiceResult<SessionSnapshot>> {
    state = createInitialSnapshot();
    return delay(ok(clone()), 200);
  },
};
