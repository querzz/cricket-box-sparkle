export type PlannerPrize = {
  kind: string;
  title: string;
  amount: number;
  unitCost: number;
  currency: string | null;
  quantityTotal: number;
  quantityRemaining: number;
};

export type EconomyPlannerInput = {
  participants: number;
  maxParticipants: number;
  seasonDays: number;
  freeSpinsPerDay: number;
  dailyActivityPercent: number;
  paidEnabled: boolean;
  paidPriceStars: number;
  paidConversionPercent: number;
  averagePaidSpinsPerBuyer: number;
  safetyMultiplier: number;
  starsUsdPer1000: number;
  dailyGiftBudgetUsd: number;
  operationalReserveUsd: number;
  prizes: PlannerPrize[];
};

export type EconomyPlannerResult = {
  participants: number;
  maxParticipants: number;
  expectedActiveParticipants: number;
  expectedFreeSpins: number;
  maxFreeSpins: number;
  expectedPaidBuyers: number;
  expectedPaidSpins: number;
  expectedTotalSpins: number;
  planningSpins: number;
  grossStarsCharged: number;
  estimatedRevenueUsd: number;
  starsPrizeLiability: number;
  starsPrizeLiabilityUsd: number;
  dailyGiftBudgetUsd: number;
  operationalReserveUsd: number;
  materialCostByCurrency: Record<string, number>;
  materialCostUsd: number;
  knownCostUsd: number;
  marginUsd: number;
  marginRate: number | null;
  revenuePerPaidSpinUsd: number;
  breakEvenPaidSpins: number | null;
  breakEvenPaidConversion: number | null;
  totalConfiguredOutcomes: number;
  currentRemainingOutcomes: number;
  planningPoolUtilization: number | null;
  meaningfulPrizeUnits: number;
  warnings: string[];
  status: "HEALTHY" | "LOW MARGIN" | "LOSS RISK";
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const nonNegative = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);

export function calculateEconomyPlan(input: EconomyPlannerInput): EconomyPlannerResult {
  const maxParticipants = Math.max(1, Math.floor(nonNegative(input.maxParticipants)));
  const participants = Math.min(maxParticipants, Math.floor(nonNegative(input.participants)));
  const seasonDays = Math.max(1, Math.floor(nonNegative(input.seasonDays)));
  const freeSpinsPerDay = Math.max(0, Math.floor(nonNegative(input.freeSpinsPerDay)));
  const activity = clamp(nonNegative(input.dailyActivityPercent) / 100, 0, 1);
  const paidPriceStars = Math.max(0, Math.floor(nonNegative(input.paidPriceStars)));
  const paidConversion = clamp(nonNegative(input.paidConversionPercent) / 100, 0, 1);
  const avgPaid = Math.max(0, nonNegative(input.averagePaidSpinsPerBuyer));
  const safety = Math.max(1, nonNegative(input.safetyMultiplier));
  const starsUsdPer1000 = Math.max(0, nonNegative(input.starsUsdPer1000));

  const expectedActiveParticipants = Math.round(participants * activity);
  const expectedFreeSpins = Math.round(expectedActiveParticipants * seasonDays * freeSpinsPerDay);
  const maxFreeSpins = Math.round(maxParticipants * seasonDays * freeSpinsPerDay);
  const expectedPaidBuyers = input.paidEnabled ? Math.round(participants * paidConversion) : 0;
  const expectedPaidSpins = input.paidEnabled ? Math.round(expectedPaidBuyers * avgPaid) : 0;
  const expectedTotalSpins = expectedFreeSpins + expectedPaidSpins;
  const planningSpins = Math.ceil(expectedTotalSpins * safety);
  const grossStarsCharged = expectedPaidSpins * paidPriceStars;
  const estimatedRevenueUsd = (grossStarsCharged / 1000) * starsUsdPer1000;

  const materialCostByCurrency: Record<string, number> = {};
  let materialCostUsd = 0;
  let starsPrizeLiability = 0;
  let meaningfulPrizeUnits = 0;
  let totalConfiguredOutcomes = 0;
  let currentRemainingOutcomes = 0;

  for (const prize of input.prizes) {
    const quantityTotal = Math.floor(nonNegative(prize.quantityTotal));
    const quantityRemaining = Math.min(quantityTotal, Math.floor(nonNegative(prize.quantityRemaining)));
    totalConfiguredOutcomes += quantityTotal;
    currentRemainingOutcomes += quantityRemaining;
    if (prize.kind !== "EMPTY") meaningfulPrizeUnits += quantityTotal;

    if (prize.kind === "STARS") {
      starsPrizeLiability += nonNegative(prize.amount) * quantityTotal;
      continue;
    }

    const unitCost = nonNegative(prize.unitCost);
    const totalCost = unitCost * quantityTotal;
    if (totalCost === 0) continue;
    const currency = (prize.currency ?? "UNSPECIFIED").trim().toUpperCase() || "UNSPECIFIED";
    materialCostByCurrency[currency] = (materialCostByCurrency[currency] ?? 0) + totalCost;
    if (currency === "USD") materialCostUsd += totalCost;
  }

  const starsPrizeLiabilityUsd = (starsPrizeLiability / 1000) * starsUsdPer1000;
  const dailyGiftBudgetUsd = nonNegative(input.dailyGiftBudgetUsd);
  const operationalReserveUsd = nonNegative(input.operationalReserveUsd);
  const knownCostUsd = materialCostUsd + starsPrizeLiabilityUsd + dailyGiftBudgetUsd + operationalReserveUsd;
  const marginUsd = estimatedRevenueUsd - knownCostUsd;
  const marginRate = estimatedRevenueUsd > 0 ? marginUsd / estimatedRevenueUsd : null;
  const revenuePerPaidSpinUsd = paidPriceStars > 0 ? (paidPriceStars / 1000) * starsUsdPer1000 : 0;
  const breakEvenPaidSpins = revenuePerPaidSpinUsd > 0 ? Math.ceil(knownCostUsd / revenuePerPaidSpinUsd) : null;
  const denominator = participants * avgPaid;
  const breakEvenPaidConversion = denominator > 0 && breakEvenPaidSpins !== null
    ? clamp(breakEvenPaidSpins / denominator, 0, 1)
    : null;
  const planningPoolUtilization = totalConfiguredOutcomes > 0 ? planningSpins / totalConfiguredOutcomes : null;

  const warnings: string[] = [];
  if (input.participants > maxParticipants) warnings.push(`Участники ограничены максимумом ${maxParticipants}.`);
  if (!input.paidEnabled && input.paidConversionPercent > 0) warnings.push("Платные прокрутки выключены, поэтому paid conversion в расчёте обнулена.");
  if (starsUsdPer1000 <= 0 && grossStarsCharged > 0) warnings.push("Не задана сценарная стоимость вывода Telegram Stars: revenue и break-even не рассчитаны корректно.");
  if (planningSpins > totalConfiguredOutcomes && totalConfiguredOutcomes > 0) warnings.push("Плановый объём превышает весь конечный призовой пул: часть попыток неизбежно останется без finite-награды.");
  if (totalConfiguredOutcomes === 0) warnings.push("Для сезона пока не настроен конечный призовой фонд.");
  if (Object.keys(materialCostByCurrency).some((currency) => currency !== "USD")) {
    warnings.push("В фонде есть затраты не в USD. Они показаны отдельно и не включены в USD-маржу без отдельного FX-предположения.");
  }
  if (input.paidEnabled && paidPriceStars <= 0) warnings.push("Цена paid spin должна быть больше нуля.");
  if (freeSpinsPerDay > 1) warnings.push("Текущая базовая продуктовая модель предусматривает 1 free spin в день; дополнительные значения оставлены только для сценарного моделирования.");

  let status: EconomyPlannerResult["status"] = "HEALTHY";
  if (estimatedRevenueUsd <= 0 || marginUsd < 0 || (planningPoolUtilization !== null && planningPoolUtilization > 1)) {
    status = "LOSS RISK";
  } else if ((marginRate !== null && marginRate < 0.15) || warnings.length >= 2) {
    status = "LOW MARGIN";
  }

  return {
    participants,
    maxParticipants,
    expectedActiveParticipants,
    expectedFreeSpins,
    maxFreeSpins,
    expectedPaidBuyers,
    expectedPaidSpins,
    expectedTotalSpins,
    planningSpins,
    grossStarsCharged,
    estimatedRevenueUsd,
    starsPrizeLiability,
    starsPrizeLiabilityUsd,
    dailyGiftBudgetUsd,
    operationalReserveUsd,
    materialCostByCurrency,
    materialCostUsd,
    knownCostUsd,
    marginUsd,
    marginRate,
    revenuePerPaidSpinUsd,
    breakEvenPaidSpins,
    breakEvenPaidConversion,
    totalConfiguredOutcomes,
    currentRemainingOutcomes,
    planningPoolUtilization,
    meaningfulPrizeUnits,
    warnings,
    status,
  };
}
