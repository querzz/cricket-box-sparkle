import { expect, test } from "vitest";
import { buildEconomyMetrics, getEconomyMultiplier, seasonElapsedFraction } from "@/server/season-economy";

const date = (value: string) => new Date(value);

test("season elapsed fraction is bounded", () => {
  expect(seasonElapsedFraction(date("2026-01-01"), date("2026-02-01"), date("2025-12-01"))).toBe(0);
  expect(seasonElapsedFraction(date("2026-01-01"), date("2026-02-01"), date("2026-01-16"))).toBeCloseTo(15 / 31, 6);
  expect(seasonElapsedFraction(date("2026-01-01"), date("2026-02-01"), date("2026-03-01"))).toBe(1);
});

test("fast early depletion is cooled", () => {
  const multiplier = getEconomyMultiplier({ quantityTotal: 100, quantityRemaining: 0, elapsedFraction: 0.1 });
  expect(multiplier).toBeLessThan(1);
  expect(multiplier).toBeGreaterThanOrEqual(0.25);
});

test("late unconsumed inventory is boosted", () => {
  const multiplier = getEconomyMultiplier({ quantityTotal: 1, quantityRemaining: 1, elapsedFraction: 0.9 });
  expect(multiplier).toBeGreaterThan(1);
  expect(multiplier).toBeLessThanOrEqual(4);
});

test("pace forecast uses recent and season history", () => {
  const metrics = buildEconomyMetrics({
    startsAt: date("2026-09-01"),
    endsAt: date("2026-10-01"),
    spins: { hour: 2, day: 12, week: 70, season: 80 },
    now: date("2026-09-11"),
  });
  expect(metrics.completedSpins).toBe(80);
  expect(metrics.pacePerDay).toBeGreaterThan(0);
  expect(metrics.projectedSeasonSpins).toBeGreaterThanOrEqual(80);
});
