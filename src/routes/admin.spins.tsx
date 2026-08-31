import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Search, SlidersHorizontal, RotateCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/spins")({
  head: () => ({ meta: [{ title: "Прокрутки — CRICKET BOX" }] }),
  component: AdminSpins,
});

type Spin = { id: string; time: string; username: string; telegramId: string; type: string; price: number; result: string; status: string };
type Api = { ok: boolean; spins?: Spin[]; code?: string };

function initData() {
  if (typeof window === "undefined") return "";
  const tg = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return tg?.WebApp?.initData?.trim() ?? "";
}

async function loadSpins(search: string, filter: string) {
  const response = await fetch(`/api/admin/spins?initData=${encodeURIComponent(initData())}&search=${encodeURIComponent(search)}&type=${encodeURIComponent(filter === "Бесплатная" ? "FREE" : filter === "Платная" ? "PAID" : "")}&limit=200`);
  const data = (await response.json()) as Api;
  if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
  return data.spins ?? [];
}

function AdminSpins() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"Все" | "Бесплатная" | "Платная">("Все");
  const [rows, setRows] = useState<Spin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true); setError("");
    try { setRows(await loadSpins(query, filter)); }
    catch { setError("Не удалось загрузить прокрутки из PostgreSQL."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [filter]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const stats = useMemo(() => ({
    total: rows.length,
    paid: rows.filter((x) => x.type === "Платная").length,
    successful: rows.filter((x) => x.status === "Успешно").length,
  }), [rows]);

  return (
    <AppShell title="Прокрутки" nav={false}>
      <div className="space-y-4 pb-8">
        <div className="flex items-center justify-between gap-3"><Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link><button onClick={() => void refresh()} className="text-[10px] text-primary-glow">Обновить</button></div>
        <GlassCard className="px-4 py-4" glow><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Журнал операций</p><h1 className="mt-1 font-display text-xl uppercase">Все прокрутки</h1></div><div className="rounded-xl border border-glass-border bg-muted/20 p-2"><RotateCw className="size-4 text-primary-glow" /></div></div><div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Всего" value={String(stats.total)} /><Metric label="Платных" value={String(stats.paid)} /><Metric label="Успешных" value={String(stats.successful)} /></div></GlassCard>
        <GlassCard className="space-y-3 px-3 py-3"><div className="flex items-center gap-2 rounded-xl border border-glass-border bg-muted/20 px-3 py-2.5"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пользователь, ID, результат или ID прокрутки" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></div><div className="flex items-center gap-2 overflow-x-auto pb-1">{(["Все", "Бесплатная", "Платная"] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${filter === item ? "border-primary/40 bg-primary/10" : "border-glass-border bg-muted/10 text-muted-foreground"}`}><SlidersHorizontal className="mr-1 inline size-3" />{item}</button>)}</div></GlassCard>
        {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
        <GlassCard className="overflow-hidden px-0 py-0"><div className="hidden grid-cols-[1fr_1.1fr_.8fr_1.2fr_.7fr] gap-3 border-b border-glass-border px-4 py-3 text-[9px] uppercase tracking-[0.15em] text-muted-foreground md:grid"><span>Прокрутка</span><span>Пользователь</span><span>Тип</span><span>Результат</span><span>Цена</span></div><div className="divide-y divide-glass-border">{loading ? <div className="px-4 py-8 text-center text-xs text-muted-foreground">Загрузка…</div> : rows.map((spin) => <div key={spin.id} className="px-4 py-3.5"><div className="grid gap-2 md:grid-cols-[1fr_1.1fr_.8fr_1.2fr_.7fr] md:items-center md:gap-3"><div><p className="font-mono text-[11px] font-semibold">{spin.id}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{spin.time}</p></div><div><p className="text-sm font-semibold">{spin.username}</p><p className="text-[9px] text-muted-foreground">ID {spin.telegramId}</p></div><div><span className="rounded-full border border-glass-border px-2 py-1 text-[9px]">{spin.type}</span></div><div><p className={`text-sm font-semibold ${spin.status === "Пусто" ? "text-muted-foreground" : ""}`}>{spin.result}</p><p className="text-[9px] text-muted-foreground">{spin.status}</p></div><div><p className="text-sm font-semibold">{spin.price ? `${spin.price} ⭐` : "Бесплатно"}</p></div></div></div>)}{!loading && rows.length === 0 && <div className="px-4 py-8 text-center text-xs text-muted-foreground">Прокруток пока нет.</div>}</div></GlassCard>
        <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">Журнал подключён к PostgreSQL: здесь показываются реальные пользователи, типы прокруток, призы и статусы из таблицы spins.</GlassCard>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>; }
