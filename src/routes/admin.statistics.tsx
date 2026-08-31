import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, TrendingUp, Users, RotateCw, Gift, Star, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/statistics")({
  head: () => ({ meta: [{ title: "Статистика — CRICKET BOX" }] }),
  component: AdminStatistics,
});

type Period = "Текущий сезон" | "Все сезоны";

const DAYS = ["25.08", "26.08", "27.08", "28.08", "29.08", "30.08", "31.08"];
const SPINS = [62, 88, 104, 141, 176, 213, 244];
const NEW_USERS = [8, 11, 15, 19, 24, 31, 38];

function AdminStatistics() {
  const [period, setPeriod] = useState<Period>("Текущий сезон");
  const mult = period === "Текущий сезон" ? 1 : 2.7;
  const metrics = useMemo(() => ({
    users: Math.round(1260 * mult),
    spins: Math.round(1028 * mult),
    free: Math.round(642 * mult),
    paid: Math.round(386 * mult),
    revenue: Math.round(38600 * mult),
    starPrizes: Math.round(670 * mult),
    payouts: Math.round(82 * mult),
    margin: Math.round(37930 * mult),
  }), [mult]);

  return (
    <AppShell title="Статистика" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          <ArrowLeft className="size-3.5" /> Админ-панель
        </Link>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["Текущий сезон", "Все сезоны"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setPeriod(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${period === item ? "border-primary/40 bg-primary/10" : "border-glass-border bg-muted/10 text-muted-foreground"}`}>
              {item}
            </button>
          ))}
        </div>

        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Аналитика сезона</p>
              <h1 className="mt-1 font-display text-xl uppercase">Статистика</h1>
            </div>
            <BarChart3 className="size-5 text-primary-glow" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric icon={Users} label="Участники" value={format(metrics.users)} />
            <Metric icon={RotateCw} label="Прокрутки" value={format(metrics.spins)} />
            <Metric icon={WalletCards} label="Оборот Stars" value={`${format(metrics.revenue)} ⭐`} />
            <Metric icon={TrendingUp} label="Маржа" value={`${format(metrics.margin)} ⭐`} />
          </div>
        </GlassCard>

        <section>
          <h2 className="section-label mb-2">Воронка</h2>
          <GlassCard className="space-y-2 px-4 py-4">
            <FunnelRow label="Открыли Mini App" value={metrics.users} pct={100} />
            <FunnelRow label="Начали играть" value={Math.round(metrics.users * 0.74)} pct={74} />
            <FunnelRow label="Использовали бесплатную попытку" value={Math.round(metrics.users * 0.58)} pct={58} />
            <FunnelRow label="Вернулись" value={Math.round(metrics.users * 0.34)} pct={34} />
            <FunnelRow label="Купили прокрутку" value={Math.round(metrics.users * 0.19)} pct={19} />
            <FunnelRow label="Забрали приз" value={Math.round(metrics.users * 0.13)} pct={13} />
          </GlassCard>
        </section>

        <section>
          <h2 className="section-label mb-2">Динамика по дням</h2>
          <GlassCard className="px-4 py-4">
            <div className="flex h-44 items-end gap-2">
              {SPINS.map((value, index) => {
                const h = Math.max(16, Math.round((value / Math.max(...SPINS)) * 100));
                return <div key={DAYS[index]} className="flex h-full flex-1 flex-col justify-end gap-1"><div className="rounded-t-xl bg-primary/35" style={{ height: `${h}%` }} /><span className="text-center text-[9px] text-muted-foreground">{DAYS[index]}</span></div>;
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <MiniStat label="Новые участники" value={format(NEW_USERS.reduce((a, b) => a + b, 0))} />
              <MiniStat label="Среднее прокруток в день" value={format(Math.round(SPINS.reduce((a, b) => a + b, 0) / SPINS.length))} />
            </div>
          </GlassCard>
        </section>

        <section>
          <h2 className="section-label mb-2">Возврат пользователей</h2>
          <GlassCard className="grid grid-cols-3 gap-2 px-4 py-4">
            <Retention label="1 день" value="42%" />
            <Retention label="3 дня" value="28%" />
            <Retention label="7 дней" value="17%" />
          </GlassCard>
        </section>

        <section>
          <h2 className="section-label mb-2">Экономика</h2>
          <GlassCard className="space-y-2 px-4 py-4">
            <ResultRow icon={Star} label="Stars в призах" value={`${format(metrics.starPrizes)} ⭐`} />
            <ResultRow icon={WalletCards} label="Выдано наград" value={format(metrics.payouts)} />
            <ResultRow icon={Gift} label="Средняя стоимость награды" value="≈ 9,4 CHF" />
            <ResultRow icon={TrendingUp} label="Оценка маржи" value={`${format(metrics.margin)} ⭐`} />
          </GlassCard>
        </section>

        <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Сейчас показатели демонстрационные. После подключения backend этот экран будет рассчитываться из реальных прокруток, участников, выплат, Stars и сезонов. Проценты воронки и возврата пользователей тоже будут считаться из фактических событий.
        </GlassCard>
      </div>
    </AppShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><Icon className="size-4 text-primary-glow" /><p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>;
}
function FunnelRow({ label, value, pct }: { label: string; value: number; pct: number }) {
  return <div className="grid grid-cols-[1fr_auto] gap-3"><div><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold">{label}</span><span className="text-[10px] text-muted-foreground">{format(value)} · {pct}%</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/30"><div className="h-full rounded-full bg-primary/45" style={{ width: `${pct}%` }} /></div></div></div>;
}
function Retention({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3 text-center"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-xl">{value}</p></div>; }
function ResultRow({ icon: Icon, label, value }: { icon: typeof Star; label: string; value: string }) { return <div className="flex items-center gap-3 border-b border-glass-border py-2.5 last:border-0"><Icon className="size-4 shrink-0 text-primary-glow" /><span className="flex-1 text-[11px] text-muted-foreground">{label}</span><span className="text-right text-sm font-semibold">{value}</span></div>; }
function MiniStat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-glass-border bg-muted/15 px-3 py-2"><p className="text-[9px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold">{value}</p></div>; }
function format(value: number) { return value.toLocaleString("ru-RU"); }
