import { pickDynamicPrize, type DynamicPrize } from "@/server/dynamic-prize-selection";

type SimPrize = DynamicPrize & { quantity_total: number; amount: number; weight: number; title: string };

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
  const source = input.prizes.filter((p) => p.quantity_remaining > 0 && p.quantity_total > 0);
  const wins = new Map<string, number>();
  const remaining = new Map<string, number>();
  const exhaustedTrials = new Map<string, number>();
  let completed = 0;
  let empty = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const trialPrizes = source.map((p) => ({ ...p, quantity_remaining: p.quantity_remaining }));
    const rng = createRng((Number.isFinite(input.seed) ? Math.trunc(input.seed!) : 123456789) + trial * 0x45d9f3b);
    let recentKinds: string[] = [];
    let trialCompleted = 0;
    let trialEmpty = 0;

    for (let spin = 0; spin < spins; spin += 1) {
      const available = trialPrizes.filter((p) => p.quantity_remaining > 0);
      if (!available.length) break;

      const selected = pickDynamicPrize(available, rng, {
        elapsedFraction: input.elapsedFraction ?? 0,
        recentKinds,
      });
      const actual = trialPrizes.find((p) => p.id === selected.prize.id);
      if (!actual) continue;

      actual.quantity_remaining = Math.max(0, actual.quantity_remaining - 1);
      wins.set(actual.id, (wins.get(actual.id) ?? 0) + 1);
      trialCompleted += 1;
      if (actual.kind === "EMPTY") trialEmpty += 1;
      recentKinds = [actual.kind, ...recentKinds].slice(0, 8);
    }

    completed += trialCompleted;
    empty += trialEmpty;
    for (const p of trialPrizes) {
      remaining.set(p.id, (remaining.get(p.id) ?? 0) + p.quantity_remaining);
      if (p.quantity_remaining === 0) exhaustedTrials.set(p.id, (exhaustedTrials.get(p.id) ?? 0) + 1);
    }
  }

  return {
    spins,
    trials,
    averageCompleted: completed / trials,
    averageEmpty: empty / trials,
    averageInventoryConsumed: completed / trials,
    prizeResults: source.map((p) => ({
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
