import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/participants")({
  head: () => ({ meta: [{ title: "Участники — CRICKET BOX" }] }),
  component: AdminParticipants,
});

type Participant = {
  id: string; username: string; name: string; joined: string; spins: number;
  freeSpins: number; paidSpins: number; stars: number; rewards: number;
  referrals: number; status: "Активен" | "Неактивен" | "Заблокирован";
  lastSeen: string; isPremium: boolean; xp: number; level: number;
};

type Api = { ok: boolean; participants?: Participant[]; code?: string };

function initData() {
  if (typeof window === "undefined") return "";
  const tg = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return tg?.WebApp?.initData?.trim() ?? "";
}

async function loadParticipants(search: string, signal?: AbortSignal) {
  const response = await fetch(`/api/admin/participants?initData=${encodeURIComponent(initData())}&search=${encodeURIComponent(search)}&limit=100`, { signal });
  const data = (await response.json()) as Api;
  if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
  return data.participants ?? [];
}

function AdminParticipants() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"Все" | Participant["status"]>("Все");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  async function refresh(value = search) {
    const currentRequest = ++requestId.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError("");

    try {
      const next = await loadParticipants(value, controller.signal);
      if (currentRequest !== requestId.current) return;
      setParticipants(next);
      setError("");
    } catch (errorValue) {
      if (controller.signal.aborted || currentRequest !== requestId.current) return;
      const code = errorValue instanceof Error ? errorValue.message : "REQUEST_FAILED";
      setError(code === "ADMIN_REQUIRED" ? "Недостаточно прав для просмотра участников." : "Не удалось загрузить участников из PostgreSQL.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh("");
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query !== search) {
        setSearch(query);
        void refresh(query);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const filtered = useMemo(() => status === "Все" ? participants : participants.filter((p) => p.status === status), [participants, status]);
  const stats = useMemo(() => ({ total: participants.length, active: participants.filter((p) => p.status === "Активен").length, spins: participants.reduce((sum, p) => sum + p.spins, 0), rewards: participants.reduce((sum, p) => sum + p.rewards, 0) }), [participants]);

  return (
    <AppShell title="Участники" nav={false}>
      <div className="space-y-4 pb-8">
        <div className="flex items-center justify-between gap-3"><Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link><button type="button" onClick={() => void refresh()} className="text-[10px] text-primary-glow">Обновить</button></div>
        <GlassCard className="border-primary/20 px-4 py-4" glow>
          <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl border border-primary/20 bg-primary/10"><Users className="size-5 text-primary-glow" /></div><div><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Участники сезона</p><h1 className="font-display text-xl uppercase">Пользователи</h1></div></div>
          <div className="mt-4 grid grid-cols-4 gap-2"><Metric label="Всего" value={String(stats.total)} /><Metric label="Активны" value={String(stats.active)} /><Metric label="Прокрутки" value={String(stats.spins)} /><Metric label="Награды" value={String(stats.rewards)} /></div>
        </GlassCard>
        <GlassCard className="px-3 py-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по username, имени или Telegram ID" className="admin-input pl-9" /></div><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{(["Все", "Активен", "Неактивен", "Заблокирован"] as const).map((item) => <button key={item} type="button" onClick={() => setStatus(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${status === item ? "border-primary/40 bg-primary/15 text-primary-glow" : "border-glass-border text-muted-foreground"}`}>{item}</button>)}</div></GlassCard>
        {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
        <section><div className="mb-2 flex items-center justify-between"><h2 className="section-label">Список участников</h2><span className="text-[10px] text-muted-foreground">{filtered.length}</span></div><GlassCard className="overflow-hidden"><div className="divide-y divide-glass-border">{loading ? <div className="px-4 py-8 text-center text-xs text-muted-foreground">Загрузка…</div> : filtered.map((participant) => <button key={participant.id} type="button" onClick={() => setSelected(participant)} className="w-full px-3 py-3.5 text-left transition-colors hover:bg-muted/20"><div className="flex items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-full border border-glass-border bg-muted/30 text-xs font-bold">{participant.name.slice(0, 1) || "?"}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{participant.username}</p><Status status={participant.status} /></div><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{participant.name} · ID {participant.telegramId} · был {participant.lastSeen}</p></div><div className="hidden text-right sm:block"><p className="text-xs font-semibold">{participant.spins} прокруток</p><p className="text-[10px] text-muted-foreground">{participant.rewards} наград · lvl {participant.level}</p></div><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></div></button>)}{!loading && filtered.length === 0 && <div className="px-4 py-8 text-center text-xs text-muted-foreground">Участников не найдено.</div>}</div></GlassCard></section>
      </div>
      {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={() => setSelected(null)}><GlassCard className="w-full max-w-lg px-4 py-4" onClick={(e: React.MouseEvent) => e.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Карточка участника</p><h2 className="mt-1 font-display text-xl">{selected.username}</h2><p className="mt-0.5 text-xs text-muted-foreground">{selected.name} · Telegram ID {selected.telegramId}</p></div><button type="button" onClick={() => setSelected(null)}><X className="size-5" /></button></div><div className="mt-4 grid grid-cols-2 gap-2"><Detail label="Дата регистрации" value={selected.joined} /><Detail label="Последний вход" value={selected.lastSeen} /><Detail label="Уровень / XP" value={`${selected.level} / ${selected.xp}`} /><Detail label="Premium" value={selected.isPremium ? "Да" : "Нет"} /><Detail label="Прокрутки" value={String(selected.spins)} /><Detail label="Награды" value={String(selected.rewards)} /><Detail label="Stars" value={`${selected.stars} ⭐`} /><Detail label="Рефералы" value={String(selected.referrals)} /></div></GlassCard></div>}
    </AppShell>
  );
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-2.5 py-2.5"><p className="text-[8px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-base">{value}</p></div>; }
function Status({ status }: { status: Participant["status"] }) { const className = status === "Активен" ? "border-primary/30 bg-primary/10 text-primary-glow" : status === "Заблокирован" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-glass-border bg-muted/20 text-muted-foreground"; return <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${className}`}>{status}</span>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
