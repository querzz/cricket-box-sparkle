import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Minus, Plus, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";

export const Route = createFileRoute("/admin/economics")({
  head: () => ({
    meta: [
      { title: "Экономика — CRICKET BOX" },
      { name: "description", content: "Планировщик экономики для настройки и проверки сезона." },
    ],
  }),
  component: EconomicsScreen,
});

type Planner = {
  participants: number;
  activity: number;
  days: number;
  paidConversion: number;
  paidPrice: number;
  freeSpinsPerDay: number;
  starsLiability: number;
  cashCost: number;
  premiumQuantity: number;
  premiumUnitCost: number;
  giftLiability: number;
};

const baseline: Planner = {
  participants: 150,
  activity: 0.5,
  days: 14,
  paidConversion: 0.25,
  paidPrice: 100,
  freeSpinsPerDay: 1,
  starsLiability: 670,
  cashCost: 500,
  premiumQuantity: 1,
  premiumUnitCost: 18,
  giftLiability: 2250,
};

function EconomicsScreen() {
  const [p, setP] = useState(baseline);
  const calc = useMemo(() => {
    const eligible = Math.max(0, Math.round(p.participants * p.activity));
    const free = eligible * p.days * p.freeSpinsPerDay;
    const paid = Math.round((free / Math.max(1, 1 - p.paidConversion)) * p.paidConversion);
    const total = free + paid;
    const gross = paid * p.paidPrice;
    const prizeCostStars = p.starsLiability + p.giftLiability;
    const estimatedPayoutCost = p.cashCost + p.premiumQuantity * p.premiumUnitCost;
    const breakEvenPaid = Math.max(0, Math.ceil(prizeCostStars / Math.max(1, p.paidPrice)));
    const marginStars = gross - prizeCostStars;
    const breakEvenConversion = paid === 0 ? 1 : Math.min(1, breakEvenPaid / Math.max(1, free));
    const status = marginStars >= prizeCostStars * 0.25 ? "HEALTHY" : marginStars >= 0 ? "LOW MARGIN" : "LOSS RISK";
    return { eligible, free, paid, total, gross, prizeCostStars, estimatedPayoutCost, breakEvenPaid, marginStars, breakEvenConversion, status };
  }, [p]);

  return (
    <AppShell title="Экономика" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>

        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Планировщик экономики</p><h1 className="mt-1 font-display text-xl uppercase">Экономика сезона</h1></div><span className={statusClass(calc.status)}>{calc.status === "HEALTHY" ? "🟢 Выгодно" : calc.status === "LOW MARGIN" ? "🟡 Низкая маржа" : "🔴 Риск убытка"}</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4"><Metric label="Ожидаемые бесплатные" value={calc.free.toLocaleString("ru-RU")} /><Metric label="Ожидаемые платные" value={calc.paid.toLocaleString("ru-RU")} /><Metric label="Всего прокруток" value={calc.total.toLocaleString("ru-RU")} /><Metric label="Оборот Stars" value={`${calc.gross.toLocaleString("ru-RU")} ⭐`} /></div>
        </GlassCard>

        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="section-label">Параметры</h2><button type="button" onClick={() => setP(baseline)} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><RotateCcw className="size-3" /> Сбросить</button></div>
          <GlassCard className="space-y-4 px-4 py-4">
            <NumberControl label="Участники" value={p.participants} min={1} step={10} onChange={(value) => setP({ ...p, participants: value })} suffix="чел." />
            <NumberControl label="Активность" value={Math.round(p.activity * 100)} min={10} max={100} step={5} onChange={(value) => setP({ ...p, activity: value / 100 })} suffix="%" />
            <NumberControl label="Длительность" value={p.days} min={1} step={1} onChange={(value) => setP({ ...p, days: value })} suffix="дней" />
            <NumberControl label="Конверсия в платные" value={Math.round(p.paidConversion * 100)} min={0} max={100} step={5} onChange={(value) => setP({ ...p, paidConversion: value / 100 })} suffix="%" />
            <NumberControl label="Цена платной прокрутки" value={p.paidPrice} min={1} step={5} onChange={(value) => setP({ ...p, paidPrice: value })} suffix="⭐" />
            <NumberControl label="Бесплатных прокруток / день" value={p.freeSpinsPerDay} min={0} max={3} step={1} onChange={(value) => setP({ ...p, freeSpinsPerDay: value })} suffix="шт." />
          </GlassCard>
        </section>

        <section>
          <h2 className="section-label mb-2">Обязательства</h2>
          <GlassCard className="space-y-3 px-4 py-4">
            <NumberControl label="Обязательства по Stars-призам" value={p.starsLiability} min={0} step={10} onChange={(value) => setP({ ...p, starsLiability: value })} suffix="⭐" />
            <NumberControl label="Обязательства Daily Gift" value={p.giftLiability} min={0} step={25} onChange={(value) => setP({ ...p, giftLiability: value })} suffix="⭐" />
            <NumberControl label="Денежные призы" value={p.cashCost} min={0} step={100} onChange={(value) => setP({ ...p, cashCost: value })} suffix="грн" />
            <NumberControl label="Telegram Premium" value={p.premiumQuantity} min={0} step={1} onChange={(value) => setP({ ...p, premiumQuantity: value })} suffix="шт." />
            <NumberControl label="Цена 1 Premium" value={p.premiumUnitCost} min={0} step={1} onChange={(value) => setP({ ...p, premiumUnitCost: value })} suffix="CHF" />
          </GlassCard>
        </section>

        <section>
          <h2 className="section-label mb-2">Результат</h2>
          <GlassCard className="space-y-2 px-4 py-4">
            <ResultRow label="Ожидаемый оборот" value={`${calc.gross.toLocaleString("ru-RU")} ⭐`} />
            <ResultRow label="Stars liability" value={`${calc.prizeCostStars.toLocaleString("ru-RU")} ⭐`} />
            <ResultRow label="Примерная маржа по Stars" value={`${calc.marginStars.toLocaleString("ru-RU")} ⭐`} />
            <ResultRow label="Безубыточность, платных прокруток" value={`${calc.breakEvenPaid}`} />
            <ResultRow label="Безубыточность, конверсия" value={`${Math.round(calc.breakEvenConversion * 100)}%`} />
            <ResultRow label="Материальные затраты" value={`${calc.estimatedPayoutCost.toLocaleString("ru-RU")} (грн + CHF)`} />
            <ResultRow label="Premium" value={`${p.premiumQuantity} шт. × ${p.premiumUnitCost} CHF`} />
            <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">Планировщик показывает прогноз. Стоимость закупки призов, реальные платежи Telegram и резерв уточняются перед запуском сезона.</div>
          </GlassCard>
        </section>

        <PrimaryButton fullWidth onClick={() => alert("Расчёт сохранится вместе с настройками выбранного сезона на этапе подключения backend.")}>Сохранить расчёт</PrimaryButton>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>; }
function ResultRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 border-b border-glass-border py-2 last:border-0"><span className="text-[11px] text-muted-foreground">{label}</span><span className="text-right text-sm font-semibold tabular-nums">{value}</span></div>; }
function statusClass(status: string) { return status === "HEALTHY" ? "rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold" : status === "LOW MARGIN" ? "rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[10px] font-semibold" : "rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[10px] font-semibold"; }
function NumberControl({ label, value, min = 0, max = 100000, step = 1, suffix, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; suffix: string; onChange: (value: number) => void }) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Number.isFinite(next) ? next : min));
  return <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{label}</p></div><div className="flex items-center gap-1 rounded-xl border border-glass-border bg-muted/20 p-1"><button type="button" onClick={() => onChange(clamp(value - step))} aria-label={`Уменьшить: ${label}`} className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted/40"><Minus className="size-3" /></button><input aria-label={label} type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(clamp(Number(e.target.value)))} className="w-20 bg-transparent text-center text-sm font-semibold outline-none" /><button type="button" onClick={() => onChange(clamp(value + step))} aria-label={`Увеличить: ${label}`} className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted/40"><Plus className="size-3" /></button></div><span className="w-14 text-[10px] text-muted-foreground">{suffix}</span></div>;
}
