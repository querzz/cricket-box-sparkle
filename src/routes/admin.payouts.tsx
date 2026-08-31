import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Clock3, ExternalLink, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/payouts")({
  head: () => ({ meta: [{ title: "Выплаты — CRICKET BOX" }] }),
  component: AdminPayouts,
});

type PayoutStatus = "Ожидает" | "На проверке" | "Выдан" | "Ошибка" | "Отменён";
type Payout = { id: string; time: string; username: string; telegramId: string; prize: string; type: "Stars" | "Premium" | "Деньги"; amount: string; status: PayoutStatus };

const INITIAL: Payout[] = [
  { id: "po_204", time: "31.08.2026 18:42", username: "@serge", telegramId: "712345678", prize: "50 Stars", type: "Stars", amount: "50 ⭐", status: "Ожидает" },
  { id: "po_203", time: "31.08.2026 18:31", username: "@mika", telegramId: "712344902", prize: "Telegram Premium · 6 месяцев", type: "Premium", amount: "1 шт.", status: "На проверке" },
  { id: "po_202", time: "31.08.2026 18:17", username: "@cricketfan", telegramId: "712344501", prize: "100 Stars", type: "Stars", amount: "100 ⭐", status: "Выдан" },
  { id: "po_201", time: "31.08.2026 17:58", username: "@nightowl", telegramId: "712345111", prize: "500 грн", type: "Деньги", amount: "500 грн", status: "Ожидает" },
  { id: "po_200", time: "31.08.2026 17:40", username: "@sable", telegramId: "712344700", prize: "Telegram Premium · 3 месяца", type: "Premium", amount: "1 шт.", status: "Ошибка" },
];

function AdminPayouts() {
  const [rows, setRows] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PayoutStatus | "Все">("Все");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => (filter === "Все" || p.status === filter) && (!q || [p.id, p.username, p.telegramId, p.prize].some((v) => v.toLowerCase().includes(q))));
  }, [rows, query, filter]);

  const counts = useMemo(() => ({ pending: rows.filter((x) => x.status === "Ожидает").length, review: rows.filter((x) => x.status === "На проверке").length, done: rows.filter((x) => x.status === "Выдан").length }), [rows]);

  function setStatus(id: string, status: PayoutStatus) { setRows((all) => all.map((p) => p.id === id ? { ...p, status } : p)); }

  return (
    <AppShell title="Выплаты" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>

        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Выдача наград</p><h1 className="mt-1 font-display text-xl uppercase">Выплаты</h1></div><ExternalLink className="size-4 text-primary-glow" /></div>
          <div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Ожидают" value={String(counts.pending)} /><Metric label="На проверке" value={String(counts.review)} /><Metric label="Выдано" value={String(counts.done)} /></div>
        </GlassCard>

        <GlassCard className="space-y-3 px-3 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-glass-border bg-muted/20 px-3 py-2.5"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пользователь, ID, приз или ID выплаты" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></div>
          <div className="flex gap-2 overflow-x-auto pb-1">{(["Все", "Ожидает", "На проверке", "Выдан", "Ошибка", "Отменён"] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${filter === item ? "border-primary/40 bg-primary/10" : "border-glass-border bg-muted/10 text-muted-foreground"}`}>{item}</button>)}</div>
        </GlassCard>

        <GlassCard className="overflow-hidden px-0 py-0">
          <div className="hidden grid-cols-[1fr_1.1fr_1.3fr_.7fr_.8fr] gap-3 border-b border-glass-border px-4 py-3 text-[9px] uppercase tracking-[0.15em] text-muted-foreground md:grid"><span>Выплата</span><span>Пользователь</span><span>Приз</span><span>Тип</span><span>Статус</span></div>
          <div className="divide-y divide-glass-border">
            {filtered.map((p) => <div key={p.id} className="px-4 py-3.5"><div className="grid gap-3 md:grid-cols-[1fr_1.1fr_1.3fr_.7fr_.8fr] md:items-center"><div><p className="font-mono text-[11px] font-semibold">{p.id}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{p.time}</p></div><div><p className="text-sm font-semibold">{p.username}</p><p className="text-[9px] text-muted-foreground">ID {p.telegramId}</p></div><div><p className="text-sm font-semibold">{p.prize}</p><p className="text-[9px] text-muted-foreground">{p.amount}</p></div><div><span className="rounded-full border border-glass-border px-2 py-1 text-[9px]">{p.type}</span></div><div><Status status={p.status} /><div className="mt-2 flex flex-wrap gap-1.5">{p.status === "Ожидает" && <button type="button" onClick={() => setStatus(p.id, "На проверке")} className="inline-flex items-center gap-1 rounded-lg border border-glass-border px-2 py-1 text-[9px] font-semibold"><Clock3 className="size-3" /> Проверить</button>}{p.status === "На проверке" && <><button type="button" onClick={() => setStatus(p.id, "Выдан")} className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[9px] font-semibold"><Check className="size-3" /> Выдать</button><button type="button" onClick={() => setStatus(p.id, "Ошибка")} className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2 py-1 text-[9px] font-semibold"><XCircle className="size-3" /> Ошибка</button></>}</div></div></div></div>)}
            {filtered.length === 0 && <div className="px-4 py-8 text-center text-xs text-muted-foreground">Ничего не найдено.</div>}
          </div>
        </GlassCard>

        <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">Сейчас используются тестовые записи. В backend для каждой выплаты появятся источник выигрыша, Telegram ID, тип награды, история статусов, оператор и технический журнал выдачи.</GlassCard>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>; }
function Status({ status }: { status: PayoutStatus }) { const cls = status === "Выдан" ? "border-primary/30 bg-primary/10" : status === "Ошибка" || status === "Отменён" ? "border-destructive/30 bg-destructive/10" : status === "На проверке" ? "border-warning/30 bg-warning/10" : "border-glass-border bg-muted/10"; return <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold ${cls}`}>{status}</span>; }
