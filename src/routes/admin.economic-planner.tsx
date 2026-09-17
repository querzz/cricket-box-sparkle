import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Calculator, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { calculateEconomyPlan, type EconomyPlannerInput, type EconomyPlannerResult } from "@/server/economy-planner";

export const Route = createFileRoute("/admin/economic-planner")({
  head: () => ({ meta: [{ title: "Планировщик экономики — CRICKET BOX" }] }),
  component: EconomicPlanner,
});

type Season = {
  id: string;
  code: string;
  name: string;
  state: string;
  paid_spin_price: number;
  paid_spin_enabled: boolean;
  daily_free_spin: boolean;
};

type Prize = {
  id: string;
  kind: string;
  title: string;
  amount: string;
  unit_cost: string;
  currency: string | null;
  quantity_total: number;
  quantity_remaining: number;
  is_active: boolean;
};

type ApiResponse = {
  ok: boolean;
  code?: string;
  season?: Season;
  prizes?: Prize[];
  currentSpins?: { completed: number; paid: number; free: number };
};

type Scenario = EconomyPlannerInput;

const BASE_SCENARIO: Scenario = {
  participants: 150,
  maxParticipants: 300,
  seasonDays: 14,
  freeSpinsPerDay: 1,
  dailyActivityPercent: 50,
  paidEnabled: true,
  paidPriceStars: 100,
  paidConversionPercent: 25,
  averagePaidSpinsPerBuyer: 3,
  safetyMultiplier: 1.2,
  starsUsdPer1000: 1.3,
  dailyGiftBudgetUsd: 0,
  operationalReserveUsd: 0,
  prizes: [],
};

const PRESETS: Record<string, Partial<Scenario>> = {
  "Консервативный": { participants: 100, dailyActivityPercent: 30, paidPriceStars: 75, paidConversionPercent: 15, averagePaidSpinsPerBuyer: 2 },
  "Базовый": { participants: 150, dailyActivityPercent: 50, paidPriceStars: 100, paidConversionPercent: 25, averagePaidSpinsPerBuyer: 3 },
  "Сильный": { participants: 200, dailyActivityPercent: 70, paidPriceStars: 100, paidConversionPercent: 40, averagePaidSpinsPerBuyer: 4 },
  "Стресс": { participants: 300, dailyActivityPercent: 100, paidPriceStars: 100, paidConversionPercent: 40, averagePaidSpinsPerBuyer: 5 },
};

function initData() {
  if (typeof window === "undefined") return "";
  return (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim() ?? "";
}

function money(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function number(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

function pct(value: number | null) {
  return value === null ? "—" : `${(value * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function updateNumber<T extends Scenario>(scenario: T, key: keyof Scenario, value: string): T {
  const parsed = Number(value);
  return { ...scenario, [key]: Number.isFinite(parsed) ? parsed : 0 };
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg tabular-nums">{value}</p></div>;
}

function Field({ label, value, onChange, min, max, step = 1, disabled = false }: { label: string; value: number; onChange: (value: string) => void; min?: number; max?: number; step?: number; disabled?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span><input type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="admin-input w-full disabled:opacity-50" /></label>;
}

function StatusCard({ result }: { result: EconomyPlannerResult }) {
  const tone = result.status === "HEALTHY" ? "border-primary/25 bg-primary/5" : result.status === "LOW MARGIN" ? "border-warning/30 bg-warning/5" : "border-destructive/30 bg-destructive/5";
  const label = result.status === "HEALTHY" ? "HEALTHY" : result.status === "LOW MARGIN" ? "LOW MARGIN" : "LOSS RISK";
  return <GlassCard className={`px-4 py-4 ${tone}`} glow><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Экономическое состояние</p><h2 className="mt-1 font-display text-2xl uppercase">{label}</h2><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Расчёт основан только на текущих допущениях и настроенном призовом фонде. Настройки сезона автоматически не меняются.</p></div><Calculator className="size-6 text-primary-glow" /></div><div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4"><Metric label="Revenue" value={money(result.estimatedRevenueUsd)} /><Metric label="Known cost" value={money(result.knownCostUsd)} /><Metric label="Маржа" value={money(result.marginUsd)} /><Metric label="Маржа %" value={pct(result.marginRate)} /></div></GlassCard>;
}

function EconomicPlanner() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [season, setSeason] = useState<Season | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [currentSpins, setCurrentSpins] = useState({ completed: 0, paid: 0, free: 0 });
  const [scenario, setScenario] = useState<Scenario>(BASE_SCENARIO);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSeasons() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/seasons?initData=${encodeURIComponent(initData())}`);
      const data = await response.json() as { ok?: boolean; code?: string; seasons?: Season[] };
      if (!response.ok || !data.ok) throw new Error(data.code ?? "SEASONS_FAILED");
      const list = data.seasons ?? [];
      setSeasons(list);
      setSeasonId(current => current && list.some((item) => item.id === current) ? current : list.find((item) => item.state === "ACTIVE")?.id ?? list[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить сезоны.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSeason(id: string) {
    if (!id) return;
    setError("");
    setLoaded(false);
    try {
      const response = await fetch(`/api/admin/economic-planner?seasonId=${encodeURIComponent(id)}&initData=${encodeURIComponent(initData())}`);
      const data = await response.json() as ApiResponse;
      if (!response.ok || !data.ok || !data.season) throw new Error(data.code ?? "PLANNER_FAILED");
      setSeason(data.season);
      setPrizes(data.prizes ?? []);
      setCurrentSpins(data.currentSpins ?? { completed: 0, paid: 0, free: 0 });
      setScenario((previous) => ({ ...previous, paidPriceStars: Number(data.season?.paid_spin_price ?? previous.paidPriceStars), paidEnabled: data.season?.paid_spin_enabled ?? previous.paidEnabled, freeSpinsPerDay: data.season?.daily_free_spin ? 1 : 0, prizes: (data.prizes ?? []).map((p) => ({ kind: p.kind, title: p.title, amount: Number(p.amount) || 0, unitCost: Number(p.unit_cost) || 0, currency: p.currency, quantityTotal: Number(p.quantity_total) || 0, quantityRemaining: Number(p.quantity_remaining) || 0 })) }));
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные сезона.");
    }
  }

  useEffect(() => { void loadSeasons(); }, []);
  useEffect(() => { void loadSeason(seasonId); }, [seasonId]);

  const result = useMemo(() => calculateEconomyPlan(scenario), [scenario]);

  const applyPreset = (name: string) => {
    setScenario(previous => ({ ...previous, ...PRESETS[name] }));
  };

  const materialRows = useMemo(() => Object.entries(result.materialCostByCurrency).sort(([a], [b]) => a.localeCompare(b)), [result.materialCostByCurrency]);

  return <AppShell title="Планировщик экономики" nav={false}>
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3"><Link to="/admin/economics" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Экономика</Link><button type="button" onClick={() => void loadSeason(seasonId)} className="inline-flex items-center gap-1.5 text-[10px] text-primary-glow"><RefreshCw className="size-3.5" /> Обновить фонд</button></div>

      <GlassCard className="px-4 py-4" glow>
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Season planning</p><h1 className="mt-1 font-display text-xl uppercase">Экономический планировщик</h1><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Dry-run модель для Season #001 и следующих сезонов. Ничего не записывает обратно в настройки сезона.</p></div><Calculator className="size-5 text-primary-glow" /></div>
        <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="admin-input mt-4 w-full">{seasons.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.state}</option>)}</select>
        {season && <p className="mt-2 text-[9px] text-muted-foreground">Текущие спины: {number(currentSpins.completed)} · free {number(currentSpins.free)} · paid {number(currentSpins.paid)}.</p>}
      </GlassCard>

      {loading && <GlassCard className="px-4 py-6 text-center text-xs text-muted-foreground">Загрузка…</GlassCard>}
      {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
      {loaded && <>
        <StatusCard result={result} />

        <section><div className="mb-2 flex items-center justify-between"><h2 className="section-label">Сценарий</h2><button type="button" onClick={() => setScenario((previous) => ({ ...previous, ...BASE_SCENARIO, prizes: previous.prizes, paidPriceStars: season?.paid_spin_price ?? BASE_SCENARIO.paidPriceStars }))} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><RotateCcw className="size-3" /> Сбросить</button></div><div className="mb-2 flex gap-2 overflow-x-auto pb-1">{Object.keys(PRESETS).map((name) => <button key={name} type="button" onClick={() => applyPreset(name)} className="shrink-0 rounded-full border border-glass-border bg-muted/10 px-3 py-1.5 text-[10px] font-semibold">{name}</button>)}</div><GlassCard className="grid gap-3 px-4 py-4 md:grid-cols-2"><Field label="Целевые участники" value={scenario.participants} min={0} max={100000} onChange={(v) => setScenario((p) => updateNumber(p, "participants", v))} /><Field label="Максимум участников" value={scenario.maxParticipants} min={1} max={100000} onChange={(v) => setScenario((p) => updateNumber(p, "maxParticipants", v))} /><Field label="Дни сезона" value={scenario.seasonDays} min={1} max={365} onChange={(v) => setScenario((p) => updateNumber(p, "seasonDays", v))} /><Field label="Free spins / день" value={scenario.freeSpinsPerDay} min={0} max={5} onChange={(v) => setScenario((p) => updateNumber(p, "freeSpinsPerDay", v))} /><Field label="Средняя дневная активность, %" value={scenario.dailyActivityPercent} min={0} max={100} onChange={(v) => setScenario((p) => updateNumber(p, "dailyActivityPercent", v))} /><Field label="Платных spin на покупателя" value={scenario.averagePaidSpinsPerBuyer} min={0} max={100} step={0.1} disabled={!scenario.paidEnabled} onChange={(v) => setScenario((p) => updateNumber(p, "averagePaidSpinsPerBuyer", v))} /><Field label="Paid conversion, %" value={scenario.paidConversionPercent} min={0} max={100} onChange={(v) => setScenario((p) => updateNumber(p, "paidConversionPercent", v))} /><Field label="Цена paid spin, ⭐" value={scenario.paidPriceStars} min={0} max={100000} onChange={(v) => setScenario((p) => updateNumber(p, "paidPriceStars", v))} /><Field label="Safety multiplier" value={scenario.safetyMultiplier} min={1} max={5} step={0.05} onChange={(v) => setScenario((p) => updateNumber(p, "safetyMultiplier", v))} /><label className="flex items-end gap-2 rounded-2xl border border-glass-border bg-muted/10 px-3 py-3"><input type="checkbox" checked={scenario.paidEnabled} onChange={(e) => setScenario((p) => ({ ...p, paidEnabled: e.target.checked }))} /><span className="text-xs font-semibold">Paid spins включены</span></label></GlassCard></section>

        <section><h2 className="section-label mb-2">Финансовые допущения</h2><GlassCard className="grid gap-3 px-4 py-4 md:grid-cols-2"><Field label="Stars withdrawal model, $ / 1000 ⭐" value={scenario.starsUsdPer1000} min={0} max={1000} step={0.01} onChange={(v) => setScenario((p) => updateNumber(p, "starsUsdPer1000", v))} /><Field label="Бюджет Daily Gift, $" value={scenario.dailyGiftBudgetUsd} min={0} max={1000000} step={0.01} onChange={(v) => setScenario((p) => updateNumber(p, "dailyGiftBudgetUsd", v))} /><Field label="Операционный резерв, $" value={scenario.operationalReserveUsd} min={0} max={1000000} step={0.01} onChange={(v) => setScenario((p) => updateNumber(p, "operationalReserveUsd", v))} /><div className="rounded-2xl border border-glass-border bg-muted/10 px-3 py-3 text-[10px] leading-relaxed text-muted-foreground"><b className="text-foreground">Важно:</b> ставка Stars здесь — только сценарное допущение планировщика. Она не записывается в product logic и должна сверяться с актуальными данными Telegram при reconciliation.</div></GlassCard></section>

        <section><h2 className="section-label mb-2">Результаты</h2><GlassCard className="px-4 py-4"><div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Metric label="Активных, ожид." value={number(result.expectedActiveParticipants)} /><Metric label="Free, ожид." value={number(result.expectedFreeSpins)} /><Metric label="Free, максимум" value={number(result.maxFreeSpins)} /><Metric label="Paid spins" value={number(result.expectedPaidSpins)} /><Metric label="Всего, ожид." value={number(result.expectedTotalSpins)} /><Metric label="Плановый объём" value={number(result.planningSpins)} /><Metric label="Gross" value={`${number(result.grossStarsCharged)} ⭐`} /><Metric label="Pool utilization" value={pct(result.planningPoolUtilization)} /></div></GlassCard></section>

        <section><h2 className="section-label mb-2">Break-even и затраты</h2><GlassCard className="space-y-2 px-4 py-4"><Row label="Stars liability" value={`${number(result.starsPrizeLiability)} ⭐ · ${money(result.starsPrizeLiabilityUsd)}`} /><Row label="Stars revenue" value={`${number(result.grossStarsCharged)} ⭐ · ${money(result.estimatedRevenueUsd)}`} /><Row label="Материальные затраты USD" value={money(result.materialCostUsd)} /><Row label="Daily Gift" value={money(result.dailyGiftBudgetUsd)} /><Row label="Резерв" value={money(result.operationalReserveUsd)} /><Row label="Known cost" value={money(result.knownCostUsd)} /><Row label="Break-even paid spins" value={result.breakEvenPaidSpins === null ? "—" : number(result.breakEvenPaidSpins)} /><Row label="Break-even paid conversion" value={pct(result.breakEvenPaidConversion)} /></GlassCard></section>

        {materialRows.length > 0 && <section><h2 className="section-label mb-2">Затраты по валютам</h2><GlassCard className="space-y-1 px-4 py-4">{materialRows.map(([currency, value]) => <Row key={currency} label={currency} value={number(value)} />)}<p className="pt-2 text-[10px] leading-relaxed text-muted-foreground">Не-USD затраты не смешиваются с USD-маржой без отдельного FX-допущения.</p></GlassCard></section>}

        <section><h2 className="section-label mb-2">Призовой фонд</h2><GlassCard className="space-y-2 px-3 py-3">{prizes.map((prize) => <div key={prize.id} className="rounded-xl border border-glass-border bg-muted/10 px-3 py-2.5"><div className="flex justify-between gap-3"><span className="truncate text-xs font-semibold">{prize.title}</span><span className="text-xs font-semibold">{number(prize.quantity_total)} шт.</span></div><p className="mt-1 text-[9px] text-muted-foreground">Осталось {number(prize.quantity_remaining)} · {prize.kind}{prize.currency ? ` · ${prize.currency}` : ""}{prize.unit_cost !== "0" ? ` · ${prize.unit_cost} / ед.` : ""}</p></div>)}{prizes.length===0&&<p className="py-4 text-center text-xs text-muted-foreground">Призовой фонд не настроен.</p>}</GlassCard></section>

        <section><h2 className="section-label mb-2">Допущения</h2><GlassCard className="space-y-2 px-4 py-4"><Row label="Участники / максимум" value={`${number(result.participants)} / ${number(result.maxParticipants)}`} /><Row label="Дней" value={number(scenario.seasonDays)} /><Row label="Free spins / день" value={number(scenario.freeSpinsPerDay)} /><Row label="Дневная активность" value={`${number(scenario.dailyActivityPercent)}%`} /><Row label="Paid conversion" value={`${number(scenario.paidConversionPercent)}%`} /><Row label="Avg paid / buyer" value={number(scenario.averagePaidSpinsPerBuyer)} /><Row label="Safety multiplier" value={number(scenario.safetyMultiplier)} /><Row label="Stars model" value={`${money(scenario.starsUsdPer1000)} / 1000 ⭐`} /></GlassCard></section>

        {result.warnings.length>0&&<section><h2 className="section-label mb-2">Предупреждения</h2><GlassCard className="space-y-2 px-4 py-4">{result.warnings.map((warning)=><p key={warning} className="text-[10px] leading-relaxed">• {warning}</p>)}</GlassCard></section>}
      </>}
    </div>
  </AppShell>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-glass-border py-2.5 last:border-0"><span className="text-[11px] text-muted-foreground">{label}</span><span className="text-right text-sm font-semibold tabular-nums">{value}</span></div>;
}
