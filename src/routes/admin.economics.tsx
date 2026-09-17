import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Calculator, Play, RefreshCw, RotateCcw, Save, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { calculateEconomyPlan, type EconomyPlannerInput, type EconomyPlannerResult } from "@/server/economy-planner";

export const Route = createFileRoute("/admin/economics")({
  head: () => ({ meta: [{ title: "Экономика — CRICKET BOX" }] }),
  component: EconomicsScreen,
});

type Season = {
  id: string;
  code: string;
  name: string;
  state: string;
  starts_at: string | null;
  ends_at: string | null;
  paid_spin_price: number;
  paid_spin_enabled: boolean;
  daily_free_spin: boolean;
};

type Prize = {
  id: string;
  kind: string;
  title: string;
  quantityTotal: number;
  quantityRemaining: number;
  unitCost: number;
  amount: number;
  active: boolean;
  weight: number;
  currentChance: number;
  currency: string | null;
};

type Economy = {
  season: Season;
  spins: { hour: number; day: number; week: number; season: number };
  metrics: {
    elapsedFraction: number;
    completedSpins: number;
    pacePerDay: number;
    projectedSeasonSpins: number;
    remainingDays: number;
  };
  prizes: Prize[];
};

type Drop = {
  id: string;
  name: string;
  trigger_type: string;
  trigger_value: number | null;
  payload?: { prizes?: Array<{ kind?: string; title?: string; quantityTotal?: number }> };
  status: string;
};

type SimulationResult = {
  trials: number;
  averageCompleted: number;
  averageEmpty: number;
  averageInventoryConsumed: number;
  prizeResults: Array<{
    id: string;
    title: string;
    averageWon: number;
    averageRemaining: number;
    winRate: number;
    exhaustRate: number;
  }>;
};

type Api<T> = {
  ok: boolean;
  code?: string;
  seasons?: T;
  season?: Season;
  spins?: Economy["spins"];
  metrics?: Economy["metrics"];
  prizes?: Prize[];
  snapshots?: unknown[];
  drops?: T;
  result?: SimulationResult;
};

type PlanScenario = EconomyPlannerInput;

const BASE_PLAN: PlanScenario = {
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

const PLAN_PRESETS: Record<string, Partial<PlanScenario>> = {
  "Консервативный": { participants: 100, dailyActivityPercent: 30, paidPriceStars: 75, paidConversionPercent: 15, averagePaidSpinsPerBuyer: 2 },
  "Базовый": { participants: 150, dailyActivityPercent: 50, paidPriceStars: 100, paidConversionPercent: 25, averagePaidSpinsPerBuyer: 3 },
  "Сильный": { participants: 200, dailyActivityPercent: 70, paidPriceStars: 100, paidConversionPercent: 40, averagePaidSpinsPerBuyer: 4 },
  "Стресс": { participants: 300, dailyActivityPercent: 100, paidPriceStars: 100, paidConversionPercent: 40, averagePaidSpinsPerBuyer: 5 },
};

function getInitData() {
  if (typeof window === "undefined") return "";
  return (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim() ?? "";
}

async function api<T>(url: string, method: "GET" | "POST" | "PATCH" = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify({ ...body, initData: getInitData() }) } : {}),
  });
  const data = (await response.json()) as Api<T>;
  if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
  return data;
}

function durationDays(season: Season) {
  if (!season.starts_at || !season.ends_at) return 14;
  return Math.max(1, Math.round((new Date(season.ends_at).getTime() - new Date(season.starts_at).getTime()) / 86400000));
}

function triggerLabel(type: string) {
  if (type === "SPIN_COUNT") return "После заданного числа прокруток";
  if (type === "SEASON_PERCENT") return "При прогрессе сезона";
  if (type === "AT") return "В заданные дату и время";
  return "Вручную";
}

function number(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

function money(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(value: number | null) {
  return value === null ? "—" : `${(value * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg tabular-nums">{value}</p></div>;
}

function StatusCard({ result }: { result: EconomyPlannerResult }) {
  const tone = result.status === "HEALTHY" ? "border-primary/25 bg-primary/5" : result.status === "LOW MARGIN" ? "border-warning/30 bg-warning/5" : "border-destructive/30 bg-destructive/5";
  return <GlassCard className={`px-4 py-4 ${tone}`} glow><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Финансовый сценарий</p><h2 className="mt-1 font-display text-2xl uppercase">{result.status}</h2><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Dry-run расчёт. Он не меняет настройки сезона и использует текущий призовой фонд.</p></div><Calculator className="size-6 text-primary-glow" /></div><div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4"><Metric label="Revenue" value={money(result.estimatedRevenueUsd)} /><Metric label="Known cost" value={money(result.knownCostUsd)} /><Metric label="Маржа" value={money(result.marginUsd)} /><Metric label="Маржа %" value={pct(result.marginRate)} /></div></GlassCard>;
}

function EconomicsScreen() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [economy, setEconomy] = useState<Economy | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [plan, setPlan] = useState<PlanScenario>(BASE_PLAN);
  const [simSpins, setSimSpins] = useState("10000");
  const [simTrials, setSimTrials] = useState("50");
  const [dropName, setDropName] = useState("");
  const [triggerType, setTriggerType] = useState("SPIN_COUNT");
  const [triggerValue, setTriggerValue] = useState("100");
  const [dropKind, setDropKind] = useState("STARS");
  const [dropTitle, setDropTitle] = useState("20 Stars");
  const [dropAmount, setDropAmount] = useState("20");
  const [dropQuantity, setDropQuantity] = useState("10");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadSeasons = async () => {
    setLoading(true);
    try {
      const data = await api<Season[]>(`/api/admin/seasons?initData=${encodeURIComponent(getInitData())}`);
      const list = data.seasons ?? [];
      setSeasons(list);
      setSeasonId((current) => current && list.some((s) => s.id === current) ? current : list.find((s) => s.state === "ACTIVE")?.id ?? list[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить сезоны.");
    } finally {
      setLoading(false);
    }
  };

  const load = async (id: string) => {
    if (!id) return;
    setError("");
    try {
      const [economyData, dropData] = await Promise.all([
        api<Economy>(`/api/admin/economy?seasonId=${encodeURIComponent(id)}&history=10&initData=${encodeURIComponent(getInitData())}`),
        api<Drop[]>(`/api/admin/drops?seasonId=${encodeURIComponent(id)}&initData=${encodeURIComponent(getInitData())}`),
      ]);
      if (!economyData.season || !economyData.spins || !economyData.metrics || !economyData.prizes) throw new Error("INVALID_ECONOMY_RESPONSE");
      setEconomy({ season: economyData.season, spins: economyData.spins, metrics: economyData.metrics, prizes: economyData.prizes });
      setDrops(dropData.drops ?? []);
      setSimulation(null);
      setPlan((previous) => ({
        ...previous,
        seasonDays: durationDays(economyData.season!),
        freeSpinsPerDay: economyData.season!.daily_free_spin ? 1 : 0,
        paidEnabled: economyData.season!.paid_spin_enabled,
        paidPriceStars: Number(economyData.season!.paid_spin_price ?? previous.paidPriceStars),
        prizes: (economyData.prizes ?? []).map((p) => ({
          kind: p.kind,
          title: p.title,
          amount: Number(p.amount) || 0,
          unitCost: Number(p.unitCost) || 0,
          currency: p.currency,
          quantityTotal: Number(p.quantityTotal) || 0,
          quantityRemaining: Number(p.quantityRemaining) || 0,
        })),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить экономику.");
    }
  };

  useEffect(() => { void loadSeasons(); }, []);
  useEffect(() => { void load(seasonId); }, [seasonId]);

  const planResult = useMemo(() => calculateEconomyPlan(plan), [plan]);

  const updatePlanNumber = <K extends keyof PlanScenario>(key: K, value: string) => {
    const parsed = Number(value);
    setPlan((previous) => ({ ...previous, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const resetPlan = () => setPlan((previous) => ({ ...BASE_PLAN, prizes: previous.prizes, seasonDays: economy ? durationDays(economy.season) : BASE_PLAN.seasonDays, freeSpinsPerDay: economy?.season.daily_free_spin ? 1 : 0, paidEnabled: economy?.season.paid_spin_enabled ?? BASE_PLAN.paidEnabled, paidPriceStars: Number(economy?.season.paid_spin_price ?? BASE_PLAN.paidPriceStars) }));

  const simulate = async () => {
    if (!seasonId) return;
    const spins = Number(simSpins);
    const trials = Number(simTrials);
    if (!Number.isInteger(spins) || spins < 1 || spins > 100000 || !Number.isInteger(trials) || trials < 1 || trials > 200) {
      setError("Для симуляции: спины 1–100000, прогоны 1–200.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api<SimulationResult>(`/api/admin/economy/simulate`, "POST", { seasonId, spins, trials });
      if (!data.result) throw new Error("INVALID_SIMULATION_RESPONSE");
      setSimulation(data.result);
      setMessage("Симуляция завершена. Реальный фонд не изменён.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Симуляция не выполнена.");
    } finally {
      setBusy(false);
    }
  };

  const createDrop = async () => {
    if (!seasonId || !dropName.trim()) return;
    const quantity = Math.max(1, Math.floor(Number(dropQuantity) || 0));
    const amount = Math.max(0, Number(dropAmount) || 0);
    let value: number | null = null;
    if (triggerType !== "MANUAL") value = triggerType === "SPIN_COUNT" ? Math.max(1, Number(triggerValue) || 1) : Math.min(100, Math.max(1, Number(triggerValue) || 1));
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/drops`, "POST", {
        seasonId,
        name: dropName.trim(),
        triggerType,
        triggerValue: value,
        payload: { prizes: [{ kind: dropKind, title: dropTitle.trim() || `${dropKind} drop`, amount, quantityTotal: quantity, active: true }] },
      });
      setDropName("");
      setMessage("LiveOps-дроп запланирован.");
      await load(seasonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать дроп.");
    } finally {
      setBusy(false);
    }
  };

  const dropAction = async (id: string, action: "ACTIVATE" | "CANCEL") => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/drops`, "PATCH", { id, seasonId, action });
      setMessage(action === "ACTIVATE" ? "Дроп активирован и добавлен в фонд." : "Дроп отменён.");
      await load(seasonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Операция с дропом не выполнена.");
    } finally {
      setBusy(false);
    }
  };

  const saveSnapshot = async () => {
    if (!seasonId) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/economy`, "POST", { seasonId });
      setMessage("Снимок экономики сохранён.");
      await load(seasonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить снимок.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Экономика" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>

        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Экономика сезона</p><h1 className="mt-1 font-display text-xl uppercase">{economy?.season.code ?? "Выбери сезон"}</h1><p className="mt-1 text-[10px] text-muted-foreground">Фонд, прогноз, финансовый план и LiveOps в одном месте.</p></div><button type="button" onClick={() => void load(seasonId)} className="grid size-9 place-items-center rounded-xl border border-glass-border"><RefreshCw className="size-4" /></button></div>
          <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="admin-input mt-4 w-full">{seasons.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.state}</option>)}</select>
          {economy && <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5"><Metric label="Спинов" value={String(economy.metrics.completedSpins)} /><Metric label="В день" value={economy.metrics.pacePerDay.toFixed(1)} /><Metric label="Прогноз" value={economy.metrics.projectedSeasonSpins.toFixed(0)} /><Metric label="Осталось" value={`${economy.metrics.remainingDays.toFixed(1)} д.`} /><Metric label="Прогресс" value={`${Math.round(economy.metrics.elapsedFraction * 100)}%`} /></div>}
        </GlassCard>

        {loading && <p className="text-center text-[10px] text-muted-foreground">Загрузка…</p>}
        {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
        {message && <GlassCard className="border-primary/25 bg-primary/5 px-4 py-3 text-[11px]">{message}</GlassCard>}

        <section>
          <div className="mb-2 flex items-center justify-between"><div><h2 className="section-label">Финансовый план</h2><p className="text-[10px] text-muted-foreground">Единая модель для участников, paid conversion, выручки, затрат и безубыточности.</p></div><button type="button" onClick={resetPlan} className="text-[10px] text-muted-foreground"><RotateCcw className="mr-1 inline size-3" /> Сбросить</button></div>
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">{Object.keys(PLAN_PRESETS).map((name) => <button key={name} type="button" onClick={() => setPlan((previous) => ({ ...previous, ...PLAN_PRESETS[name] }))} className="shrink-0 rounded-full border border-glass-border bg-muted/10 px-3 py-1.5 text-[10px] font-semibold">{name}</button>)}</div>
          <StatusCard result={planResult} />
          <GlassCard className="mt-2 grid gap-3 px-4 py-4 md:grid-cols-2">
            <Field label="Участники"><input type="number" min={0} max={100000} value={plan.participants} onChange={(e) => updatePlanNumber("participants", e.target.value)} className="admin-input w-full" /></Field>
            <Field label="Максимум участников"><input type="number" min={1} max={100000} value={plan.maxParticipants} onChange={(e) => updatePlanNumber("maxParticipants", e.target.value)} className="admin-input w-full" /></Field>
            <Field label="Дни сезона"><input type="number" min={1} max={365} value={plan.seasonDays} onChange={(e) => updatePlanNumber("seasonDays", e.target.value)} className="admin-input w-full" /></Field>
            <Field label="Free spins / день"><input type="number" min={0} max={5} value={plan.freeSpinsPerDay} onChange={(e) => updatePlanNumber("freeSpinsPerDay", e.target.value)} className="admin-input w-full" /></Field>
            <Field label="Средняя дневная активность, %"><input type="number" min={0} max={100} value={plan.dailyActivityPercent} onChange={(e) => updatePlanNumber("dailyActivityPercent", e.target.value)} className="admin-input w-full" /></Field>
            <Field label="Paid conversion, %"><input type="number" min={0} max={100} value={plan.paidConversionPercent} onChange={(e) => updatePlanNumber("paidConversionPercent", e.target.value)} className="admin-input w-full" /></Field>
            <Field label="Платных spin на покупателя"><input type="number" min={0} max={100} step={0.1} disabled={!plan.paidEnabled} value={plan.averagePaidSpinsPerBuyer} onChange={(e) => updatePlanNumber("averagePaidSpinsPerBuyer", e.target.value)} className="admin-input w-full disabled:opacity-50" /></Field>
            <Field label="Цена paid spin, ⭐"><input type="number" min={0} max={100000} value={plan.paidPriceStars} onChange={(e) => updatePlanNumber("paidPriceStars", e.target.value)} className="admin-input w-full" /></Field>
            <Field label="Safety multiplier"><input type="number" min={1} max={5} step={0.05} value={plan.safetyMultiplier} onChange={(e) => updatePlanNumber("safetyMultiplier", e.target.value)} className="admin-input w-full" /></Field>
            <label className="flex items-end gap-2 rounded-2xl border border-glass-border bg-muted/10 px-3 py-3"><input type="checkbox" checked={plan.paidEnabled} onChange={(e) => setPlan((previous) => ({ ...previous, paidEnabled: e.target.checked }))} /><span className="text-xs font-semibold">Paid spins включены</span></label>
          </GlassCard>
          <GlassCard className="mt-2 grid gap-3 px-4 py-4 md:grid-cols-3"><Field label="Stars withdrawal model, $ / 1000 ⭐"><input type="number" min={0} max={1000} step={0.01} value={plan.starsUsdPer1000} onChange={(e) => updatePlanNumber("starsUsdPer1000", e.target.value)} className="admin-input w-full" /></Field><Field label="Daily Gift бюджет, $"><input type="number" min={0} max={1000000} step={0.01} value={plan.dailyGiftBudgetUsd} onChange={(e) => updatePlanNumber("dailyGiftBudgetUsd", e.target.value)} className="admin-input w-full" /></Field><Field label="Операционный резерв, $"><input type="number" min={0} max={1000000} step={0.01} value={plan.operationalReserveUsd} onChange={(e) => updatePlanNumber("operationalReserveUsd", e.target.value)} className="admin-input w-full" /></Field></GlassCard>
          <GlassCard className="mt-2 px-4 py-4"><h3 className="section-label">Результат сценария</h3><div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4"><Metric label="Активные" value={number(planResult.expectedActiveParticipants)} /><Metric label="Free spins" value={number(planResult.expectedFreeSpins)} /><Metric label="Paid buyers" value={number(planResult.expectedPaidBuyers)} /><Metric label="Paid spins" value={number(planResult.expectedPaidSpins)} /><Metric label="Всего spins" value={number(planResult.expectedTotalSpins)} /><Metric label="Плановый объём" value={number(planResult.planningSpins)} /><Metric label="Revenue" value={money(planResult.estimatedRevenueUsd)} /><Metric label="Known cost" value={money(planResult.knownCostUsd)} /><Metric label="Stars charged" value={number(planResult.grossStarsCharged)} /><Metric label="Stars liability" value={number(planResult.starsPrizeLiability)} /><Metric label="Break-even spins" value={number(planResult.breakEvenPaidSpins ?? 0)} /><Metric label="Break-even conversion" value={pct(planResult.breakEvenPaidConversion)} /><Metric label="Pool utilization" value={pct(planResult.planningPoolUtilization)} /><Metric label="Остаток фонда" value={number(planResult.currentRemainingOutcomes)} /></div>{planResult.warnings.length > 0 && <div className="mt-3 space-y-1.5">{planResult.warnings.map((warning) => <p key={warning} className="rounded-xl border border-warning/20 bg-warning/5 px-3 py-2 text-[10px] text-warning">{warning}</p>)}</div>}</GlassCard>
        </section>

        <GlassCard className="px-4 py-4"><div className="flex items-center justify-between"><h2 className="section-label">Фонд и шансы</h2><span className="text-[9px] text-muted-foreground">по остаткам</span></div><div className="mt-3 space-y-2">{economy?.prizes.filter((p) => p.active).map((p) => <div key={p.id} className="rounded-xl border border-glass-border bg-muted/10 px-3 py-2"><div className="flex justify-between gap-3"><span className="truncate text-xs font-semibold">{p.title}</span><span className="text-xs font-semibold">{(p.currentChance * 100).toLocaleString('ru-RU', { maximumFractionDigits: 4 })}%</span></div><p className="mt-1 text-[9px] text-muted-foreground">Осталось {p.quantityRemaining} из {p.quantityTotal} · вес {p.weight}</p></div>)}</div></GlassCard>

        <GlassCard className="px-4 py-4"><div className="flex items-center justify-between"><h2 className="section-label">Симулятор фонда</h2><span className="text-[9px] text-muted-foreground">dry run</span></div><div className="mt-3 grid grid-cols-2 gap-2"><Field label="Спины"><input type="number" min={1} max={100000} value={simSpins} onChange={(e) => setSimSpins(e.target.value)} className="admin-input w-full" /></Field><Field label="Прогоны"><input type="number" min={1} max={200} value={simTrials} onChange={(e) => setSimTrials(e.target.value)} className="admin-input w-full" /></Field></div><PrimaryButton fullWidth disabled={busy || !seasonId} onClick={() => void simulate()} className="mt-3"><Play className="mr-2 size-4" />{busy ? 'Считаем…' : 'Запустить симуляцию'}</PrimaryButton>{simulation && <div className="mt-3 grid gap-2 md:grid-cols-2"><Metric label="Средний исходов" value={simulation.averageCompleted.toFixed(0)} /><Metric label="Средний EMPTY" value={simulation.averageEmpty.toFixed(0)} /><Metric label="Прогонов" value={String(simulation.trials)} /><Metric label="Потреблено фонда" value={simulation.averageInventoryConsumed.toFixed(0)} />{simulation.prizeResults.map((p) => <div key={p.id} className="rounded-xl border border-glass-border px-3 py-2"><div className="flex justify-between text-[10px] font-semibold"><span>{p.title}</span><span>{(p.winRate * 100).toFixed(1)}%</span></div><p className="mt-1 text-[9px] text-muted-foreground">avg выиграно {p.averageWon.toFixed(1)} · остаток {p.averageRemaining.toFixed(1)} · исчерпание {(p.exhaustRate * 100).toFixed(0)}%</p></div>)}</div>}</GlassCard>

        <section><div className="mb-2"><h2 className="section-label">LiveOps-дропы</h2><p className="text-[10px] leading-relaxed text-muted-foreground">Дополнительная партия призов, которая добавляется в фонд по условию или вручную.</p></div><GlassCard className="space-y-3 px-4 py-4"><Field label="Название события"><input value={dropName} onChange={(e) => setDropName(e.target.value)} placeholder="Например: 1000-й спин" className="admin-input w-full" /></Field><Field label="Триггер"><select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="admin-input w-full"><option value="SPIN_COUNT">После N прокруток</option><option value="SEASON_PERCENT">При N% сезона</option><option value="MANUAL">Только вручную</option></select></Field>{triggerType !== 'MANUAL' && <Field label={triggerType === 'SPIN_COUNT' ? 'Количество прокруток' : 'Процент сезона'}><input type="number" min={1} max={triggerType === 'SPIN_COUNT' ? 1000000 : 100} value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} className="admin-input w-full" /></Field>}<div className="rounded-2xl border border-primary/15 bg-primary/5 px-3 py-3"><p className="text-xs font-semibold">Что выдаём</p><div className="mt-2 space-y-2"><select value={dropKind} onChange={(e) => setDropKind(e.target.value)} className="admin-input w-full"><option value="STARS">Stars</option><option value="PREMIUM">Telegram Premium</option><option value="MONEY">Деньги</option><option value="EMPTY">Ничего</option></select><input value={dropTitle} onChange={(e) => setDropTitle(e.target.value)} placeholder="Название награды" className="admin-input w-full" /><div className="grid grid-cols-2 gap-2"><input type="number" min={0} value={dropAmount} onChange={(e) => setDropAmount(e.target.value)} placeholder="Сумма" className="admin-input w-full" /><input type="number" min={1} value={dropQuantity} onChange={(e) => setDropQuantity(e.target.value)} placeholder="Количество" className="admin-input w-full" /></div></div></div><PrimaryButton fullWidth disabled={busy || !seasonId || !dropName.trim()} onClick={() => void createDrop()}><Zap className="mr-2 size-4" /> Запланировать дроп</PrimaryButton></GlassCard><div className="space-y-2">{drops.length === 0 && <p className="text-center text-[10px] text-muted-foreground">Дропов пока нет.</p>}{drops.map((drop) => <GlassCard key={drop.id} className="px-3.5 py-3"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{drop.name}</p><p className="mt-1 text-[9px] font-medium text-primary-glow">{triggerLabel(drop.trigger_type)}</p><p className="mt-1 text-[9px] text-muted-foreground">{drop.trigger_value === null ? 'Запускается вручную' : `Порог: ${drop.trigger_value}`}</p><p className="mt-1 text-[9px] text-muted-foreground">Награда: {drop.payload?.prizes?.map((p) => `${p.title ?? p.kind ?? 'приз'} × ${p.quantityTotal ?? '?'}`).join(', ') ?? 'не указана'}</p><p className="mt-1 text-[9px] text-muted-foreground">Статус: {drop.status === 'SCHEDULED' ? 'Запланирован' : drop.status === 'EXECUTED' ? 'Выполнен' : drop.status === 'CANCELLED' ? 'Отменён' : 'Активен'}</p></div>{drop.status === 'SCHEDULED' && <div className="flex shrink-0 gap-1.5"><button type="button" disabled={busy} onClick={() => void dropAction(drop.id, 'ACTIVATE')} className="grid size-8 place-items-center rounded-lg border border-primary/25 bg-primary/5"><Zap className="size-3" /></button><button type="button" disabled={busy} onClick={() => void dropAction(drop.id, 'CANCEL')} className="grid size-8 place-items-center rounded-lg border border-destructive/20 bg-destructive/5 text-destructive"><X className="size-3" /></button></div>}</div></GlassCard>)}</div></section>

        <PrimaryButton fullWidth disabled={busy || !seasonId} onClick={() => void saveSnapshot()}><Save className="mr-2 size-4" /> Сохранить live snapshot</PrimaryButton>
      </div>
    </AppShell>
  );
}
