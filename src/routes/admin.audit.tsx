import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Clock3, FileText, Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({ meta: [{ title: "Журнал действий — CRICKET BOX" }] }),
  component: AdminAudit,
});

type AuditAction = "Выиграл приз" | "Выплата создана" | "Выплата выдана" | "Изменён приз" | "Создан сезон" | "Изменён сезон";
type AuditItem = {
  id: string;
  time: string;
  actor: string;
  action: AuditAction;
  object: string;
  objectType: "Выплата" | "Приз" | "Сезон" | "Пользователь";
  details: string;
};

const INITIAL: AuditItem[] = [
  { id: "a_006", time: "31.08.2026 18:51", actor: "admin", action: "Изменён приз", object: "stars100", objectType: "Приз", details: "Количество: 1 → 2" },
  { id: "a_005", time: "31.08.2026 18:47", actor: "admin", action: "Создан сезон", object: "CRICKET BOX #002", objectType: "Сезон", details: "Черновик · 14 дней · платная прокрутка 100 ⭐" },
  { id: "a_004", time: "31.08.2026 18:44", actor: "admin", action: "Выплата выдана", object: "po_202", objectType: "Выплата", details: "@cricketfan · 100 Stars" },
  { id: "a_003", time: "31.08.2026 18:43", actor: "system", action: "Выплата создана", object: "po_204", objectType: "Выплата", details: "@serge · 50 Stars · ожидает выдачи" },
  { id: "a_002", time: "31.08.2026 18:42", actor: "system", action: "Выиграл приз", object: "@serge", objectType: "Пользователь", details: "50 Stars · прокрутка sp_8812" },
  { id: "a_001", time: "31.08.2026 18:30", actor: "admin", action: "Изменён сезон", object: "CRICKET BOX #001", objectType: "Сезон", details: "Ежедневная бесплатная попытка: выкл. → вкл." },
];

function AdminAudit() {
  const [rows] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"Все" | AuditAction>("Все");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((item) =>
      (filter === "Все" || item.action === filter) &&
      (!q || [item.id, item.actor, item.action, item.object, item.objectType, item.details].some((value) => value.toLowerCase().includes(q))),
    );
  }, [rows, query, filter]);

  return (
    <AppShell title="Журнал действий" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          <ArrowLeft className="size-3.5" /> Админ-панель
        </Link>

        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Контроль изменений</p>
              <h1 className="mt-1 font-display text-xl uppercase">Журнал действий</h1>
            </div>
            <FileText className="size-5 text-primary-glow" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric label="Событий" value={String(rows.length)} />
            <Metric label="Админы" value={String(new Set(rows.filter((x) => x.actor === "admin").map((x) => x.actor)).size)} />
            <Metric label="Системные" value={String(rows.filter((x) => x.actor === "system").length)} />
          </div>
        </GlassCard>

        <GlassCard className="space-y-3 px-3 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-glass-border bg-muted/20 px-3 py-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по действию, пользователю или объекту" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {["Все", "Выиграл приз", "Выплата создана", "Выплата выдана", "Изменён приз", "Создан сезон", "Изменён сезон"] .map((item) => (
              <button key={item} type="button" onClick={() => setFilter(item as "Все" | AuditAction)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${filter === item ? "border-primary/40 bg-primary/10" : "border-glass-border bg-muted/10 text-muted-foreground"}`}>
                {item}
              </button>
            ))}
          </div>
        </GlassCard>

        <div className="space-y-2.5">
          {filtered.map((item) => (
            <GlassCard key={item.id} className="px-3.5 py-3.5">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-glass-border bg-muted/15">
                  <Clock3 className="size-4 text-primary-glow" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{item.action}</p>
                    <span className="rounded-full border border-glass-border bg-muted/10 px-2 py-1 text-[9px] text-muted-foreground">{item.objectType}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">{item.time} · {item.actor === "admin" ? "Администратор" : item.actor === "system" ? "Система" : item.actor}</p>
                  <div className="mt-2 rounded-xl border border-glass-border bg-muted/10 px-3 py-2.5">
                    <p className="text-[10px] font-semibold">{item.object}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{item.details}</p>
                  </div>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </div>
            </GlassCard>
          ))}
          {filtered.length === 0 && <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Ничего не найдено.</GlassCard>}
        </div>

        <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Сейчас журнал демонстрационный. В backend каждое событие будет иметь точное время, инициатора, сезон, объект, старое значение, новое значение и технический идентификатор запроса.
        </GlassCard>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>;
}
