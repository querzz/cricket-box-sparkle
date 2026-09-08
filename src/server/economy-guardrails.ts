export type EconomyGuardrailPrize = {
  id: string;
  kind: string;
  title: string;
  amount: number;
  unitCost: number;
  quantityTotal: number;
  quantityRemaining: number;
  weight: number;
};

export type EconomyGuardrailInput = {
  projectedSeasonSpins: number;
  paidSpinPrice: number;
  prizes: EconomyGuardrailPrize[];
  simulation?: {
    averageCompleted: number;
    averageEmpty: number;
    prizeResults: Array<{
      id: string;
      winRate: number;
      exhaustRate: number;
      averageWon: number;
      averageRemaining: number;
    }>;
  };
};

export type EconomyGuardrailResult = {
  totalFiniteInventory: number;
  projectedInventoryDemand: number;
  inventoryCoverage: number;
  starsLiability: number;
  materialCost: number;
  theoreticalGrossAtProjectedPaidSpins: number;
  warnings: string[];
  status: "HEALTHY" | "WATCH" | "RISK";
};

export function evaluateEconomyGuardrails(input: EconomyGuardrailInput): EconomyGuardrailResult {
  const projectedSeasonSpins = Math.max(0, input.projectedSeasonSpins);
  const paidSpinPrice = Math.max(0, input.paidSpinPrice);
  const prizes = input.prizes.filter(p => p.quantityTotal > 0);
  const totalFiniteInventory = prizes.reduce((sum, p) => sum + p.quantityRemaining, 0);
  const projectedInventoryDemand = Math.min(projectedSeasonSpins, totalFiniteInventory);
  const inventoryCoverage = projectedSeasonSpins > 0 ? totalFiniteInventory / projectedSeasonSpins : Number.POSITIVE_INFINITY;
  const starsLiability = prizes.filter(p => p.kind === "STARS").reduce((sum, p) => sum + Math.max(0, p.amount) * p.quantityTotal, 0);
  const materialCost = prizes.reduce((sum, p) => sum + Math.max(0, p.unitCost) * p.quantityTotal, 0);
  const projectedPaidSpins = input.simulation?.averageCompleted ?? projectedSeasonSpins;
  const theoreticalGrossAtProjectedPaidSpins = projectedPaidSpins * paidSpinPrice;

  const warnings: string[] = [];
  if (projectedSeasonSpins > 0 && totalFiniteInventory < projectedSeasonSpins) {
    warnings.push("Потенциальных finite-наград меньше прогнозируемого числа спинов: часть сезона может уйти в EMPTY.");
  }
  if (inventoryCoverage < 0.25) {
    warnings.push("Фонд покрывает менее 25% прогнозируемых спинов.");
  } else if (inventoryCoverage < 0.5) {
    warnings.push("Фонд покрывает менее 50% прогнозируемых спинов.");
  }
  if (input.simulation) {
    const exhausted = input.simulation.prizeResults.filter(p => p.exhaustRate >= 0.5);
    if (exhausted.length > 0) warnings.push(`${exhausted.length} приз(ов) имеют риск истощения >= 50% в симуляции.`);
    if (input.simulation.averageEmpty > Math.max(1, projectedSeasonSpins * 0.1)) {
      warnings.push("Симуляция показывает высокий объём EMPTY при заданном фонде.");
    }
  }
  if (starsLiability > theoreticalGrossAtProjectedPaidSpins && theoreticalGrossAtProjectedPaidSpins > 0) {
    warnings.push("Теоретическая Stars liability превышает прогнозируемый gross от paid spins.");
  }

  let status: EconomyGuardrailResult["status"] = "HEALTHY";
  if (warnings.length >= 2 || (input.simulation?.prizeResults.some(p => p.exhaustRate >= 0.75) ?? false)) status = "RISK";
  else if (warnings.length === 1) status = "WATCH";

  return {
    totalFiniteInventory,
    projectedInventoryDemand,
    inventoryCoverage,
    starsLiability,
    materialCost,
    theoreticalGrossAtProjectedPaidSpins,
    warnings,
    status,
  };
}
