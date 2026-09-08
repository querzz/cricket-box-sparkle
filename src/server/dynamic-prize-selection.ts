import { getEconomyMultiplier } from "@/server/season-economy";

export type DynamicPrize = {
  id: string;
  kind: string;
  quantity_remaining: number;
  quantity_total: number;
  metadata: Record<string, unknown> | null;
};

export type DynamicSelectionContext = {
  elapsedFraction: number;
  emptyStreak?: number;
  recentKinds?: string[];
};

export type DynamicSelectionDiagnostics = {
  baseWeight: number;
  inventoryPressure: number;
  globalMultiplier: number;
  pityMultiplier: number;
  antiStreakMultiplier: number;
  finalWeight: number;
};

export type DynamicSelectionResult<T extends DynamicPrize> = {
  prize: T;
  diagnostics: Record<string, DynamicSelectionDiagnostics>;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function configuredWeight(prize: DynamicPrize) {
  const configured = Number(prize.metadata?.weight ?? 1);
  return Number.isFinite(configured) && configured > 0 ? configured : 1;
}

function getPityMultiplier(kind: string, emptyStreak: number) {
  const streak = clamp(Math.floor(emptyStreak), 0, 30);
  if (streak === 0) return 1;
  if (kind === "EMPTY") return clamp(1 - streak * 0.015, 0.55, 1);
  return 1 + streak * 0.025;
}

function getAntiStreakMultiplier(kind: string, recentKinds: string[]) {
  const lastKind = recentKinds[0];
  if (!lastKind) return 1;
  let consecutive = 0;
  for (const recent of recentKinds) {
    if (recent !== lastKind) break;
    consecutive += 1;
  }
  if (consecutive < 3) return 1;
  if (kind === lastKind) return 0.6;
  return 1.05;
}

export function buildDynamicWeights<T extends DynamicPrize>(
  prizes: T[],
  context: DynamicSelectionContext,
): Array<{ prize: T; diagnostics: DynamicSelectionDiagnostics }> {
  const recentKinds = context.recentKinds ?? [];
  const emptyStreak = Math.max(0, Math.floor(context.emptyStreak ?? 0));
  return prizes.map((prize) => {
    const baseWeight = configuredWeight(prize);
    const inventoryPressure = Math.max(0, Number(prize.quantity_remaining) || 0);
    const globalMultiplier = getEconomyMultiplier({
      quantityTotal: prize.quantity_total,
      quantityRemaining: prize.quantity_remaining,
      elapsedFraction: context.elapsedFraction,
    });
    const pityMultiplier = getPityMultiplier(prize.kind, emptyStreak);
    const antiStreakMultiplier = getAntiStreakMultiplier(prize.kind, recentKinds);
    const finalWeight = baseWeight * inventoryPressure * globalMultiplier * pityMultiplier * antiStreakMultiplier;
    return { prize, diagnostics: { baseWeight, inventoryPressure, globalMultiplier, pityMultiplier, antiStreakMultiplier, finalWeight } };
  });
}

function selectByWeights<T>(weighted: Array<{ prize: T; weight: number }>, randomUnit: () => number): T {
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!(total > 0)) return weighted[weighted.length - 1]!.prize;
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
  context: DynamicSelectionContext,
): DynamicSelectionResult<T> {
  if (!prizes.length) throw new Error("NO_PRIZES");
  const weighted = buildDynamicWeights(prizes, context);
  const selected = selectByWeights(weighted.map((item) => ({ prize: item.prize, weight: item.diagnostics.finalWeight })), randomUnit);
  return { prize: selected, diagnostics: Object.fromEntries(weighted.map((item) => [item.prize.id, item.diagnostics])) };
}
