const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type SeasonEconomyMetrics = {
  elapsedFraction: number;
  completedSpins: number;
  pacePerDay: number;
  projectedSeasonSpins: number;
  remainingDays: number;
};

export function seasonElapsedFraction(startsAt: string | Date | null, endsAt: string | Date | null, now = new Date()): number {
  if (!startsAt || !endsAt) return 0;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const current = now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return clamp((current - start) / (end - start), 0, 1);
}

export function estimatePacePerDay(spins: { hour: number; day: number; week: number; season: number }, elapsedFraction: number, seasonDays: number): number {
  const elapsedDays = Math.max(0.25, seasonDays * clamp(elapsedFraction, 0, 1));
  return Math.max(0, spins.hour * 24 * 0.15 + spins.day * 0.35 + (spins.week / 7) * 0.35 + (spins.season / elapsedDays) * 0.15);
}

export function buildEconomyMetrics(input: { startsAt: string | Date | null; endsAt: string | Date | null; spins: { hour: number; day: number; week: number; season: number }; now?: Date }): SeasonEconomyMetrics {
  const now = input.now ?? new Date();
  const elapsedFraction = seasonElapsedFraction(input.startsAt, input.endsAt, now);
  const start = input.startsAt ? new Date(input.startsAt).getTime() : now.getTime();
  const end = input.endsAt ? new Date(input.endsAt).getTime() : now.getTime();
  const seasonDays = Math.max(0.25, (end - start) / 86_400_000);
  const pacePerDay = estimatePacePerDay(input.spins, elapsedFraction, seasonDays);
  const remainingDays = Math.max(0, (end - now.getTime()) / 86_400_000);
  return { elapsedFraction, completedSpins: Math.max(0, input.spins.season), pacePerDay, projectedSeasonSpins: Math.max(input.spins.season, input.spins.season + pacePerDay * remainingDays), remainingDays };
}

export function getEconomyMultiplier(input: { quantityTotal: number; quantityRemaining: number; elapsedFraction: number }): number {
  const total = Math.max(0, Math.floor(input.quantityTotal));
  const remaining = clamp(Math.floor(input.quantityRemaining), 0, total);
  const elapsed = clamp(input.elapsedFraction, 0, 1);
  if (total <= 0 || elapsed <= 0 || elapsed >= 1) return 1;
  const consumed = total - remaining;
  const smoothing = Math.max(1, total * 0.02);
  const expected = total * elapsed;
  const ratio = (consumed + smoothing) / (expected + smoothing);
  return clamp(Math.pow(1 / ratio, 0.65), 0.25, 4);
}
