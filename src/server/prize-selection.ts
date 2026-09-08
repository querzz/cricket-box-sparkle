export type AdaptivePrize = {
  id: string;
  kind: string;
  quantity_remaining: number;
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

/**
 * Selects from remaining inventory instead of treating each prize row equally.
 * This makes one rare unit genuinely rare compared with a large common stock,
 * while still allowing admin-defined weights to tune the economy.
 *
 * Personal pity and anti-streak are intentionally soft multipliers: they can
 * improve a player's bad run, but never guarantee a reward or bypass inventory.
 */
export function pickAdaptivePrize<T extends AdaptivePrize>(
  prizes: T[],
  randomUnit: () => number,
  context: AdaptiveSelectionContext = {},
): T {
  if (!prizes.length) throw new Error("NO_PRIZES");

  const emptyStreak = Math.max(0, Math.floor(context.emptyStreak ?? 0));
  const recentKinds = context.recentKinds ?? [];
  const lastKind = recentKinds[0];
  const previousSameKindCount = recentKinds.reduce(
    (count, kind) => count + (kind === lastKind ? 1 : 0),
    0,
  );

  const weighted = prizes.map((prize) => {
    const inventory = Math.max(0, Number(prize.quantity_remaining) || 0);
    const base = configuredWeight(prize) * inventory;

    let multiplier = 1;
    if (prize.kind !== "EMPTY" && emptyStreak > 0) {
      multiplier *= 1 + clamp(emptyStreak, 0, 20) * 0.03;
    }
    if (lastKind && prize.kind === lastKind && previousSameKindCount >= 3) {
      multiplier *= 0.55;
    }
    if (lastKind && prize.kind !== lastKind && previousSameKindCount >= 3) {
      multiplier *= 1.05;
    }

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
