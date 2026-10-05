import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  RefreshCw,
  Repeat2,
  RotateCw,
  Target,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/statistics")({
  head: () => ({ meta: [{ title: "Статистика — CRICKET BOX" }] }),
  component: AdminStatistics,
});

type Period = "current" | "all";

type Metrics = {
  participants: number;
  spins: number;
  attemptedSpins: number;
  failedSpins: number;
  freeSpins: number;
  paidSpins: number;
  wins: number;
  starsRevenue: number;
  starsPrizeValue: number;
  pendingPayouts: number;
  withdrawalRequests: number;
  completedWithdrawals: number;
  dailyActiveToday: number;
  funnel: {
    registeredUsers: number;
    participants: number;
    participantRate: number;
    spinCompletionRate: number;
    winnerRate: number;
    paidUsers: number;
    paidConversionRate: number;
    repeatUsers: number;
    repeatRate: number;
  };
  retention: {
    d1Eligible: number;
    d1Retained: number;
    d1Rate: number;
    d7Eligible: number;
    d7Retained: number;
    d7Rate: number;
  };
};

type Stats = {
  ok: boolean;
  metrics: Metrics;
  days: number;
  daily: {
    users: number[];
    userLabels: string[];
    spins: number[];
    freeSpins: number[];
    paidSpins: number[];
    bonusSpins: number[];
  };
  seasonId: string | null;
};

function initData() {
  if (typeof window === "undefined") return "";
  return (
    (
      window as Window & {
        Telegram?: { WebApp?: { initData?: string } };
      }
    ).Telegram?.WebApp?.initData?.trim() ?? ""
  );
}

async function loadStats(period: Period, days = 7) {
  const response = await fetch(
    `/api/admin/statistics?scope=${period}&days=${days}&initData=${encodeURIComponent(initData())}`,
  );
  const data = (await response.json()) as Stats & { code?: string };
  if (!response.ok || !data.ok) {
    throw new Error(data.code ?? "STATISTICS_FAILED");
  }
  return data;
}

function fmt(value: number) {
  return value.toLocaleString("ru-RU");
}

function pct(value: number) {
  return `${(value * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-glass-border bg-muted/15 px-2 py-2 text-center">
      <p className="text-[8px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{fmt(value)}</p>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3">
      <Icon className="size-4 text-primary-glow" />
      <p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-glass-border py-2.5 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function AdminStatistics() {
  const [period, setPeriod] = useState<Period>("current");
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (nextPeriod: Period, nextDays: number) => {
    setLoading(true);
    setError("");

    try {
      setData(await loadStats(nextPeriod, nextDays));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить статистику.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(period, days);
  }, [days, period, refresh]);

  const metrics = data?.metrics;
  const maxSpin = Math.max(1, ...(data?.daily.spins ?? [1]));

  return (
    <AppShell title="Статистика" nav={false}>
      <div className="space-y-4 pb-8">
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Админ-панель
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPeriod("current")}
              className={
                period === "current"
                  ? "rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[10px] font-semibold"
                  : "rounded-full border border-glass-border bg-muted/10 px-3 py-1.5 text-[10px] text-muted-foreground"
              }
            >
              Текущий сезон
            </button>
            <button
              type="button"
              onClick={() => setPeriod("all")}
              className={
                period === "all"
                  ? "rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[10px] font-semibold"
                  : "rounded-full border border-glass-border bg-muted/10 px-3 py-1.5 text-[10px] text-muted-foreground"
              }
            >
              Все сезоны
            </button>
          </div>

          <div className="flex gap-1.5">
            {[1, 7, 30].map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => setDays(value)}
                className={
                  days === value
                    ? "rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[10px] font-semibold"
                    : "rounded-full border border-glass-border bg-muted/10 px-2.5 py-1.5 text-[10px] text-muted-foreground"
                }
              >
                {value === 1 ? "Сегодня" : `${value} дней`}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void refresh(period, days)}
            aria-label="Обновить"
            className="grid size-9 place-items-center rounded-xl border border-glass-border"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>

        {error && (
          <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">
            {error}
          </GlassCard>
        )}

        {loading && !data ? (
          <GlassCard className="px-4 py-7 text-center text-xs text-muted-foreground">
            Загрузка реальной статистики…
          </GlassCard>
        ) : metrics ? (
          <>
            <GlassCard className="px-4 py-4" glow>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Данные PostgreSQL
                  </p>
                  <h1 className="mt-1 font-display text-xl uppercase">Статистика</h1><p className="mt-1 text-[10px] text-primary-glow">Основные цифры считаются за выбранный период: {days === 1 ? "сегодня" : `последние ${days} дней`}.</p>
                </div>
                <BarChart3 className="size-5 text-primary-glow" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                <Metric icon={Users} label="Участники" value={fmt(metrics.participants)} />
                <Metric icon={RotateCw} label="Прокрутки" value={fmt(metrics.spins)} />
                <Metric
                  icon={WalletCards}
                  label="Оплачено Telegram"
                  value={`${fmt(metrics.starsRevenue)} ⭐`}
                />
                <Metric
                  icon={TrendingUp}
                  label="Награды Stars"
                  value={`${fmt(metrics.starsPrizeValue)} ⭐`}
                />
              </div>
            </GlassCard>

            <GlassCard className="space-y-2 px-4 py-4">
              <Row label="Бесплатные прокрутки" value={fmt(metrics.freeSpins)} />
              <Row label="Платные прокрутки" value={fmt(metrics.paidSpins)} />
              <Row label="Неуспешные попытки" value={fmt(metrics.failedSpins)} />
              <Row label="Выигрыши" value={fmt(metrics.wins)} />
              <Row label="Сегодня активных" value={fmt(metrics.dailyActiveToday)} />
              <Row label="Заявок на вывод" value={fmt(metrics.withdrawalRequests)} />
              <Row label="Выводов выдано" value={fmt(metrics.completedWithdrawals)} />
              <Row label="Ожидают выплат" value={fmt(metrics.pendingPayouts)} />
            </GlassCard>

            <section>
              <h2 className="section-label mb-2">Воронка</h2>
              <GlassCard className="space-y-2 px-4 py-4">
                <div className="grid grid-cols-2 gap-2">
                  <Metric
                    icon={Users}
                    label="Зарегистрированы"
                    value={fmt(metrics.funnel.registeredUsers)}
                  />
                  <Metric
                    icon={Target}
                    label="Участники"
                    value={`${fmt(metrics.funnel.participants)} · ${pct(metrics.funnel.participantRate)}`}
                  />
                  <Metric
                    icon={RotateCw}
                    label="Завершение спинов"
                    value={pct(metrics.funnel.spinCompletionRate)}
                  />
                  <Metric
                    icon={TrendingUp}
                    label="Конверсия в выигрыш"
                    value={pct(metrics.funnel.winnerRate)}
                  />
                  <Metric
                    icon={WalletCards}
                    label="Платящих"
                    value={`${fmt(metrics.funnel.paidUsers)} · ${pct(metrics.funnel.paidConversionRate)}`}
                  />
                  <Metric
                    icon={Repeat2}
                    label="Повторные"
                    value={`${fmt(metrics.funnel.repeatUsers)} · ${pct(metrics.funnel.repeatRate)}`}
                  />
                </div>
              </GlassCard>
            </section>

            <section>
              <h2 className="section-label mb-2">Retention</h2>
              <GlassCard className="space-y-1 px-4 py-4">
                <Row
                  label={`D1 · ${fmt(metrics.retention.d1Retained)} из ${fmt(metrics.retention.d1Eligible)}`}
                  value={pct(metrics.retention.d1Rate)}
                />
                <Row
                  label={`D7 · ${fmt(metrics.retention.d7Retained)} из ${fmt(metrics.retention.d7Eligible)}`}
                  value={pct(metrics.retention.d7Rate)}
                />
                <p className="pt-2 text-[10px] leading-relaxed text-muted-foreground">
                  Когорты строятся от первого завершённого спина пользователя. Незрелые D1/D7 когорты
                  не включаются в denominator.
                </p>
              </GlassCard>
            </section>

            <section>
              <h2 className="section-label mb-2">
                {days === 1 ? "Прокрутки сегодня" : `Прокрутки за ${days} дней`}
              </h2>
              <GlassCard className="space-y-3 px-4 py-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                      Всего за период
                    </p>
                    <p className="font-display text-xl">
                      {data!.daily.spins.reduce((sum, value) => sum + value, 0)}
                    </p>
                  </div>
                  <div className="text-right text-[9px] text-muted-foreground">
                    Сегодня:{" "}
                    <b className="text-foreground">
                      {data!.daily.spins[data!.daily.spins.length - 1] ?? 0}
                    </b>
                  </div>
                </div>

                <div className="flex h-44 items-end gap-2">
                  {data!.daily.spins.map((value, index) => (
                    <div
                      key={`${data!.daily.userLabels[index]}-${index}`}
                      className="flex h-full flex-1 flex-col justify-end gap-1"
                    >
                      <div
                        className="rounded-t-xl bg-primary/35"
                        style={{
                          height: `${Math.max(4, Math.round((value / maxSpin) * 100))}%`,
                        }}
                      />
                      <span className="text-center text-[9px] text-muted-foreground">
                        {data!.daily.userLabels[index]}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <Mini
                    label="Бесплатные"
                    value={data!.daily.freeSpins.reduce((sum, value) => sum + value, 0)}
                  />
                  <Mini
                    label="Платные"
                    value={data!.daily.paidSpins.reduce((sum, value) => sum + value, 0)}
                  />
                  <Mini
                    label="Бонусные"
                    value={data!.daily.bonusSpins.reduce((sum, value) => sum + value, 0)}
                  />
                </div>
              </GlassCard>
            </section>

            <section>
              <h2 className="section-label mb-2">Новые пользователи</h2>
              <GlassCard className="px-4 py-4">
                <div className="grid grid-cols-7 gap-1.5">
                  {data!.daily.users.map((value, index) => (
                    <div
                      key={`${data!.daily.userLabels[index]}-u`}
                      className="rounded-xl border border-glass-border bg-muted/15 px-1 py-2 text-center"
                    >
                      <p className="text-[9px] text-muted-foreground">
                        {data!.daily.userLabels[index]}
                      </p>
                      <p className="mt-1 text-sm font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </section>

            <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
              Все числа выше рассчитаны из PostgreSQL и Telegram payment records.
            </GlassCard>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
