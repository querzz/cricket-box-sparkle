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

/**
 * Transparent Season #001 selection model:
 * each remaining inventory unit contributes its configured weight.
 * No hidden pacing, pity, anti-streak or time-based probability changes.
 */
export function buildDynamicWeights<T extends DynamicPrize>(
  prizes: T[],
  _context: DynamicSelectionContext = {},
): Array<{ prize: T; diagnostics: DynamicSelectionDiagnostics }> {
  return prizes.map((prize) => {
    const baseWeight = configuredWeight(prize);
    const inventoryPressure = Math.max(0, Number(prize.quantity_remaining) || 0);
    const finalWeight = baseWeight * inventoryPressure;
    return {
      prize,
      diagnostics: {
        baseWeight,
        inventoryPressure,
        globalMultiplier: 1,
        pityMultiplier: 1,
        antiStreakMultiplier: 1,
        finalWeight,
      },
    };
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
