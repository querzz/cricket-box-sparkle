import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Clock3, FileText, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({ meta: [{ title: "Журнал действий — CRICKET BOX" }] }),
  component: AdminAudit,
});

type Item = {
  id: string;
  created_at: string;
  actor: string | null;
  role: "OWNER" | "ADMIN" | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};
type Api = { ok: boolean; items?: Item[]; counts?: { total: number; adminEvents: number; systemEvents: number }; code?: string };

function initData() {
  if (typeof window === "undefined") return "";
  const tg = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return tg?.WebApp?.initData?.trim() ?? "";
}
function labelAction(action: string) {
  const map: Record<string, string> = {
    SPIN_COMPLETED: "Прокрутка завершена",
    PAYOUT_STATUS_CHANGED: "Изменён статус выплаты",
    DAILY_GIFT_CLAIMED: "Получен ежедневный подарок",
    SEASON_CREATED: "Создан сезон",
    SEASON_UPDATED: "Изменён сезон",
    PRIZE_UPDATED: "Изменён приз",
  };
  return map[action] ?? action;
}
function entityLabel(type: string) {
  const map: Record<string, string> = { spin: "Прокрутка", payout: "Выплата", season: "Сезон", prize: "Приз", user: "Пользователь" };
  return map[type] ?? type;
}
function details(item: Item) {
  const data = item.after_data ?? item.before_data;
  if (!data) return "";
  const parts = Object.entries(data).filter(([k]) => !["before", "after"].includes(k)).slice(0, 4).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return parts.join(" · ");
}

function AdminAudit() {
  const [rows, setRows] = useState<Item[]>([]);
  const [counts, setCounts] = useState({ total: 0, adminEvents: 0, systemEvents: 0 });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"Все" | "Админы" | "Система">("Все");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh(search = query) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/audit?initData=${encodeURIComponent(initData())}&search=${encodeURIComponent(search)}&limit=100`);
      const data = (await response.json()) as Api;
      if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
      setRows(data.items ?? []);
      setCounts(data.counts ?? { total: 0, adminEvents: 0, systemEvents: 0 });
    } catch {
      setError("Не удалось загрузить журнал действий из PostgreSQL.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(""); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => rows.filter((row) => filter === "Все" || (filter === "Админы" ? Boolean(row.actor) : !row.actor)), [rows, filter]);

  return (
    <AppShell title="Журнал действий" nav={false}>
      <div className="space-y-4 pb-8">
        <div className="flex items-center justify-between gap-3">
          <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
          <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-1.5 text-[10px] text-primary-glow"><RefreshCw className="size-3.5" /> Обновить</button>
        </div>

        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Контроль изменений</p><h1 className="mt-1 font-display text-xl uppercase">Журнал действий</h1></div><FileText className="size-5 text-primary-glow" /></div>
          <div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Событий" value={String(counts.total)} /><Metric label="Админы" value={String(counts.adminEvents)} /><Metric label="Система" value={String(counts.systemEvents)} /></div>
        </GlassCard>

        <GlassCard className="space-y-3 px-3 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-glass-border bg-muted/20 px-3 py-2.5"><Search className="size-4 shrink-0 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по действию, ID, админу или объекту" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></div>
          <div className="flex gap-2 overflow-x-auto pb-1">{(["Все", "Админы", "Система"] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${filter === item ? "border-primary/40 bg-primary/10" : "border-glass-border bg-muted/10 text-muted-foreground"}`}>{item}</button>)}</div>
        </GlassCard>

        {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}

        <div className="space-y-2.5">
          {loading ? <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Загрузка из PostgreSQL…</GlassCard> : filtered.map((item) => (
            <GlassCard key={item.id} className="px-3.5 py-3.5">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-glass-border bg-muted/15"><Clock3 className="size-4 text-primary-glow" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{labelAction(item.action)}</p><span className="rounded-full border border-glass-border bg-muted/10 px-2 py-1 text-[9px] text-muted-foreground">{entityLabel(item.entity_type)}</span></div>
                  <p className="mt-1 text-[10px] text-muted-foreground">{item.created_at} · {item.actor ? `${item.role === "OWNER" ? "Владелец" : "Администратор"}: ${item.actor}` : "Система"}</p>
                  <div className="mt-2 rounded-xl border border-glass-border bg-muted/10 px-3 py-2.5"><p className="text-[10px] font-semibold">{item.entity_id ?? "—"}</p><p className="mt-0.5 break-words text-[10px] text-muted-foreground">{details(item) || "Без дополнительных данных"}</p></div>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </div>
            </GlassCard>
          ))}
          {!loading && filtered.length === 0 && <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Событий пока нет.</GlassCard>}
        </div>

        <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">Теперь журнал читает реальные события из PostgreSQL. Прокрутки, выплаты и будущие изменения сезона можно связывать с конкретным инициатором и объектом.</GlassCard>
      </div>
    </AppShell>
  );
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>; }
