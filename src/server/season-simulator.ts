import { pickAdaptivePrize, type AdaptivePrize } from "@/server/prize-selection";
import { getEconomyMultiplier } from "@/server/season-economy";

type SimPrize = AdaptivePrize & { quantity_total: number; amount: number; weight: number; title: string };

export type SimulationInput = {
  prizes: SimPrize[];
  spins: number;
  trials?: number;
  elapsedFraction?: number;
  seed?: number;
};

export type SimulationResult = {
  spins: number;
  trials: number;
  averageCompleted: number;
  averageEmpty: number;
  averageInventoryConsumed: number;
  prizeResults: Array<{
    id: string;
    kind: string;
    title: string;
    initialQuantity: number;
    averageWon: number;
    averageRemaining: number;
    winRate: number;
    exhaustRate: number;
  }>;
};

function createRng(seed: number) {
  let state = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function simulateSeason(input: SimulationInput): SimulationResult {
  const spins = Math.max(1, Math.min(100_000, Math.floor(input.spins)));
  const trials = Math.max(1, Math.min(200, Math.floor(input.trials ?? 50)));
  const elapsedFraction = Math.min(1, Math.max(0, input.elapsedFraction ?? 0));
  const baseSeed = Number.isFinite(input.seed) ? Math.trunc(input.seed!) : 123456789;
  const source = input.prizes.filter(p => p.quantity_remaining > 0 && p.quantity_total > 0);
  const wins = new Map<string, number>();
  const remaining = new Map<string, number>();
  const exhaustedTrials = new Map<string, number>();
  let completed = 0;
  let empty = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const trialPrizes = source.map(p => ({ ...p, quantity_remaining: p.quantity_remaining }));
    const rng = createRng(baseSeed + trial * 0x45d9f3b);
    let recentKinds: string[] = [];
    let trialCompleted = 0;
    let trialEmpty = 0;

    for (let spin = 0; spin < spins; spin += 1) {
      const available = trialPrizes.filter(p => p.quantity_remaining > 0);
      if (!available.length) {
        trialEmpty += 1;
        continue;
      }
      const economyPrizes = available.map(p => ({
        ...p,
        metadata: { ...(p.metadata ?? {}), economyMultiplier: getEconomyMultiplier({ quantityTotal: p.quantity_total, quantityRemaining: p.quantity_remaining, elapsedFraction }) },
      }));
      const selected = pickAdaptivePrize(economyPrizes, rng, { emptyStreak: trialEmpty, recentKinds });
      const actual = trialPrizes.find(p => p.id === selected.id);
      if (!actual) continue;
      actual.quantity_remaining = Math.max(0, actual.quantity_remaining - 1);
      wins.set(actual.id, (wins.get(actual.id) ?? 0) + 1);
      trialCompleted += 1;
      recentKinds = [actual.kind, ...recentKinds].slice(0, 8);
      trialEmpty = 0;
    }

    completed += trialCompleted;
    empty += trialEmpty;
    for (const p of trialPrizes) {
      const prior = remaining.get(p.id) ?? 0;
      remaining.set(p.id, prior + p.quantity_remaining);
      if (p.quantity_remaining === 0) exhaustedTrials.set(p.id, (exhaustedTrials.get(p.id) ?? 0) + 1);
    }
  }

  return {
    spins,
    trials,
    averageCompleted: completed / trials,
    averageEmpty: empty / trials,
    averageInventoryConsumed: completed / trials,
    prizeResults: source.map(p => ({
      id: p.id,
      kind: p.kind,
      title: p.title,
      initialQuantity: p.quantity_remaining,
      averageWon: (wins.get(p.id) ?? 0) / trials,
      averageRemaining: (remaining.get(p.id) ?? 0) / trials,
      winRate: (wins.get(p.id) ?? 0) / Math.max(1, completed),
      exhaustRate: (exhaustedTrials.get(p.id) ?? 0) / trials,
    })),
  };
}
