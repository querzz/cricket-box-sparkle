import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, MessageCircle, Radio, Search, Send, ShieldCheck, ThumbsUp, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/channel-activity")({
  head: () => ({ meta: [{ title: "Активность канала — CRICKET BOX" }] }),
  component: ChannelActivity,
});

type Level = "Низкая" | "Активный" | "Очень активный" | "Максимальная";
type Row = { id: string; name: string; username: string; activeDays: number; reactions: number; comments: number; score: number; level: Level; bonus: boolean };

const INITIAL: Row[] = [
  { id: "ch_001", name: "Алекс", username: "@alex", activeDays: 11, reactions: 18, comments: 6, score: 24, level: "Очень активный", bonus: true },
  { id: "ch_002", name: "Мария", username: "@maria", activeDays: 8, reactions: 11, comments: 4, score: 15, level: "Очень активный", bonus: false },
  { id: "ch_003", name: "Даня", username: "@danya", activeDays: 6, reactions: 7, comments: 2, score: 9, level: "Активный", bonus: false },
  { id: "ch_004", name: "Ник", username: "@nik", activeDays: 3, reactions: 3, comments: 0, score: 3, level: "Активный", bonus: true },
  { id: "ch_005", name: "Соня", username: "@sonya", activeDays: 2, reactions: 1, comments: 0, score: 1, level: "Низкая", bonus: false },
];

function levelFromScore(score: number): Level {
  if (score >= 16) return "Максимальная";
  if (score >= 8) return "Очень активный";
  if (score >= 3) return "Активный";
  return "Низкая";
}

function ChannelActivity() {
  const [rows, setRows] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<Level | "Все">("Все");

  const filtered = useMemo(() => rows.filter((row) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || row.username.toLowerCase().includes(q) || row.name.toLowerCase().includes(q) || row.id.toLowerCase().includes(q);
    return matchesQuery && (level === "Все" || row.level === level);
  }), [rows, query, level]);

  const activeUsers = rows.filter((x) => x.score > 0).length;
  const bonusReady = rows.filter((x) => x.level !== "Низкая" && !x.bonus).length;
  const totalActions = rows.reduce((sum, x) => sum + x.score, 0);

  function grantBonus(id: string) {
    setRows((all) => all.map((row) => row.id === id ? { ...row, bonus: true } : row));
  }

  return (
    <AppShell title="Активность канала" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>

        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Telegram-канал</p><h1 className="mt-1 font-display text-xl uppercase">Активность подписчиков</h1><p className="mt-1 text-[11px] text-muted-foreground">Отдельная система от уровней Cricket Box.</p></div><Radio className="size-5 text-primary-glow" /></div>
          <div className="mt-4 grid grid-cols-3 gap-2"><Metric icon={Users} label="Активные" value={String(activeUsers)} /><Metric icon={MessageCircle} label="Действия" value={String(totalActions)} /><Metric icon={Gift} label="Бонусов готово" value={String(bonusReady)} /></div>
        </GlassCard>

        <GlassCard className="space-y-3 px-3 py-3">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по имени, @username или ID" className="admin-input w-full pl-9" /></div>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["Все", "Низкая", "Активный", "Очень активный", "Максимальная"] as const).map((item) => <button key={item} type="button" onClick={() => setLevel(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${level === item ? "border-primary/40 bg-primary/10" : "border-glass-border bg-muted/10 text-muted-foreground"}`}>{item}</button>)}
          </div>
        </GlassCard>

        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="section-label">Активные подписчики</h2><span className="text-[10px] text-muted-foreground">{filtered.length}</span></div>
          <div className="space-y-2.5">
            {filtered.map((row) => <GlassCard key={row.id} className="px-3.5 py-3.5">
              <div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl border border-glass-border bg-muted/20"><ShieldCheck className="size-4 text-primary-glow" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{row.name}</p><span className="rounded-full border border-glass-border px-2 py-0.5 text-[9px]">{row.level}</span>{row.bonus && <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px]">Бонус выдан</span>}</div><p className="mt-1 text-[10px] text-muted-foreground">{row.username} · ID {row.id}</p><div className="mt-2 grid grid-cols-3 gap-2"><MiniStat label="Дней активности" value={String(row.activeDays)} /><MiniStat label="Реакций" value={String(row.reactions)} /><MiniStat label="Комментариев" value={String(row.comments)} /></div></div></div>
              <div className="mt-3 flex items-center gap-2 border-t border-glass-border pt-3"><span className="flex-1 text-[10px] text-muted-foreground">Очки активности: <strong className="text-foreground">{row.score}</strong></span>{!row.bonus && row.level !== "Низкая" && <button type="button" onClick={() => grantBonus(row.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-semibold"><Send className="size-3.5" /> Выдать бонус</button>}</div>
            </GlassCard>)}
            {filtered.length === 0 && <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Ничего не найдено.</GlassCard>}
          </div>
        </section>

        <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Сейчас это демонстрационный режим. Реальный сбор событий будет подключён через Telegram-интеграцию; мы учитываем только действия, которые можно надёжно связать с конкретным Telegram ID.
        </GlassCard>
      </div>
    </AppShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><Icon className="size-4 text-primary-glow" /><p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>; }
function MiniStat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-glass-border bg-muted/15 px-2.5 py-2"><p className="text-[9px] text-muted-foreground">{label}</p><p className="mt-0.5 text-xs font-semibold">{value}</p></div>; }
