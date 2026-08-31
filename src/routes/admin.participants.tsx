import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Search, Users, X } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/participants")({
  head: () => ({ meta: [{ title: "Участники — CRICKET BOX" }] }),
  component: AdminParticipants,
});

type Participant = {
  id: string;
  username: string;
  name: string;
  joined: string;
  spins: number;
  freeSpins: number;
  paidSpins: number;
  stars: number;
  rewards: number;
  referrals: number;
  status: "Активен" | "Неактивен" | "Заблокирован";
  lastSeen: string;
};

const MOCK_PARTICIPANTS: Participant[] = [
  { id: "1001001", username: "@nightowl", name: "Night Owl", joined: "31.08.2026", spins: 18, freeSpins: 9, paidSpins: 9, stars: 125, rewards: 3, referrals: 4, status: "Активен", lastSeen: "2 мин назад" },
  { id: "1001002", username: "@mika", name: "Mika", joined: "30.08.2026", spins: 14, freeSpins: 8, paidSpins: 6, stars: 80, rewards: 2, referrals: 2, status: "Активен", lastSeen: "11 мин назад" },
  { id: "1001003", username: "@sable", name: "Sable", joined: "29.08.2026", spins: 9, freeSpins: 5, paidSpins: 4, stars: 500, rewards: 5, referrals: 8, status: "Активен", lastSeen: "38 мин назад" },
  { id: "1001004", username: "@lumen", name: "Lumen", joined: "28.08.2026", spins: 6, freeSpins: 6, paidSpins: 0, stars: 20, rewards: 1, referrals: 1, status: "Неактивен", lastSeen: "3 ч назад" },
  { id: "1001005", username: "@moro", name: "Moro", joined: "27.08.2026", spins: 22, freeSpins: 10, paidSpins: 12, stars: 240, rewards: 4, referrals: 6, status: "Активен", lastSeen: "1 ч назад" },
  { id: "1001006", username: "@frost", name: "Frost", joined: "26.08.2026", spins: 3, freeSpins: 3, paidSpins: 0, stars: 0, rewards: 0, referrals: 0, status: "Неактивен", lastSeen: "2 д назад" },
];

function AdminParticipants() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"Все" | Participant["status"]>("Все");
  const [selected, setSelected] = useState<Participant | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return MOCK_PARTICIPANTS.filter((p) => {
      const matchesQuery = !normalized || [p.username, p.name, p.id].some((value) => value.toLowerCase().includes(normalized));
      const matchesStatus = status === "Все" || p.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [query, status]);

  const stats = useMemo(() => ({
    total: MOCK_PARTICIPANTS.length,
    active: MOCK_PARTICIPANTS.filter((p) => p.status === "Активен").length,
    spins: MOCK_PARTICIPANTS.reduce((sum, p) => sum + p.spins, 0),
    rewards: MOCK_PARTICIPANTS.reduce((sum, p) => sum + p.rewards, 0),
  }), []);

  return (
    <AppShell title="Участники" nav={false}>
      <div className="space-y-4 pb-8">
        <div className="flex items-center justify-between gap-3">
          <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">CRICKET BOX #001</span>
        </div>

        <GlassCard className="border-primary/20 px-4 py-4" glow>
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl border border-primary/20 bg-primary/10"><Users className="size-5 text-primary-glow" /></div>
            <div><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Участники сезона</p><h1 className="font-display text-xl uppercase">Пользователи</h1></div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            <Metric label="Всего" value={String(stats.total)} />
            <Metric label="Активны" value={String(stats.active)} />
            <Metric label="Прокрутки" value={String(stats.spins)} />
            <Metric label="Награды" value={String(stats.rewards)} />
          </div>
        </GlassCard>

        <GlassCard className="px-3 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по username, имени или Telegram ID" className="admin-input pl-9" />
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {(["Все", "Активен", "Неактивен", "Заблокирован"] as const).map((item) => (
              <button key={item} type="button" onClick={() => setStatus(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition-colors ${status === item ? "border-primary/40 bg-primary/15 text-primary-glow" : "border-glass-border text-muted-foreground"}`}>{item}</button>
            ))}
          </div>
        </GlassCard>

        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="section-label">Список участников</h2><span className="text-[10px] text-muted-foreground">{filtered.length} из {stats.total}</span></div>
          <GlassCard className="overflow-hidden">
            <div className="divide-y divide-glass-border">
              {filtered.map((participant) => (
                <button key={participant.id} type="button" onClick={() => setSelected(participant)} className="w-full px-3 py-3.5 text-left transition-colors hover:bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-full border border-glass-border bg-muted/30 text-xs font-bold">{participant.name.slice(0, 1)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{participant.username}</p><Status status={participant.status} /></div>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{participant.name} · ID {participant.id} · был {participant.lastSeen}</p>
                    </div>
                    <div className="hidden text-right sm:block"><p className="text-xs font-semibold">{participant.spins} прокруток</p><p className="text-[10px] text-muted-foreground">{participant.rewards} наград · {participant.stars} ⭐</p></div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <div className="px-4 py-8 text-center text-xs text-muted-foreground">По вашему запросу участников не найдено.</div>}
            </div>
          </GlassCard>
        </section>
      </div>

      {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={() => setSelected(null)}>
        <GlassCard className="w-full max-w-lg px-4 py-4" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Карточка участника</p><h2 className="mt-1 font-display text-xl">{selected.username}</h2><p className="mt-0.5 text-xs text-muted-foreground">{selected.name} · Telegram ID {selected.id}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Закрыть" className="rounded-xl p-1.5"><X className="size-5" /></button></div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Detail label="Дата регистрации" value={selected.joined} />
            <Detail label="Статус" value={selected.status} />
            <Detail label="Прокрутки" value={String(selected.spins)} />
            <Detail label="Бесплатные" value={String(selected.freeSpins)} />
            <Detail label="Платные" value={String(selected.paidSpins)} />
            <Detail label="Stars" value={`${selected.stars} ⭐`} />
            <Detail label="Награды" value={String(selected.rewards)} />
            <Detail label="Рефералы" value={String(selected.referrals)} />
          </div>
          <div className="mt-4 flex justify-end"><button type="button" onClick={() => setSelected(null)} className="rounded-xl border border-glass-border px-3 py-2 text-xs font-semibold">Закрыть</button></div>
        </GlassCard>
      </div>}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-glass-border bg-muted/20 px-2.5 py-2.5"><p className="text-[8px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-base">{value}</p></div>;
}

function Status({ status }: { status: Participant["status"] }) {
  const className = status === "Активен" ? "border-primary/30 bg-primary/10 text-primary-glow" : status === "Заблокирован" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-glass-border bg-muted/20 text-muted-foreground";
  return <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${className}`}>{status}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}
