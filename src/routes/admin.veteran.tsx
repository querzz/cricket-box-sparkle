import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Crown, Gift, History, Medal, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/veteran")({
  head: () => ({ meta: [{ title: "Бонусы ветеранов — CRICKET BOX" }] }),
  component: VeteranBuffs,
});

type Tier = "Новичок" | "Ветеран" | "Элита";
type Player = { id: string; username: string; seasons: number; spins: number; wins: number; tier: Tier; bonusEnabled: boolean; bonus: string };

const INITIAL: Player[] = [
  { id: "v_001", username: "@alex", seasons: 4, spins: 182, wins: 19, tier: "Элита", bonusEnabled: true, bonus: "+2% к шансу бонусного события" },
  { id: "v_002", username: "@maria", seasons: 3, spins: 117, wins: 11, tier: "Ветеран", bonusEnabled: true, bonus: "1 дополнительная попытка в первый день" },
  { id: "v_003", username: "@danya", seasons: 2, spins: 64, wins: 5, tier: "Ветеран", bonusEnabled: false, bonus: "Не назначен" },
  { id: "v_004", username: "@nik", seasons: 1, spins: 22, wins: 1, tier: "Новичок", bonusEnabled: false, bonus: "Не назначен" },
];

const DEFAULT_BONUSES: Record<Tier, string> = {
  "Новичок": "Без дополнительного бонуса",
  "Ветеран": "1 дополнительная попытка в первый день",
  "Элита": "+2% к шансу бонусного события",
};

function VeteranBuffs() {
  const [players, setPlayers] = useState(INITIAL);
  const [tierFilter, setTierFilter] = useState<Tier | "Все">("Все");
  const [enabled, setEnabled] = useState(true);
  const counts = useMemo(() => ({ elite: players.filter((x) => x.tier === "Элита").length, veteran: players.filter((x) => x.tier === "Ветеран").length, rookie: players.filter((x) => x.tier === "Новичок").length }), [players]);
  const filtered = players.filter((x) => tierFilter === "Все" || x.tier === tierFilter);

  function toggleBonus(id: string) {
    setPlayers((all) => all.map((player) => player.id === id ? { ...player, bonusEnabled: !player.bonusEnabled } : player));
  }

  return (
    <AppShell title="Бонусы ветеранов" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Перенос прогресса между сезонами</p><h1 className="mt-1 font-display text-xl uppercase">Бонусы ветеранов</h1><p className="mt-1 text-[11px] text-muted-foreground">История участия в Cricket Box влияет на бонусы нового сезона.</p></div><Crown className="size-5 text-primary-glow" /></div>
          <div className="mt-4 grid grid-cols-3 gap-2"><Metric icon={Medal} label="Элита" value={String(counts.elite)} /><Metric icon={ShieldCheck} label="Ветераны" value={String(counts.veteran)} /><Metric icon={Users} label="Новички" value={String(counts.rookie)} /></div>
        </GlassCard>
        <GlassCard className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-semibold">Система бонусов включена</p><p className="text-[10px] text-muted-foreground">Админ может полностью отключить механику.</p></div><button type="button" onClick={() => setEnabled(!enabled)} className={`rounded-full px-3 py-1.5 text-[10px] font-semibold ${enabled ? "bg-primary/15" : "bg-muted/30 text-muted-foreground"}`}>{enabled ? "Включена" : "Выключена"}</button></GlassCard>
        <section><h2 className="section-label mb-2">Уровни</h2><div className="space-y-2.5">{(Object.keys(DEFAULT_BONUSES) as Tier[]).map((tier) => <GlassCard key={tier} className="px-3.5 py-3.5"><div className="flex items-start gap-3"><div className="grid size-9 place-items-center rounded-xl border border-glass-border bg-muted/20"><Sparkles className="size-4 text-primary-glow" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{tier}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{DEFAULT_BONUSES[tier]}</p></div></div></GlassCard>)}</div></section>
        <GlassCard className="px-3 py-3"><div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{(["Все", "Новичок", "Ветеран", "Элита"] as const).map((item) => <button key={item} type="button" onClick={() => setTierFilter(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${tierFilter === item ? "border-primary/40 bg-primary/10" : "border-glass-border bg-muted/10 text-muted-foreground"}`}>{item}</button>)}</div></GlassCard>
        <section><h2 className="section-label mb-2">Игроки</h2><div className="space-y-2.5">{filtered.map((player) => <GlassCard key={player.id} className="px-3.5 py-3.5"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{player.username}</p><span className="rounded-full border border-glass-border px-2 py-0.5 text-[9px]">{player.tier}</span></div><p className="mt-1 text-[10px] text-muted-foreground">Сезонов: {player.seasons} · прокруток: {player.spins} · побед: {player.wins}</p><p className="mt-2 text-[10px] text-muted-foreground">Бонус: {enabled ? player.bonus : "Система выключена"}</p></div><button type="button" onClick={() => toggleBonus(player.id)} className={`rounded-xl border px-3 py-2 text-[10px] font-semibold ${player.bonusEnabled ? "border-primary/30 bg-primary/10" : "border-glass-border bg-muted/10 text-muted-foreground"}`}>{player.bonusEnabled ? "Выдан" : "Не выдан"}</button></div></GlassCard>)}</div></section>
        <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground"><div className="flex items-start gap-2"><History className="mt-0.5 size-4 shrink-0 text-primary-glow" /><p>Пока это предпросмотр. После backend уровень будет рассчитываться по истории реальных сезонов, а бонус фиксироваться на момент старта нового сезона.</p></div></GlassCard>
      </div>
    </AppShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Medal; label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><Icon className="size-4 text-primary-glow" /><p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>; }
