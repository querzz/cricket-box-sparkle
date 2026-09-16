import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Crown, FileText, Gift, LineChart, Plus, Radio, RefreshCw, RotateCw, Save, Settings2, ShieldCheck, Sparkles, Users, WalletCards, X } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { StatusBadge } from "@/components/kit/StatusBadge";
import type { SeasonState } from "@/lib/types";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Админ-панель — CRICKET BOX" }, { name: "description", content: "Управление сезонами, призами и экономикой CRICKET BOX." }] }),
  component: AdminDashboard,
});

type AdminSeason = { id: string; code: string; name: string; state: SeasonState; participants: number; spins: number; wins: number; days: number; paidPrice: number; dailyFree: boolean; startsAt: string | null; endsAt: string | null };
type DbSeason = { id: string; code: string; name: string; state: SeasonState; starts_at: string | null; ends_at: string | null; paid_spin_price: number; daily_free_spin: boolean };
type DbPrize = { id: string; season_id: string; kind: string; amount: string | number; unit_cost: string | number; subtitle: string | null; quantity_total: number; quantity_remaining: number; metadata?: Record<string, unknown> | null };
type StatsResponse = { ok: boolean; code?: string; metrics?: { participants: number; spins: number; wins: number } };
type PrizeDraft = { id: string; dbId?: string; kind: "MONEY" | "PREMIUM" | "STARS" | "EMPTY"; title: string; subtitle: string; amount: number; quantity: number; unitCost: number; quantityTotal?: number };
type Api<T> = { ok: boolean; seasons?: T; prizes?: T; season?: T; code?: string };

const DEFAULT_EMPTY_QUANTITY = 2000;
const BASE_PRIZES: PrizeDraft[] = [
  { id: "money", kind: "MONEY", title: "500 грн", subtitle: "Денежный приз", amount: 500, quantity: 0, unitCost: 500 },
  { id: "premium-3m", kind: "PREMIUM", title: "Telegram Premium", subtitle: "3 месяца", amount: 3, quantity: 0, unitCost: 14 },
  { id: "premium-6m", kind: "PREMIUM", title: "Telegram Premium", subtitle: "6 месяцев", amount: 6, quantity: 0, unitCost: 18 },
  { id: "premium-12m", kind: "PREMIUM", title: "Telegram Premium", subtitle: "12 месяцев", amount: 12, quantity: 0, unitCost: 30 },
  { id: "stars100", kind: "STARS", title: "100 Stars", subtitle: "Telegram Stars", amount: 100, quantity: 0, unitCost: 0 },
  { id: "stars50", kind: "STARS", title: "50 Stars", subtitle: "Telegram Stars", amount: 50, quantity: 0, unitCost: 0 },
  { id: "stars20", kind: "STARS", title: "20 Stars", subtitle: "Telegram Stars", amount: 20, quantity: 0, unitCost: 0 },
  { id: "empty", kind: "EMPTY", title: "Ничего", subtitle: "Пустой исход", amount: 0, quantity: DEFAULT_EMPTY_QUANTITY, unitCost: 0 },
];

function initData() {
  if (typeof window === "undefined") return "";
  return (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim() ?? "";
}

async function api<T>(url: string, method: "GET" | "POST" | "PATCH", body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify({ ...body, initData: initData() }) } : {}) });
  const data = (await response.json()) as Api<T>;
  if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
  return data;
}

function mapSeason(season: DbSeason, stats?: { participants: number; spins: number; wins: number }): AdminSeason {
  return {
    id: season.id,
    code: season.code,
    name: season.name,
    state: season.state,
    participants: stats?.participants ?? 0,
    spins: stats?.spins ?? 0,
    wins: stats?.wins ?? 0,
    days: season.starts_at && season.ends_at ? Math.max(1, Math.round((new Date(season.ends_at).getTime() - new Date(season.starts_at).getTime()) / 86400000)) : 14,
    paidPrice: Number(season.paid_spin_price ?? 100),
    dailyFree: season.daily_free_spin,
    startsAt: season.starts_at,
    endsAt: season.ends_at,
  };
}

function AdminDashboard() {
  const [seasons, setSeasons] = useState<AdminSeason[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [prizesLoading, setPrizesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPrizes, setSavingPrizes] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("CRICKET BOX #002");
  const [days, setDays] = useState(14);
  const [paidPrice, setPaidPrice] = useState(100);
  const [dailyFree, setDailyFree] = useState(true);
  const [stats, setStats] = useState({ participants: 0, spins: 0, wins: 0 });
  const [prizes, setPrizes] = useState<PrizeDraft[]>(BASE_PRIZES.map((p) => ({ ...p })));

  const current = seasons.find((season) => season.id === selectedId) ?? seasons.find((season) => season.state === "ACTIVE") ?? seasons[0];
  const visibleSeasons = useMemo(() => {
    const primary = seasons.filter((s) => s.state === "ACTIVE" || s.state === "ENDING" || s.state === "SCHEDULED");
    const drafts = seasons.filter((s) => s.state === "DRAFT").slice(0, archiveOpen ? 20 : 2);
    const history = seasons.filter((s) => s.state === "CLOSED" || s.state === "PAYOUT" || s.state === "ARCHIVED").slice(0, archiveOpen ? 20 : 6);
    return [...primary, ...drafts, ...history];
  }, [seasons, archiveOpen]);

  const poolStats = useMemo(() => {
    const winning = prizes.reduce((sum, prize) => sum + (prize.kind === "EMPTY" ? 0 : Math.max(0, prize.quantity)), 0);
    const empty = prizes.reduce((sum, prize) => sum + (prize.kind === "EMPTY" ? Math.max(0, prize.quantity) : 0), 0);
    const stars = prizes.reduce((sum, prize) => sum + (prize.kind === "STARS" ? prize.amount * prize.quantity : 0), 0);
    const premium = prizes.reduce((sum, prize) => sum + (prize.kind === "PREMIUM" ? Math.max(0, prize.quantity) : 0), 0);
    return { winning, empty, stars, premium };
  }, [prizes]);

  async function loadSeasons() {
    setLoading(true); setError("");
    try {
      const data = await api<DbSeason[]>(`/api/admin/seasons?initData=${encodeURIComponent(initData())}`, "GET");
      const mapped = (data.seasons ?? []).map((season) => mapSeason(season));
      setSeasons(mapped);
      setSelectedId((id) => id && mapped.some((s) => s.id === id) ? id : mapped.find((s) => s.state === "ACTIVE")?.id ?? mapped[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error && e.message === "AUTH_FAILED" ? "Не удалось подтвердить доступ администратора." : "Не удалось загрузить сезоны из PostgreSQL.");
    } finally { setLoading(false); }
  }

  async function loadStats() {
    setStatsLoading(true);
    try {
      const data = await fetch(`/api/admin/statistics?scope=current&initData=${encodeURIComponent(initData())}`);
      const parsed = await data.json() as StatsResponse;
      if (data.ok && parsed.ok && parsed.metrics) setStats({ participants: Number(parsed.metrics.participants ?? 0), spins: Number(parsed.metrics.spins ?? 0), wins: Number(parsed.metrics.wins ?? 0) });
    } finally { setStatsLoading(false); }
  }

  async function loadPrizes(seasonId: string) {
    if (!seasonId) return;
    setPrizesLoading(true);
    try {
      const data = await api<DbPrize[]>(`/api/admin/prizes?seasonId=${encodeURIComponent(seasonId)}&initData=${encodeURIComponent(initData())}`, "GET");
      const dbPrizes = data.prizes ?? [];
      setPrizes(BASE_PRIZES.map((draft) => {
        const match = dbPrizes.find((prize) => (typeof prize.metadata?.catalogKey === "string" ? prize.metadata.catalogKey : "") === draft.id || (prize.kind === draft.kind && Number(prize.amount) === draft.amount && (draft.kind !== "PREMIUM" || (prize.subtitle ?? "") === draft.subtitle)));
        return { ...draft, dbId: match?.id, quantity: match ? Math.max(0, Number(match.quantity_remaining) || 0) : draft.kind === "EMPTY" ? DEFAULT_EMPTY_QUANTITY : 0, quantityTotal: match ? Math.max(0, Number(match.quantity_total) || 0) : draft.kind === "EMPTY" ? DEFAULT_EMPTY_QUANTITY : 0 };
      }));
    } catch { setError("Не удалось загрузить призовой фонд из PostgreSQL."); }
    finally { setPrizesLoading(false); }
  }

  useEffect(() => { void loadSeasons(); void loadStats(); }, []);
  useEffect(() => { if (current?.id) void loadPrizes(current.id); }, [current?.id]);

  async function createSeason() {
    setSaving(true); setError("");
    try {
      const cleanName = name.trim() || `CRICKET BOX #${String(seasons.length + 1).padStart(3, "0")}`;
      await api("/api/admin/seasons", "POST", { code: cleanName, name: cleanName, paidSpinPrice: Math.max(1, paidPrice), dailyFreeSpin: dailyFree });
      setNewOpen(false); setMessage("Сезон создан в PostgreSQL."); await loadSeasons();
    } catch (e) { setError(e instanceof Error ? `Не удалось создать сезон: ${e.message}` : "Не удалось создать сезон."); }
    finally { setSaving(false); }
  }

  async function saveCurrent() {
    if (!current) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const isStarted = current.state === "ACTIVE" || current.state === "ENDING";
      const endsAt = isStarted ? current.endsAt ?? undefined : new Date(Date.now() + Math.max(1, current.days) * 86400000).toISOString();
      const updated = await api<DbSeason>("/api/admin/seasons", "PATCH", { id: current.id, code: current.code.trim(), name: current.code.trim(), state: current.state, paidSpinPrice: Math.max(1, current.paidPrice), dailyFreeSpin: current.dailyFree, startsAt: isStarted ? undefined : current.startsAt ?? new Date().toISOString(), endsAt });
      const next = mapSeason(updated.season!);
      setSeasons((all) => all.map((season) => season.id === next.id ? { ...season, ...next, participants: season.participants, spins: season.spins, wins: season.wins } : season));
      setMessage("Настройки сезона сохранены.");
    } catch (e) { setError(e instanceof Error ? `Не удалось сохранить: ${e.message}` : "Не удалось сохранить настройки."); }
    finally { setSaving(false); }
  }

  async function savePrizeQuick() {
    if (!current) return;
    setSavingPrizes(true); setError("");
    try {
      for (const prize of prizes) {
        if (!prize.dbId && prize.quantity <= 0) continue;
        await api("/api/admin/prizes", "POST", { id: prize.dbId, seasonId: current.id, kind: prize.kind, title: prize.title, subtitle: prize.subtitle, amount: prize.amount, unitCost: prize.unitCost, currency: prize.kind === "MONEY" ? "UAH" : null, quantityTotal: Math.max(prize.quantity, prize.quantityTotal ?? 0), quantityRemaining: prize.quantity, metadata: { catalogKey: prize.id } });
      }
      await loadPrizes(current.id); setMessage(`Призовой фонд ${current.code} сохранён.`);
    } catch (e) { setError(e instanceof Error ? `Не удалось сохранить призовой фонд: ${e.message}` : "Не удалось сохранить призовой фонд."); }
    finally { setSavingPrizes(false); }
  }

  return <AppShell title="Админ-панель" nav={false}><div className="space-y-5 pb-8">
    <GlassCard className="admin-hero border-primary/25 px-4 py-4" glow>
      <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Панель управления</p><h1 className="mt-1 font-display text-xl uppercase">{current?.code ?? "Нет сезона"}</h1><div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[10px] font-semibold"><span className="size-1.5 rounded-full bg-success" />{current ? stateLabel(current.state) : "Ожидание"}</div></div><button type="button" onClick={() => { void loadSeasons(); void loadStats(); }} className="admin-icon-button" aria-label="Обновить"><RefreshCw className="size-4" /></button></div>
      <div className="mt-4 grid grid-cols-3 gap-2"><Metric icon={Users} label="Участники" value={statsLoading ? "…" : String(stats.participants)} /><Metric icon={RotateCw} label="Прокрутки" value={statsLoading ? "…" : String(stats.spins)} /><Metric icon={Gift} label="Награды" value={statsLoading ? "…" : String(stats.wins)} /></div>
    </GlassCard>
    {message && <GlassCard className="admin-alert admin-alert-success px-4 py-3 text-[11px]">{message}</GlassCard>}{error && <GlassCard className="admin-alert admin-alert-error px-4 py-3 text-[11px]">{error}</GlassCard>}

    <section><div className="mb-2"><h2 className="section-label">Быстрые разделы</h2><p className="text-[10px] text-muted-foreground">Управление без лишних переходов.</p></div><div className="grid grid-cols-2 gap-2.5"><ActionCard icon={Plus} title="Создать сезон" text="Новый сезон" onClick={() => setNewOpen(true)} /><ActionLink icon={Gift} title="Призовой фонд" text={`${poolStats.winning} выигрышных исходов`} href="/admin/prizes" primary /><ActionLink icon={WalletCards} title="Выплаты" text="Выдача и статусы наград" href="/admin/payouts" /><ActionLink icon={Users} title="Участники" text="Поиск и история" href="/admin/participants" /><ActionLink icon={RotateCw} title="Прокрутки" text="Журнал попыток" href="/admin/spins" /><ActionLink icon={LineChart} title="Статистика" text="Показатели сезонов" href="/admin/statistics" /><ActionLink icon={BarChart3} title="Экономика" text="Прогноз и маржа" href="/admin/economics" /><ActionLink icon={FileText} title="Журнал действий" text="История изменений" href="/admin/audit" /></div></section>
    <section><div className="mb-2"><h2 className="section-label">Служебные разделы</h2><p className="text-[10px] text-muted-foreground">Доступ и специальные механики.</p></div><div className="grid grid-cols-2 gap-2.5"><ActionLink icon={ShieldCheck} title="Доступ к админке" text="Владельцы и администраторы" href="/admin/access" /><ActionLink icon={Radio} title="Активность канала" text="Подписчики и бонусы" href="/admin/channel-activity" /><ActionLink icon={Crown} title="Бонусы ветеранов" text="Преимущества прошлых сезонов" href="/admin/veteran" /><ActionLink icon={Sparkles} title="Развлекательные механики" text="Подарки и мини-игры" href="/admin/mechanics" /><ActionLink icon={Settings2} title="Личные подарки" text="Особые подарки владельца" href="/admin/owner-gifts" /></div></section>

    <section><div className="mb-2 flex items-center justify-between"><h2 className="section-label">Сезоны</h2><button type="button" onClick={() => setArchiveOpen((v) => !v)} className="admin-link">{archiveOpen ? "Свернуть архив" : "Показать архив"}</button></div><GlassCard className="admin-list divide-y divide-glass-border overflow-hidden">{loading ? <div className="px-4 py-6 text-center text-xs text-muted-foreground">Загрузка из PostgreSQL…</div> : visibleSeasons.length === 0 ? <div className="px-4 py-6 text-center text-xs text-muted-foreground">Сезонов пока нет.</div> : visibleSeasons.map((season) => <button type="button" key={season.id} onClick={() => setSelectedId(season.id)} className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${current?.id === season.id ? "bg-primary/8" : "hover:bg-muted/10"}`}><div className="grid size-9 shrink-0 place-items-center rounded-xl border border-glass-border bg-muted/15 font-display text-[10px]">{season.code.replace("CRICKET BOX #", "")}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{season.code}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{season.days} дней · {season.paidPrice} ⭐ · бесплатная: {season.dailyFree ? "вкл." : "выкл."}</p></div><StatusBadge status={{ type: "season", value: season.state }} /><ArrowRight className="size-4 text-muted-foreground" /></button>)}</GlassCard></section>

    {current && <><section><div className="mb-2 flex items-center justify-between"><div><h2 className="section-label">Основные настройки</h2><p className="text-[10px] text-muted-foreground">Основные параметры выбранного сезона.</p></div><span className="admin-state-pill">{stateLabel(current.state)}</span></div><GlassCard className="space-y-3 px-4 py-4"><Row label="Название"><input value={current.code} onChange={(e) => setSeasons((all) => all.map((s) => s.id === current.id ? { ...s, code: e.target.value } : s))} className="admin-input" /></Row><div className="grid grid-cols-2 gap-2"><Row label="Длительность"><input type="number" min={1} disabled={current.state === "ACTIVE" || current.state === "ENDING"} value={current.days} onChange={(e) => setSeasons((all) => all.map((s) => s.id === current.id ? { ...s, days: Math.max(1, Number(e.target.value) || 1) } : s))} className="admin-input" /></Row><Row label="Цена доп. прокрутки"><div className="relative"><input type="number" min={1} value={current.paidPrice} onChange={(e) => setSeasons((all) => all.map((s) => s.id === current.id ? { ...s, paidPrice: Math.max(1, Number(e.target.value) || 1) } : s))} className="admin-input pr-10" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gold">⭐</span></div></Row></div><Row label="Состояние"><select value={current.state} onChange={(e) => setSeasons((all) => all.map((s) => s.id === current.id ? { ...s, state: e.target.value as SeasonState } : s))} className="admin-input"><option value="DRAFT">Черновик</option><option value="SCHEDULED">Скоро старт</option><option value="ACTIVE">Активен</option><option value="ENDING">Скоро конец</option><option value="CLOSED">Завершён</option><option value="PAYOUT">Выплаты</option><option value="ARCHIVED">Архив</option></select></Row><label className="admin-toggle"><span><span className="block text-sm font-semibold">1 бесплатная попытка в день</span><span className="text-[10px] text-muted-foreground">Без накопления</span></span><input type="checkbox" checked={current.dailyFree} onChange={(e) => setSeasons((all) => all.map((s) => s.id === current.id ? { ...s, dailyFree: e.target.checked } : s))} /></label><PrimaryButton fullWidth variant="outline" disabled={saving} onClick={() => void saveCurrent()}><Save className="size-4" />{saving ? "Сохраняем…" : "Сохранить настройки"}</PrimaryButton></GlassCard></section>
      <section><div className="mb-2 flex items-center justify-between"><div><h2 className="section-label">Призовой фонд</h2><p className="text-[10px] text-muted-foreground">Данные из реального инвентаря PostgreSQL.</p></div><Link to="/admin/prizes" className="admin-link">Открыть →</Link></div><GlassCard className="space-y-2.5 px-3 py-3"><div className="grid grid-cols-3 gap-2"><PoolMetric label="Награды" value={String(poolStats.winning)} /><PoolMetric label="EMPTY" value={String(poolStats.empty)} /><PoolMetric label="Stars" value={`${poolStats.stars} ⭐`} /></div><div className="flex items-center justify-between rounded-2xl border border-glass-border bg-muted/10 px-3 py-2.5 text-[10px]"><span className="text-muted-foreground">Premium</span><strong>{poolStats.premium} шт.</strong></div><PrimaryButton fullWidth variant="outline" disabled={savingPrizes || prizesLoading} onClick={() => void savePrizeQuick()}><Save className="size-4" />{savingPrizes ? "Сохраняем…" : "Сохранить быстрые изменения"}</PrimaryButton></GlassCard></section></>}
  </div>

    {newOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"><GlassCard className="w-full max-w-lg px-4 py-4"><div className="flex items-center justify-between"><div><p className="eyebrow">Новый сезон</p><h2 className="font-display text-base uppercase">Создать сезон</h2></div><button type="button" onClick={() => setNewOpen(false)} aria-label="Закрыть"><X className="size-5" /></button></div><div className="mt-4 space-y-3"><Row label="Название"><input value={name} onChange={(e) => setName(e.target.value)} className="admin-input" /></Row><div className="grid grid-cols-2 gap-2"><Row label="Дней"><input type="number" min={1} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} className="admin-input" /><span className="mt-1 block text-[9px] text-muted-foreground">Длительность используется при сохранении.</span></Row><Row label="Платная прокрутка, ⭐"><input type="number" min={1} value={paidPrice} onChange={(e) => setPaidPrice(Math.max(1, Number(e.target.value) || 1))} className="admin-input" /></Row></div><label className="admin-toggle"><span><span className="block text-sm font-semibold">Ежедневная бесплатная попытка</span><span className="text-[10px] text-muted-foreground">1 попытка в день без накопления</span></span><input type="checkbox" checked={dailyFree} onChange={(e) => setDailyFree(e.target.checked)} /></label><PrimaryButton fullWidth disabled={saving} onClick={() => void createSeason()}>{saving ? "Создаём…" : "Создать сезон"}</PrimaryButton></div></GlassCard></div>}
  </AppShell>;
}

function stateLabel(state: SeasonState) { return ({ DRAFT: "Черновик", SCHEDULED: "Скоро старт", ACTIVE: "Активен", ENDING: "Скоро конец", CLOSED: "Завершён", PAYOUT: "Выплаты", ARCHIVED: "Архив" } as Record<SeasonState, string>)[state]; }
function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: ComponentType<{ className?: string }> }) { return <div className="admin-metric"><span className="grid size-7 place-items-center rounded-xl border border-glass-border bg-muted/10"><Icon className="size-3.5 text-primary-glow" /></span><div><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-0.5 font-display text-base">{value}</p></div></div>; }
function PoolMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/10 px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
function ActionLink({ icon: Icon, title, text, href, primary = false }: { icon: ComponentType<{ className?: string }>; title: string; text: string; href: string; primary?: boolean }) { return <Link to={href as never} aria-label={title} className="press block h-full w-full text-left"><GlassCard className={`admin-action h-full px-3 py-3.5 ${primary ? "admin-action-primary" : ""}`}><span className="admin-action-icon"><Icon className="size-4 text-primary-glow" /></span><p className="mt-2 text-sm font-semibold">{title}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{text}</p></GlassCard></Link>; }
function ActionCard({ icon: Icon, title, text, onClick }: { icon: ComponentType<{ className?: string }>; title: string; text: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="press block h-full w-full text-left"><GlassCard className="admin-action h-full px-3 py-3.5"><span className="admin-action-icon"><Icon className="size-4 text-primary-glow" /></span><p className="mt-2 text-sm font-semibold">{title}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{text}</p></GlassCard></button>; }
function Row({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>{children}</label>; }
