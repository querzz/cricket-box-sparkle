import { pickDynamicPrize } from "../src/server/dynamic-prize-selection.ts";

const draws = 100_000;
const seed = 0x12345678;
let state = seed >>> 0;
const rng = () => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 4294967296;
};

const assert = (condition, message) => {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
};

const prizes = [
  { id: "empty", kind: "EMPTY", quantity_remaining: 1800, quantity_total: 1800, metadata: { weight: 1 } },
  { id: "stars20", kind: "STARS", quantity_remaining: 11, quantity_total: 11, metadata: { weight: 1 } },
  { id: "stars50", kind: "STARS", quantity_remaining: 5, quantity_total: 5, metadata: { weight: 1 } },
  { id: "stars100", kind: "STARS", quantity_remaining: 2, quantity_total: 2, metadata: { weight: 1 } },
  { id: "premium", kind: "PREMIUM", quantity_remaining: 1, quantity_total: 1, metadata: { weight: 1 } },
  { id: "money", kind: "MONEY", quantity_remaining: 1, quantity_total: 1, metadata: { weight: 1 } },
];

const expected = new Map([
  ["empty", 1800 / 1820],
  ["stars20", 11 / 1820],
  ["stars50", 5 / 1820],
  ["stars100", 2 / 1820],
  ["premium", 1 / 1820],
  ["money", 1 / 1820],
]);

const counts = new Map(prizes.map((prize) => [prize.id, 0]));
for (let i = 0; i < draws; i += 1) {
  const selected = pickDynamicPrize(prizes, rng).prize;
  counts.set(selected.id, counts.get(selected.id) + 1);
}

for (const prize of prizes) {
  const actual = counts.get(prize.id) / draws;
  const target = expected.get(prize.id);
  const tolerance = prize.id === "empty" ? 0.01 : Math.max(0.0015, target * 0.35);
  assert(Math.abs(actual - target) <= tolerance, `${prize.id}: expected ${(target * 100).toFixed(4)}%, got ${(actual * 100).toFixed(4)}%`);
}

const zeroWeight = [
  { id: "never", kind: "MONEY", quantity_remaining: 100, quantity_total: 100, metadata: { weight: 0 } },
  { id: "only", kind: "EMPTY", quantity_remaining: 1, quantity_total: 1, metadata: { weight: 1 } },
];
for (let i = 0; i < 1000; i += 1) {
  assert(pickDynamicPrize(zeroWeight, rng).prize.id === "only", "weight=0 prize must never be selected");
}

const exhausted = [
  { id: "exhausted", kind: "PREMIUM", quantity_remaining: 0, quantity_total: 1, metadata: { weight: 100 } },
  { id: "available", kind: "EMPTY", quantity_remaining: 1, quantity_total: 1, metadata: { weight: 1 } },
];
assert(pickDynamicPrize(exhausted, rng).prize.id === "available", "exhausted prize must never be selected");

console.log("✅ Prize probability regression passed");
console.table([...counts.entries()].map(([id, count]) => ({ id, draws: count, observedPct: `${((count / draws) * 100).toFixed(4)}%`, expectedPct: `${(expected.get(id) * 100).toFixed(4)}%` })));
