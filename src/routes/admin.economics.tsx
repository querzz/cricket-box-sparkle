import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Play, RefreshCw, RotateCcw, Save, X, Zap } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";

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

const BASE = {
  participants: 150,
  activity: 50,
  days: 14,
  paidConversion: 25,
  avgPaid: 3,
  price: 100,
  safety: 1.2,
};

function getInitData() {
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

function triggerLabel(type: string) {
  if (type === "SPIN_COUNT") return "После заданного числа прокруток";
  if (type === "SEASON_PERCENT") return "При прогрессе сезона";
  if (type === "AT") return "В заданные дату и время";
  return "Вручную";
}

function EconomicsScreen() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [economy, setEconomy] = useState<Economy | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [params, setParams] = useState(BASE);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить экономику.");
    }
  };

  useEffect(() => { void loadSeasons(); }, []);
  useEffect(() => { void load(seasonId); }, [seasonId]);

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

  const eligible = Math.max(0, Math.round(params.participants * params.activity / 100));
  const expectedFree = eligible * params.days;
  const expectedPaid = Math.round(eligible * params.paidConversion / 100 * params.avgPaid);
  const planned = Math.ceil((expectedFree + expectedPaid) * params.safety);

  return (
    <AppShell title="Экономика" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>

        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Экономика сезона</p><h1 className="mt-1 font-display text-xl uppercase">{economy?.season.code ?? "Выбери сезон"}</h1><p className="mt-1 text-[10px] text-muted-foreground">Фонд, прогноз и LiveOps в одном месте.</p></div>
            <button type="button" onClick={() => void load(seasonId)} className="grid size-9 place-items-center rounded-xl border border-glass-border"><RefreshCw className="size-4" /></button>
          </div>
          <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="admin-input mt-4 w-full">{seasons.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.state}</option>)}</select>
          {economy && <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5"><Metric label="Спинов" value={String(economy.metrics.completedSpins)} /><Metric label="В день" value={economy.metrics.pacePerDay.toFixed(1)} /><Metric label="Прогноз" value={economy.metrics.projectedSeasonSpins.toFixed(0)} /><Metric label="Осталось" value={`${economy.metrics.remainingDays.toFixed(1)} д.`} /><Metric label="Прогресс" value={`${Math.round(economy.metrics.elapsedFraction * 100)}%`} /></div>}
        </GlassCard>

        {loading && <p className="text-center text-[10px] text-muted-foreground">Загрузка…</p>}
        {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
        {message && <GlassCard className="border-primary/25 bg-primary/5 px-4 py-3 text-[11px]">{message}</GlassCard>}

        <section><div className="mb-2 flex items-center justify-between"><h2 className="section-label">Сценарий</h2><button type="button" onClick={() => setParams(BASE)} className="text-[10px] text-muted-foreground"><RotateCcw className="mr-1 inline size-3" /> Сбросить</button></div>
          <GlassCard className="grid gap-3 px-4 py-4 md:grid-cols-2">{([['Участники','participants'],['Активность, %','activity'],['Дни','days'],['Конверсия, %','paidConversion'],['Платных на покупателя','avgPaid'],['Цена paid spin, ⭐','price'],['Safety multiplier','safety']] as const).map(([label, key]) => <Field key={key} label={label}><input type="number" value={params[key]} onChange={(e) => setParams({ ...params, [key]: Number(e.target.value) || 0 })} className="admin-input w-full" /></Field>)}</GlassCard>
        </section>

        <GlassCard className="px-4 py-4"><h2 className="section-label">Прогноз</h2><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Ожидаемые free" value={expectedFree.toLocaleString('ru-RU')} /><Metric label="Ожидаемые paid" value={expectedPaid.toLocaleString('ru-RU')} /><Metric label="Плановый объём" value={planned.toLocaleString('ru-RU')} /><Metric label="Цена paid spin" value={`${params.price} ⭐`} /></div></GlassCard>

        <GlassCard className="px-4 py-4"><div className="flex items-center justify-between"><h2 className="section-label">Фонд и шансы</h2><span className="text-[9px] text-muted-foreground">по остаткам</span></div><div className="mt-3 space-y-2">{economy?.prizes.filter((p) => p.active).map((p) => <div key={p.id} className="rounded-xl border border-glass-border bg-muted/10 px-3 py-2"><div className="flex justify-between gap-3"><span className="truncate text-xs font-semibold">{p.title}</span><span className="text-xs font-semibold">{(p.currentChance * 100).toLocaleString('ru-RU', { maximumFractionDigits: 4 })}%</span></div><p className="mt-1 text-[9px] text-muted-foreground">Осталось {p.quantityRemaining} из {p.quantityTotal} · вес {p.weight}</p></div>)}</div></GlassCard>

        <GlassCard className="px-4 py-4"><div className="flex items-center justify-between"><h2 className="section-label">Симулятор фонда</h2><span className="text-[9px] text-muted-foreground">dry run</span></div><div className="mt-3 grid grid-cols-2 gap-2"><Field label="Спины"><input type="number" min={1} max={100000} value={simSpins} onChange={(e) => setSimSpins(e.target.value)} className="admin-input w-full" /></Field><Field label="Прогоны"><input type="number" min={1} max={200} value={simTrials} onChange={(e) => setSimTrials(e.target.value)} className="admin-input w-full" /></Field></div><PrimaryButton fullWidth disabled={busy || !seasonId} onClick={() => void simulate()} className="mt-3"><Play className="mr-2 size-4" />{busy ? 'Считаем…' : 'Запустить симуляцию'}</PrimaryButton>{simulation && <div className="mt-3 grid gap-2 md:grid-cols-2"><Metric label="Средний wins" value={simulation.averageCompleted.toFixed(0)} /><Metric label="Средний empty" value={simulation.averageEmpty.toFixed(0)} /><Metric label="Прогонов" value={String(simulation.trials)} /><Metric label="Потреблено фонда" value={simulation.averageInventoryConsumed.toFixed(0)} />{simulation.prizeResults.map((p) => <div key={p.id} className="rounded-xl border border-glass-border px-3 py-2"><div className="flex justify-between text-[10px] font-semibold"><span>{p.title}</span><span>{(p.winRate * 100).toFixed(1)}%</span></div><p className="mt-1 text-[9px] text-muted-foreground">avg выиграно {p.averageWon.toFixed(1)} · остаток {p.averageRemaining.toFixed(1)} · исчерпание {(p.exhaustRate * 100).toFixed(0)}%</p></div>)}</div>}</GlassCard>

        <section><div className="mb-2"><h2 className="section-label">LiveOps-дропы</h2><p className="text-[10px] leading-relaxed text-muted-foreground">Дополнительная партия призов, которая добавляется в фонд по условию или вручную.</p></div>
          <GlassCard className="space-y-3 px-4 py-4"><Field label="Название события"><input value={dropName} onChange={(e) => setDropName(e.target.value)} placeholder="Например: 1000-й спин" className="admin-input w-full" /></Field><Field label="Триггер"><select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="admin-input w-full"><option value="SPIN_COUNT">После N прокруток</option><option value="SEASON_PERCENT">При N% сезона</option><option value="MANUAL">Только вручную</option></select></Field>{triggerType !== 'MANUAL' && <Field label={triggerType === 'SPIN_COUNT' ? 'Количество прокруток' : 'Процент сезона'}><input type="number" min={1} max={triggerType === 'SPIN_COUNT' ? 1000000 : 100} value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} className="admin-input w-full" /></Field>}<div className="rounded-2xl border border-primary/15 bg-primary/5 px-3 py-3"><p className="text-xs font-semibold">Что выдаём</p><div className="mt-2 space-y-2"><select value={dropKind} onChange={(e) => setDropKind(e.target.value)} className="admin-input w-full"><option value="STARS">Stars</option><option value="PREMIUM">Telegram Premium</option><option value="MONEY">Деньги</option><option value="EMPTY">Ничего</option></select><input value={dropTitle} onChange={(e) => setDropTitle(e.target.value)} placeholder="Название награды" className="admin-input w-full" /><div className="grid grid-cols-2 gap-2"><input type="number" min={0} value={dropAmount} onChange={(e) => setDropAmount(e.target.value)} placeholder="Сумма" className="admin-input w-full" /><input type="number" min={1} value={dropQuantity} onChange={(e) => setDropQuantity(e.target.value)} placeholder="Количество" className="admin-input w-full" /></div></div></div><PrimaryButton fullWidth disabled={busy || !seasonId || !dropName.trim()} onClick={() => void createDrop()}><Zap className="mr-2 size-4" /> Запланировать дроп</PrimaryButton></GlassCard>
          <div className="space-y-2">{drops.length === 0 && <p className="text-center text-[10px] text-muted-foreground">Дропов пока нет.</p>}{drops.map((drop) => <GlassCard key={drop.id} className="px-3.5 py-3"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{drop.name}</p><p className="mt-1 text-[9px] font-medium text-primary-glow">{triggerLabel(drop.trigger_type)}</p><p className="mt-1 text-[9px] text-muted-foreground">{drop.trigger_value === null ? 'Запускается вручную' : `Порог: ${drop.trigger_value}`}</p><p className="mt-1 text-[9px] text-muted-foreground">Награда: {drop.payload?.prizes?.map((p) => `${p.title ?? p.kind ?? 'приз'} × ${p.quantityTotal ?? '?'}`).join(', ') ?? 'не указана'}</p><p className="mt-1 text-[9px] text-muted-foreground">Статус: {drop.status === 'SCHEDULED' ? 'Запланирован' : drop.status === 'EXECUTED' ? 'Выполнен' : drop.status === 'CANCELLED' ? 'Отменён' : 'Активен'}</p></div>{drop.status === 'SCHEDULED' && <div className="flex shrink-0 gap-1.5"><button type="button" disabled={busy} onClick={() => void dropAction(drop.id, 'ACTIVATE')} className="grid size-8 place-items-center rounded-lg border border-primary/25 bg-primary/5"><Zap className="size-3" /></button><button type="button" disabled={busy} onClick={() => void dropAction(drop.id, 'CANCEL')} className="grid size-8 place-items-center rounded-lg border border-destructive/20 bg-destructive/5 text-destructive"><X className="size-3" /></button></div>}</div></GlassCard>)}</div>
        </section>

        <PrimaryButton fullWidth disabled={busy || !seasonId} onClick={() => void saveSnapshot()}><Save className="mr-2 size-4" /> Сохранить live snapshot</PrimaryButton>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>{children}</label>;
}
