import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, CalendarDays, Gift, Plus, Save, Settings2, Users, X } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { StatusBadge } from "@/components/kit/StatusBadge";
import type { RewardKind, SeasonState } from "@/lib/types";
import { useSession } from "@/store/session";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [
    { title: "Админ-панель — CRICKET BOX" },
    { name: "description", content: "Управление сезонами, призами и экономикой CRICKET BOX." },
  ] }),
  component: AdminDashboard,
});

type AdminSeason = { id: string; code: string; state: SeasonState; participants: number; spins: number; days: number; paidPrice: number; dailyFree: boolean };
type PrizeDraft = { id: string; kind: RewardKind; title: string; subtitle: string; amount: number; quantity: number };

const STORAGE_KEY = "cricket-box:admin-seasons:v1";
const BASE_PRIZES: PrizeDraft[] = [
  { id: "money", kind: "MONEY", title: "500 грн", subtitle: "Денежный приз", amount: 0, quantity: 1 },
  { id: "premium", kind: "PREMIUM", title: "Telegram Premium", subtitle: "6 месяцев", amount: 0, quantity: 1 },
  { id: "stars100", kind: "STARS", title: "100 Stars", subtitle: "Telegram Stars", amount: 100, quantity: 2 },
  { id: "stars50", kind: "STARS", title: "50 Stars", subtitle: "Telegram Stars", amount: 50, quantity: 5 },
  { id: "stars20", kind: "STARS", title: "20 Stars", subtitle: "Telegram Stars", amount: 20, quantity: 11 },
];

function getInitialSeasons(snapshot: ReturnType<typeof useSession>["snapshot"]): AdminSeason[] {
  if (typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as AdminSeason[];
    } catch { /* ignore malformed local mock data */ }
  }
  return snapshot ? [{ id: snapshot.season.id, code: snapshot.season.code, state: snapshot.season.state, participants: 1, spins: snapshot.spin.totalSpins, days: 14, paidPrice: 100, dailyFree: true }] : [];
}

function AdminDashboard() {
  const { snapshot } = useSession();
  const [seasons, setSeasons] = useState<AdminSeason[]>(() => getInitialSeasons(snapshot));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("CRICKET BOX #002");
  const [days, setDays] = useState(14);
  const [paidPrice, setPaidPrice] = useState(100);
  const [dailyFree, setDailyFree] = useState(true);
  const [prizes, setPrizes] = useState<PrizeDraft[]>(BASE_PRIZES.map((x) => ({ ...x })));

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seasons));
  }, [seasons]);

  const current = seasons.find((season) => season.id === selectedId) ?? seasons.find((season) => season.state === "ACTIVE") ?? seasons[0];
  const stats = useMemo(() => {
    const winning = prizes.reduce((sum, prize) => sum + Math.max(0, prize.quantity), 0);
    const stars = prizes.filter((p) => p.kind === "STARS").reduce((sum, p) => sum + p.amount * p.quantity, 0);
    return { winning, stars, planningCapacity: 2000 };
  }, [prizes]);

  function createSeason() {
    const cleanName = name.trim() || `CRICKET BOX #${String(seasons.length + 1).padStart(3, "0")}`;
    const season: AdminSeason = { id: `draft_${Date.now()}`, code: cleanName, state: "DRAFT", participants: 0, spins: 0, days: Math.max(1, days), paidPrice: Math.max(1, paidPrice), dailyFree };
    setSeasons((all) => [season, ...all]);
    setSelectedId(season.id);
    setNewOpen(false);
  }

  function updateCurrent(patch: Partial<AdminSeason>) {
    if (!current) return;
    setSeasons((all) => all.map((season) => season.id === current.id ? { ...season, ...patch } : season));
  }

  function changeQuantity(id: string, delta: number) {
    setPrizes((all) => all.map((prize) => prize.id === id ? { ...prize, quantity: Math.max(0, prize.quantity + delta) } : prize));
  }

  function addPrize() {
    setPrizes((all) => [...all, { id: `custom_${Date.now()}`, kind: "STARS", title: "Новая награда", subtitle: "Настроить", amount: 10, quantity: 1 }]);
  }

  return (
    <AppShell title="Админ-панель" nav={false}>
      <div className="space-y-5 pb-8">
        <GlassCard className="border-primary/25 px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Управление сезонами</p><h1 className="mt-1 font-display text-xl uppercase">{current?.code ?? "Нет сезона"}</h1></div>
            {current && <StatusBadge status={{ type: "season", value: current.state }} />}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Участники" value={String(current?.participants ?? 0)} /><Metric label="Прокрутки" value={String(current?.spins ?? 0)} /><Metric label="Награды" value={String(stats.winning)} /></div>
        </GlassCard>

        <div className="grid grid-cols-2 gap-2.5">
          <ActionCard icon={Plus} title="Создать сезон" text="Новый черновик" onClick={() => setNewOpen(true)} />
          <Link to="/admin/economics" className="block"><ActionCard icon={BarChart3} title="Экономика" text="Прогноз и маржа" /></Link>
          <ActionCard icon={Gift} title="Prize Pool" text={`${stats.winning} выигрышных исходов`} />
          <ActionCard icon={Users} title="Участники" text="Следующий модуль" />
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="section-label">Сезоны</h2><button type="button" onClick={() => setNewOpen(true)} className="text-[11px] text-primary-glow">+ Создать</button></div>
          <GlassCard className="divide-y divide-glass-border overflow-hidden">
            {seasons.length === 0 && <div className="px-4 py-6 text-center text-xs text-muted-foreground">Сезонов пока нет.</div>}
            {seasons.map((season) => (
              <button type="button" key={season.id} onClick={() => setSelectedId(season.id)} className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${current?.id === season.id ? "bg-primary/8" : ""}`}>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{season.code}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{season.days} дней · {season.paidPrice} ⭐ · daily {season.dailyFree ? "ON" : "OFF"}</p></div>
                <StatusBadge status={{ type: "season", value: season.state }} /><ArrowRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </GlassCard>
        </section>

        {current && <>
          <section>
            <div className="mb-2 flex items-center justify-between"><h2 className="section-label">Настройки сезона</h2><span className="text-[10px] text-muted-foreground">{current.state}</span></div>
            <GlassCard className="space-y-3 px-4 py-4">
              <Row label="Название"><input value={current.code} onChange={(e) => updateCurrent({ code: e.target.value })} className="admin-input" /></Row>
              <div className="grid grid-cols-2 gap-2"><Row label="Длительность"><input type="number" min={1} value={current.days} onChange={(e) => updateCurrent({ days: Number(e.target.value) || 1 })} className="admin-input" /></Row><Row label="Paid spin"><input type="number" min={1} value={current.paidPrice} onChange={(e) => updateCurrent({ paidPrice: Number(e.target.value) || 1 })} className="admin-input" /></Row></div>
              <label className="flex items-center justify-between rounded-xl border border-glass-border bg-muted/20 px-3 py-3"><span><span className="block text-sm font-semibold">1 бесплатная попытка в день</span><span className="text-[11px] text-muted-foreground">Без накопления</span></span><input type="checkbox" checked={current.dailyFree} onChange={(e) => updateCurrent({ dailyFree: e.target.checked })} /></label>
              <PrimaryButton fullWidth variant="outline" onClick={() => alert("Черновик сохранён локально для предпросмотра.")}><Save className="size-4" /> Сохранить настройки</PrimaryButton>
            </GlassCard>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between"><h2 className="section-label">Призовой фонд</h2><button type="button" onClick={addPrize} className="inline-flex items-center gap-1 text-[10px] text-primary-glow"><Plus className="size-3" /> Добавить</button></div>
            <GlassCard className="space-y-2.5 px-3 py-3">
              {prizes.map((prize) => (
                <div key={prize.id} className="rounded-2xl border border-glass-border bg-muted/15 px-3 py-3">
                  <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{prize.title}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{prize.kind} · {prize.subtitle}</p></div><div className="flex items-center gap-1 rounded-xl border border-glass-border bg-muted/20 p-1"><button type="button" onClick={() => changeQuantity(prize.id, -1)} className="grid size-7 place-items-center rounded-lg"><X className="size-3" /></button><span className="w-8 text-center font-display text-sm">{prize.quantity}</span><button type="button" onClick={() => changeQuantity(prize.id, 1)} className="grid size-7 place-items-center rounded-lg"><Plus className="size-3" /></button></div></div>
                  {prize.kind === "STARS" && <div className="mt-2"><label className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Stars за единицу</label><input type="number" min={1} value={prize.amount} onChange={(e) => setPrizes((all) => all.map((p) => p.id === prize.id ? { ...p, amount: Math.max(1, Number(e.target.value) || 1), title: `${Math.max(1, Number(e.target.value) || 1)} Stars` } : p))} className="admin-input mt-1" /></div>}
                </div>
              ))}
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-3 text-[11px] text-muted-foreground"><p><strong className="text-foreground">{stats.winning}</strong> выигрышных исходов · Stars liability <strong className="text-foreground">{stats.stars} ⭐</strong> · planning capacity <strong className="text-foreground">{stats.planningCapacity}</strong></p><p className="mt-1">Пустые исходы добавляются отдельно при расчёте общей ёмкости сезона.</p></div>
            </GlassCard>
          </section>

          <section className="grid grid-cols-2 gap-2.5">
            <GlassCard className="px-3 py-3"><CalendarDays className="size-4 text-primary-glow" /><p className="mt-2 text-sm font-semibold">Этап</p><p className="mt-0.5 text-[10px] text-muted-foreground">{stateAction(current.state)}</p></GlassCard>
            <GlassCard className="px-3 py-3"><Settings2 className="size-4 text-primary-glow" /><p className="mt-2 text-sm font-semibold">Stars cap</p><p className="mt-0.5 text-[10px] text-muted-foreground">500 ⭐ по умолчанию</p></GlassCard>
          </section>
        </>}
      </div>

      {newOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"><GlassCard className="w-full max-w-lg px-4 py-4"><div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Новый сезон</p><h2 className="font-display text-base uppercase">Создать черновик</h2></div><button type="button" onClick={() => setNewOpen(false)} aria-label="Закрыть"><X className="size-5" /></button></div><div className="mt-4 space-y-3"><Row label="Название"><input value={name} onChange={(e) => setName(e.target.value)} className="admin-input" /></Row><div className="grid grid-cols-2 gap-2"><Row label="Дней"><input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} className="admin-input" /></Row><Row label="Paid spin, ⭐"><input type="number" min={1} value={paidPrice} onChange={(e) => setPaidPrice(Number(e.target.value) || 1)} className="admin-input" /></Row></div><label className="flex items-center justify-between rounded-xl border border-glass-border bg-muted/20 px-3 py-3"><span><span className="block text-sm font-semibold">Daily free spin</span><span className="text-[11px] text-muted-foreground">1 попытка в день без накопления</span></span><input type="checkbox" checked={dailyFree} onChange={(e) => setDailyFree(e.target.checked)} /></label><PrimaryButton fullWidth onClick={createSeason}>Создать сезон</PrimaryButton></div></GlassCard></div>}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>; }
function ActionCard({ icon: Icon, title, text, onClick }: { icon: ComponentType<{ className?: string }>; title: string; text: string; onClick?: () => void }) { const inner = <GlassCard className="h-full px-3 py-3.5"><Icon className="size-4 text-primary-glow" /><p className="mt-2 text-sm font-semibold">{title}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{text}</p></GlassCard>; return onClick ? <button type="button" onClick={onClick} className="block h-full w-full text-left">{inner}</button> : inner; }
function Row({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>{children}</label>; }
function stateAction(state: SeasonState) { switch (state) { case "DRAFT": return "Настройте и сохраните"; case "SCHEDULED": return "Ожидает старта"; case "ACTIVE": return "Идёт сейчас"; case "ENDING": return "Завершается"; case "CLOSED": return "Остановлен"; case "PAYOUT": return "Выдача призов"; default: return "В архиве"; } }
