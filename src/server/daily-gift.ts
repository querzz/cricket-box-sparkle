import { type PoolClient } from "pg";
import { getVeteranHistory, type VeteranTier } from "@/server/veteran";

type DbExecutor = Pick<PoolClient, "query">;

export type DailyGiftConfig = {
  rewardChanceByTier: Record<VeteranTier, number>;
};

export type DailyGiftReward = {
  kind: "NOTHING" | "STARS" | "FREE_SPIN" | "XP";
  amount: number;
  title: string;
  subtitle: string;
  weight: number;
};

export const DEFAULT_DAILY_GIFT_CONFIG: DailyGiftConfig = {
  rewardChanceByTier: { ROOKIE: 60, VETERAN: 70, ELITE: 80 },
};

export const DAILY_GIFT_REWARDS: DailyGiftReward[] = [
  { kind: "STARS", amount: 10, title: "10 Stars", subtitle: "Stars зачислены на баланс.", weight: 20 },
  { kind: "STARS", amount: 15, title: "15 Stars", subtitle: "Stars зачислены на баланс.", weight: 15 },
  { kind: "STARS", amount: 25, title: "25 Stars", subtitle: "Неплохо! Stars зачислены на баланс.", weight: 10 },
  { kind: "STARS", amount: 50, title: "50 Stars", subtitle: "Редкая находка!", weight: 3 },
  { kind: "STARS", amount: 100, title: "100 Stars", subtitle: "Очень редкий приз! 🔥", weight: 1 },
  { kind: "FREE_SPIN", amount: 1, title: "Бесплатная прокрутка", subtitle: "Дополнительная прокрутка сохранена.", weight: 6 },
  { kind: "XP", amount: 25, title: "+25 XP", subtitle: "Опыт добавлен. Продолжай прокачиваться.", weight: 4 },
  { kind: "XP", amount: 50, title: "+50 XP", subtitle: "Большой буст опыта!", weight: 1 },
];

const TIERS: VeteranTier[] = ["ROOKIE", "VETERAN", "ELITE"];

export function parseDailyGiftConfig(value: unknown): DailyGiftConfig {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawChances = raw.rewardChanceByTier && typeof raw.rewardChanceByTier === "object"
    ? raw.rewardChanceByTier as Record<string, unknown>
    : {};
  const rewardChanceByTier = {} as Record<VeteranTier, number>;

  for (const tier of TIERS) {
    const parsed = Number(rawChances[tier] ?? DEFAULT_DAILY_GIFT_CONFIG.rewardChanceByTier[tier]);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error("INVALID_DAILY_GIFT_CHANCE");
    rewardChanceByTier[tier] = Math.round(parsed * 100) / 100;
  }

  return { rewardChanceByTier };
}

export async function getDailyGiftConfig(db: DbExecutor): Promise<DailyGiftConfig> {
  const result = await db.query<{ value: unknown }>("SELECT value FROM app_settings WHERE key='daily_gift' LIMIT 1");
  return parseDailyGiftConfig(result.rows[0]?.value ?? DEFAULT_DAILY_GIFT_CONFIG);
}

export async function getDailyGiftTier(db: DbExecutor, userId: string, override?: VeteranTier | null) {
  if (override && TIERS.includes(override)) return { tier: override, source: "OVERRIDE" as const };
  const history = await getVeteranHistory(db, userId);
  return { tier: history.tier, source: "HISTORY" as const };
}

function weightedPick<T extends { weight: number }>(items: T[], randomUnit: () => number): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (!(total > 0)) throw new Error("DAILY_GIFT_NO_REWARDS");
  let cursor = Math.min(0.9999999999999999, Math.max(0, randomUnit())) * total;
  for (const item of items) {
    cursor -= Math.max(0, item.weight);
    if (cursor < 0) return item;
  }
  return items[items.length - 1]!;
}

export function pickDailyGift(tier: VeteranTier, config: DailyGiftConfig, randomUnit: () => number, starsBalance: number): DailyGiftReward {
  if (randomUnit() >= config.rewardChanceByTier[tier] / 100) {
    return { kind: "NOTHING", amount: 0, title: "Ничего", subtitle: "Сегодня без награды. Попробуй завтра.", weight: 1 };
  }
  const pool = starsBalance >= 500 ? DAILY_GIFT_REWARDS.filter((reward) => reward.kind !== "STARS") : DAILY_GIFT_REWARDS;
  return pool.length
    ? weightedPick(pool, randomUnit)
    : { kind: "NOTHING", amount: 0, title: "Ничего", subtitle: "Сегодня без награды. Попробуй завтра.", weight: 1 };
}
