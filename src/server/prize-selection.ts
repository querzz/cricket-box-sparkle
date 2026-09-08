export type AdaptivePrize = {
  id: string;
  kind: string;
  quantity_remaining: number;
  quantity_total?: number;
  metadata: Record<string, unknown> | null;
};

export type AdaptiveSelectionContext = {
  emptyStreak?: number;
  recentKinds?: string[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function configuredWeight(prize: AdaptivePrize) {
  const configured = Number(prize.metadata?.weight ?? 1);
  return Number.isFinite(configured) && configured > 0 ? configured : 1;
}

function economyMultiplier(prize: AdaptivePrize) {
  const configured = Number(prize.metadata?.economyMultiplier ?? 1);
  return Number.isFinite(configured) && configured > 0 ? configured : 1;
}

/**
 * MVP production selector: weighted sampling without replacement.
 * Each remaining inventory unit contributes its configured weight.
 * It deliberately does not apply adaptive pacing, streak bonuses, or penalties.
 */
export function pickWeightedPrize<T extends AdaptivePrize>(prizes: T[], randomUnit: () => number): T {
  if (!prizes.length) throw new Error("NO_PRIZES");

  const weighted = prizes.map((prize) => ({
    prize,
    weight: configuredWeight(prize) * Math.max(0, Number(prize.quantity_remaining) || 0),
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!(total > 0)) return prizes[0]!;

  let cursor = clamp(randomUnit(), 0, 0.9999999999999999) * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor < 0) return item.prize;
  }
  return weighted[weighted.length - 1]!.prize;
}

export function pickAdaptivePrize<T extends AdaptivePrize>(
  prizes: T[],
  randomUnit: () => number,
  context: AdaptiveSelectionContext = {},
): T {
  if (!prizes.length) throw new Error("NO_PRIZES");

  const emptyStreak = Math.max(0, Math.floor(context.emptyStreak ?? 0));
  const recentKinds = context.recentKinds ?? [];
  const lastKind = recentKinds[0];
  let consecutiveSameKind = 0;
  if (lastKind) {
    for (const kind of recentKinds) {
      if (kind !== lastKind) break;
      consecutiveSameKind += 1;
    }
  }

  const weighted = prizes.map((prize) => {
    const inventory = Math.max(0, Number(prize.quantity_remaining) || 0);
    const base = configuredWeight(prize) * economyMultiplier(prize) * inventory;

    let multiplier = 1;
    if (prize.kind !== "EMPTY" && emptyStreak > 0) {
      multiplier *= 1 + clamp(emptyStreak, 0, 20) * 0.03;
    }
    if (lastKind && prize.kind === lastKind && consecutiveSameKind >= 3) multiplier *= 0.55;
    if (lastKind && prize.kind !== lastKind && consecutiveSameKind >= 3) multiplier *= 1.05;

    return { prize, weight: base * multiplier };
  });

  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!(total > 0)) return prizes[0]!;

  let cursor = clamp(randomUnit(), 0, 0.9999999999999999) * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor < 0) return item.prize;
  }
  return weighted[weighted.length - 1]!.prize;
}
