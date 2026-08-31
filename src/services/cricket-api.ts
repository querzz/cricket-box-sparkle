/**
 * Mock CRICKET BOX API.
 *
 * This module is the ONLY place where authoritative state lives in the mock.
 * It stands in for the future backend: spin results, balances, gift
 * availability and withdrawals are all decided here, never inside React.
 */
import { createInitialSnapshot } from "@/lib/mock-data";
import type { Gift, Reward, RewardKind, ServiceError, ServiceResult, SessionSnapshot, Withdrawal } from "@/lib/types";

const LATENCY = 550;
const STORAGE_KEY = "cricket-box:mock-session:v1";
const DAILY_FREE_SPIN_KEY = "cricket-box:daily-free-spin:v1";
const DAY_MS = 24 * 60 * 60 * 1000;

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
      rewards: Array.isArray(saved.rewards)
        ? saved.rewards.filter((reward) => reward.kind !== "EMPTY")
        : initial.rewards,
      withdrawals: Array.isArray(saved.withdrawals) ? saved.withdrawals : initial.withdrawals,
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

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function isDailySpinEligible() {
  const seasonLive = state.season.state === "ACTIVE" || state.season.state === "ENDING";
  return seasonLive && state.user.isSubscribed && state.user.isParticipant;
}

function syncDailyFreeSpin() {
  if (typeof localStorage === "undefined") return;
  const key = todayKey();
  const grantedFor = localStorage.getItem(DAILY_FREE_SPIN_KEY);
  if (!isDailySpinEligible() || grantedFor === key) return;
  state.spin.freeSpins = 1;
  localStorage.setItem(DAILY_FREE_SPIN_KEY, key);
  persist();
}

function networkError() {
  return fail("NETWORK", "Не удалось связаться с сервером. Проверь соединение и попробуй ещё раз.");
}

const delay = <T>(value: T, ms = LATENCY) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const fail = (code: ServiceError["code"], message: string): ServiceResult<never> => ({ ok: false, error: { code, message } });
const clone = (): SessionSnapshot => { persist(); return structuredClone(state); };

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
  const { state: seasonState } = state.season;
  if (seasonState === "DRAFT" || seasonState === "SCHEDULED") return fail("SEASON_NOT_STARTED", "Сезон ещё не начался.");
  if (seasonState !== "ACTIVE" && seasonState !== "ENDING") return fail("SEASON_CLOSED", "Сезон завершён.");
  if (!state.user.isSubscribed) return fail("NOT_SUBSCRIBED", "Подпишись на канал, чтобы участвовать.");
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

function rollReward(): Reward | null {
  const eligible = getEligiblePrizes();
  if (eligible.length === 0) return null;
  const totalWeight = eligible.reduce((sum, prize) => sum + prize.remaining * (prize.weight ?? 1), 0);
  let roll = Math.random() * totalWeight;
  let picked = eligible[eligible.length - 1]!;
  for (const prize of eligible) {
    roll -= prize.remaining * (prize.weight ?? 1);
    if (roll <= 0) { picked = prize; break; }
  }
  const inventory = state.prizes.find((prize) => prize.id === picked.id);
  if (!inventory || inventory.remaining <= 0) return null;
  inventory.remaining -= 1;
  const amount = picked.kind === "STARS" ? Number(picked.title.replace(/[^0-9]/g, "")) || undefined : undefined;
  return {
    id: `r_${Math.random().toString(36).slice(2, 9)}`,
    kind: picked.kind as RewardKind,
    title: picked.title,
    subtitle: picked.subtitle,
    amount,
    wonAt: new Date().toISOString(),
    status: picked.kind === "STARS" ? "RECEIVED" : "PENDING",
    payoutNote: picked.kind === "STARS" ? "Stars зачислены на баланс Cricket Box." : "Администратор выдаст приз после проверки.",
  };
}

function recordReward(reward: Reward) {
  if (reward.kind === "EMPTY") return;
  if (reward.kind === "STARS" && reward.amount) {
    const room = Math.max(0, state.stars.max - state.stars.amount);
    const credited = Math.min(room, reward.amount);
    state.stars.amount += credited;
    reward.creditedAmount = credited;
    reward.uncreditedAmount = reward.amount - credited;
    if (credited < reward.amount) reward.payoutNote = `Лимит баланса достигнут — зачислено ${credited} из ${reward.amount} Stars.`;
  }
  state.rewards = [reward, ...state.rewards.filter((existing) => existing.kind !== "EMPTY")];
}

export interface SpinOptions { paid?: boolean; }

export const cricketApi = {
  async getSession(): Promise<ServiceResult<SessionSnapshot>> {
    ensureHydrated();
    syncDailyFreeSpin();
    if (state.dev.simulateNetworkError) return delay(networkError(), 350);
    return delay(ok(clone()), 350);
  },

  async spin(options: SpinOptions = {}): Promise<ServiceResult<{ reward: Reward; snapshot: SessionSnapshot }>> {
    ensureHydrated();
    syncDailyFreeSpin();
    if (state.dev.simulateNetworkError) return delay(networkError());
    const guard = guardSeason();
    if (!guard.ok) return delay(guard);

    if (options.paid) {
      const price = state.spin.paidSpinPrice;
      if (price === null) return delay(fail("NO_ATTEMPTS", "Платные прокрутки отключены для этого сезона."));
      if (state.stars.amount < price) return delay(fail("INSUFFICIENT_STARS", "Недостаточно Stars для платной прокрутки."));
      state.stars.amount -= price;
    } else {
      if (state.spin.freeSpins <= 0) return delay(fail("NO_ATTEMPTS", "Сегодняшняя бесплатная попытка уже использована."));
      state.spin.freeSpins -= 1;
    }

    const reward = rollReward();
    if (!reward) {
      if (options.paid) state.stars.amount += state.spin.paidSpinPrice ?? 0;
      else state.spin.freeSpins += 1;
      return delay(fail("NO_ATTEMPTS", "Подходящих призов для этой попытки больше нет."));
    }

    state.spin.totalSpins += 1;
    recordReward(reward);
    return delay(ok({ reward, snapshot: clone() }), 900);
  },

  async claimGift(): Promise<ServiceResult<{ reward: Reward; snapshot: SessionSnapshot }>> {
    ensureHydrated();
    syncDailyFreeSpin();
    if (state.dev.simulateNetworkError) return delay(networkError());
    const guard = guardSeason();
    if (!guard.ok) return delay(guard);
    if (!state.user.isParticipant) return delay(fail("GIFT_UNAVAILABLE", "Только участники текущего сезона могут забрать ежедневный подарок."));
    if (state.gift.state !== "AVAILABLE") return delay(fail("GIFT_UNAVAILABLE", "Подарок сейчас на перезарядке."));
    const reward: Reward = {
      id: `g_${Math.random().toString(36).slice(2, 9)}`,
      kind: "STARS",
      title: "15 Stars",
      amount: 15,
      wonAt: new Date().toISOString(),
      status: "RECEIVED",
      payoutNote: "Ежедневный подарок зачислен на баланс Stars.",
    };
    recordReward(reward);
    state.gift = { state: "COOLDOWN", availableAt: new Date(Date.now() + DAY_MS).toISOString() } satisfies Gift;
    return delay(ok({ reward, snapshot: clone() }), 800);
  },

  async requestWithdrawal(amount: number): Promise<ServiceResult<{ withdrawal: Withdrawal; snapshot: SessionSnapshot }>> {
    if (state.dev.simulateNetworkError) return delay(networkError());
    if (amount < state.withdrawalMinimum) return delay(fail("BELOW_MINIMUM", `Минимальная сумма вывода — ${state.withdrawalMinimum} Stars.`));
    if (amount > state.stars.amount) return delay(fail("INSUFFICIENT_STARS", "Недостаточно Stars."));
    state.stars.amount -= amount;
    const withdrawal: Withdrawal = { id: `w_${Math.random().toString(36).slice(2, 9)}`, rewardTitle: "Telegram Stars", amount, requestedAt: new Date().toISOString(), status: "PENDING" };
    state.withdrawals = [withdrawal, ...state.withdrawals];
    return delay(ok({ withdrawal, snapshot: clone() }), 1100);
  },

  async setSeasonState(next: SessionSnapshot["season"]["state"]): Promise<ServiceResult<SessionSnapshot>> {
    const current = state.season.state;
    if (current === next) return delay(ok(clone()), 200);
    if (!SEASON_TRANSITIONS[current].includes(next)) return delay(fail("SEASON_CLOSED", `Недопустимый переход сезона: ${current} → ${next}.`));
    state.season.state = next;
    if (!isDailySpinEligible()) state.spin.freeSpins = 0;
    syncDailyFreeSpin();
    return delay(ok(clone()), 200);
  },

  async setSubscribed(value: boolean): Promise<ServiceResult<SessionSnapshot>> {
    state.user.isSubscribed = value;
    if (value) syncDailyFreeSpin();
    if (!value) state.spin.freeSpins = 0;
    return delay(ok(clone()), 200);
  },

  async setStarsAmount(amount: number): Promise<ServiceResult<SessionSnapshot>> {
    state.stars.amount = Math.max(0, Math.min(state.stars.max, Math.round(amount)));
    return delay(ok(clone()), 200);
  },

  async setSimulateNetworkError(value: boolean): Promise<ServiceResult<SessionSnapshot>> {
    state.dev.simulateNetworkError = value;
    return delay(ok(clone()), 150);
  },

  async resetDailyFreeSpin(): Promise<ServiceResult<SessionSnapshot>> {
    ensureHydrated();
    if (typeof localStorage !== "undefined") localStorage.removeItem(DAILY_FREE_SPIN_KEY);
    if (isDailySpinEligible()) {
      state.spin.freeSpins = 1;
      if (typeof localStorage !== "undefined") localStorage.setItem(DAILY_FREE_SPIN_KEY, todayKey());
    }
    return delay(ok(clone()), 150);
  },

  async reset(): Promise<ServiceResult<SessionSnapshot>> {
    state = createInitialSnapshot();
    if (typeof localStorage !== "undefined") localStorage.removeItem(DAILY_FREE_SPIN_KEY);
    return delay(ok(clone()), 200);
  },
};
