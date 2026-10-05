import { getEconomyMultiplier } from "./season-economy.ts";

export type DynamicPrize = {
  id: string;
  kind: string;
  quantity_remaining: number;
  quantity_total: number;
  metadata: Record<string, unknown> | null;
};

export type DynamicSelectionContext = {
  elapsedFraction?: number;
  emptyStreak?: number;
  recentKinds?: string[];
  paidSpin?: boolean;
};

export type DynamicSelectionDiagnostics = {
  baseWeight: number;
  inventoryPressure: number;
  globalMultiplier: number;
  pityMultiplier: number;
  antiStreakMultiplier: number;
  paidSpinMultiplier: number;
  finalWeight: number;
};

export type DynamicSelectionResult<T extends DynamicPrize> = {
  prize: T;
  diagnostics: Record<string, DynamicSelectionDiagnostics>;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function configuredWeight(prize: DynamicPrize) {
  const raw = prize.metadata?.weight;
  if (raw === undefined || raw === null || raw === "") return 1;

  const configured = Number(raw);
  if (!Number.isFinite(configured) || configured < 0) {
    throw new Error("INVALID_PRIZE_WEIGHT");
  }
  return configured;
}

function getPityMultiplier(emptyStreak: number, kind: string) {
  if (kind === "EMPTY") return 1;
  const streak = Math.max(0, Math.floor(Number(emptyStreak) || 0));
  if (streak < 3) return 1;
  return 1 + Math.min(1.5, (streak - 2) * 0.15);
}

function getAntiStreakMultiplier(emptyStreak: number, kind: string) {
  if (kind !== "EMPTY") return 1;
  const streak = Math.max(0, Math.floor(Number(emptyStreak) || 0));
  if (streak < 3) return 1;
  const pityMultiplier = 1 + Math.min(1.5, (streak - 2) * 0.15);
  return 1 / pityMultiplier;
}

/**
 * Canonical season selector.
 *
 * 1. Base configured weight controls the prize's relative importance.
 * 2. Remaining inventory controls how much of that prize is currently available.
 * 3. The economy multiplier keeps inventory pacing near the season timeline:
 *    prizes disappearing faster than the season pace are down-weighted, while
 *    prizes that are lagging behind the pace are up-weighted.
 * 4. A player who has gone through a long EMPTY streak gets a pity boost on
 *    non-empty prizes. EMPTY receives the inverse anti-streak adjustment.
 *
 * Paid spins receive a modest reward-quality multiplier on non-EMPTY outcomes. The
 * multiplier is applied only when paidSpin=true; free spins keep the baseline pool.
 * No online-user-count modifier is used.
 */
export function buildDynamicWeights<T extends DynamicPrize>(
  prizes: T[],
  context: DynamicSelectionContext = {},
): Array<{ prize: T; diagnostics: DynamicSelectionDiagnostics }> {
  const elapsedFraction = clamp(Number(context.elapsedFraction) || 0, 0, 1);
  const emptyStreak = Math.max(0, Math.floor(Number(context.emptyStreak) || 0));
  const paidSpin = context.paidSpin === true;

  return prizes.map((prize) => {
    const baseWeight = configuredWeight(prize);
    const inventoryPressure = Math.max(0, Number(prize.quantity_remaining) || 0);
    const globalMultiplier = getEconomyMultiplier({
      quantityTotal: Number(prize.quantity_total) || 0,
      quantityRemaining: inventoryPressure,
      elapsedFraction,
    });
    const pityMultiplier = getPityMultiplier(emptyStreak, prize.kind);
    const antiStreakMultiplier = getAntiStreakMultiplier(emptyStreak, prize.kind);
    const paidSpinMultiplier = paidSpin && prize.kind !== "EMPTY" ? 1.25 : 1;
    const finalWeight = baseWeight * inventoryPressure * globalMultiplier * pityMultiplier * antiStreakMultiplier * paidSpinMultiplier;

    return {
      prize,
      diagnostics: {
        baseWeight,
        inventoryPressure,
        globalMultiplier,
        pityMultiplier,
        antiStreakMultiplier,
        paidSpinMultiplier,
        finalWeight,
      },
    };
  });
}

function selectByWeights<T>(weighted: Array<{ prize: T; weight: number }>, randomUnit: () => number): T {
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!(total > 0)) throw new Error("NO_PRIZES");

  let cursor = clamp(randomUnit(), 0, 0.9999999999999999) * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor < 0) return item.prize;
  }
  return weighted[weighted.length - 1]!.prize;
}

export function pickDynamicPrize<T extends DynamicPrize>(
  prizes: T[],
  randomUnit: () => number,
  context: DynamicSelectionContext = {},
): DynamicSelectionResult<T> {
  if (!prizes.length) throw new Error("NO_PRIZES");

  const weighted = buildDynamicWeights(prizes, context);
  const selected = selectByWeights(
    weighted.map((item) => ({ prize: item.prize, weight: item.diagnostics.finalWeight })),
    randomUnit,
  );

  return {
    prize: selected,
    diagnostics: Object.fromEntries(weighted.map((item) => [item.prize.id, item.diagnostics])),
  };
}
