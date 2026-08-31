import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Search, SlidersHorizontal, RotateCw } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/spins")({
  head: () => ({ meta: [{ title: "Прокрутки — CRICKET BOX" }] }),
  component: AdminSpins,
});

type Spin = {
  id: string;
  time: string;
  username: string;
  telegramId: string;
  type: "Бесплатная" | "Платная";
  price: number;
  result: string;
  status: "Успешно" | "Пусто";
};

const MOCK_SPINS: Spin[] = [
  { id: "sp_1028", time: "31.08.2026 18:42", username: "@serge", telegramId: "712345678", type: "Бесплатная", price: 0, result: "50 Stars", status: "Успешно" },
  { id: "sp_1027", time: "31.08.2026 18:39", username: "@nightowl", telegramId: "712345111", type: "Платная", price: 100, result: "Пусто", status: "Пусто" },
  { id: "sp_1026", time: "31.08.2026 18:31", username: "@mika", telegramId: "712344902", type: "Платная", price: 100, result: "Telegram Premium · 6 месяцев", status: "Успешно" },
  { id: "sp_1025", time: "31.08.2026 18:26", username: "@sable", telegramId: "712344700", type: "Бесплатная", price: 0, result: "Пусто", status: "Пусто" },
  { id: "sp_1024", time: "31.08.2026 18:17", username: "@cricketfan", telegramId: "712344501", type: "Платная", price: 100, result: "100 Stars", status: "Успешно" },
];

function AdminSpins() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"Все" | "Бесплатная" | "Платная">("Все");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK_SPINS.filter((spin) => {
      const matchesFilter = filter === "Все" || spin.type === filter;
      const matchesQuery = !q || [spin.id, spin.username, spin.telegramId, spin.result].some((v) => v.toLowerCase().includes(q));
      return matchesFilter && matchesQuery;
    });
  }, [query, filter]);

  return (
    <AppShell title="Прокрутки" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>

        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Журнал операций</p><h1 className="mt-1 font-display text-xl uppercase">Все прокрутки</h1></div>
            <div className="rounded-xl border border-glass-border bg-muted/20 p-2"><RotateCw className="size-4 text-primary-glow" /></div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Всего" value="1 028" /><Metric label="Платных" value="386" /><Metric label="Успешных" value="642" /></div>
        </GlassCard>

        <GlassCard className="space-y-3 px-3 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-glass-border bg-muted/20 px-3 py-2.5"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пользователь, ID, результат или ID прокрутки" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">{(["Все", "Бесплатная", "Платная"] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${filter === item ? "border-primary/40 bg-primary/10" : "border-glass-border bg-muted/10 text-muted-foreground"}`}><SlidersHorizontal className="mr-1 inline size-3" />{item}</button>)}</div>
        </GlassCard>

        <GlassCard className="overflow-hidden px-0 py-0">
          <div className="hidden grid-cols-[1fr_1.1fr_.8fr_1.2fr_.7fr] gap-3 border-b border-glass-border px-4 py-3 text-[9px] uppercase tracking-[0.15em] text-muted-foreground md:grid"><span>Прокрутка</span><span>Пользователь</span><span>Тип</span><span>Результат</span><span>Цена</span></div>
          <div className="divide-y divide-glass-border">{rows.map((spin) => <div key={spin.id} className="px-4 py-3.5"><div className="grid gap-2 md:grid-cols-[1fr_1.1fr_.8fr_1.2fr_.7fr] md:items-center md:gap-3"><div><p className="font-mono text-[11px] font-semibold">{spin.id}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{spin.time}</p></div><div><p className="text-sm font-semibold">{spin.username}</p><p className="text-[9px] text-muted-foreground">ID {spin.telegramId}</p></div><div><span className="rounded-full border border-glass-border px-2 py-1 text-[9px]">{spin.type}</span></div><div><p className={`text-sm font-semibold ${spin.status === "Пусто" ? "text-muted-foreground" : ""}`}>{spin.result}</p><p className="text-[9px] text-muted-foreground">{spin.status}</p></div><div><p className="text-sm font-semibold">{spin.price ? `${spin.price} ⭐` : "Бесплатно"}</p></div></div></div>)}{rows.length === 0 && <div className="px-4 py-8 text-center text-xs text-muted-foreground">Ничего не найдено.</div>}</div>
        </GlassCard>

        <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">Пока журнал использует тестовые данные. После подключения backend здесь появятся реальные request ID, атомарный результат spin, источник оплаты, приз и технические статусы.</GlassCard>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>; }
