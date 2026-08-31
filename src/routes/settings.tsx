import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { LoadingState, NoticeBar } from "@/components/kit/States";
import { cn } from "@/lib/utils";
import type { SeasonState } from "@/lib/types";
import { useSession } from "@/store/session";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Настройки — CRICKET BOX" },
      { name: "description", content: "Предпросмотр состояний сезона и тестовые настройки Cricket Box." },
    ],
  }),
  component: SettingsScreen,
});

const states: SeasonState[] = ["DRAFT", "SCHEDULED", "ACTIVE", "ENDING", "CLOSED", "PAYOUT", "ARCHIVED"];
const labels: Record<SeasonState, string> = {
  DRAFT: "Черновик", SCHEDULED: "Скоро старт", ACTIVE: "Активен", ENDING: "Скоро конец",
  CLOSED: "Завершён", PAYOUT: "Выдача", ARCHIVED: "В архиве",
};

function SettingsScreen() {
  const {
    snapshot,
    setSeasonState,
    setSubscribed,
    setStarsAmount,
    setSimulateNetworkError,
    resetDailyFreeSpin,
    resetSession,
  } = useSession();

  if (!snapshot)
    return (
      <AppShell title="Настройки" back="/profile" nav={false}>
        <NoticeBar tone="warning">Сессию не удалось загрузить. Отключите симуляцию ошибки сети или сбросьте тестовую сессию.</NoticeBar>
        <PrimaryButton fullWidth className="mt-4" onClick={() => void setSimulateNetworkError(false)}>Отключить ошибку сети</PrimaryButton>
        <PrimaryButton variant="ghost" fullWidth className="mt-2" onClick={() => void resetSession()}>Сбросить тестовую сессию</PrimaryButton>
        <div className="mt-4"><LoadingState label="Ожидание сессии" /></div>
      </AppShell>
    );

  return (
    <AppShell title="Настройки" back="/profile" nav={false}>
      <NoticeBar>Инструменты для предпросмотра. В рабочей версии эти значения приходят только с backend.</NoticeBar>

      <GlassCard className="mt-4 px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Состояние сезона</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {states.map((state) => (
            <button key={state} type="button" onClick={() => void setSeasonState(state)} className={cn("press rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]", snapshot.season.state === state ? "border-transparent text-primary-foreground [background-image:var(--gradient-primary)]" : "border-glass-border bg-muted/40 text-muted-foreground")}>{labels[state]}</button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="mt-3 flex items-center gap-3 px-4 py-4">
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Подписка на канал</p><p className="text-[11px] text-muted-foreground">{snapshot.user.isSubscribed ? "Подписан" : "Не подписан"}</p></div>
        <PrimaryButton variant="outline" onClick={() => void setSubscribed(!snapshot.user.isSubscribed)}>Переключить</PrimaryButton>
      </GlassCard>

      <GlassCard className="mt-3 px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Инструменты разработчика</p>

        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Stars</p><p className="text-[11px] text-muted-foreground">{snapshot.stars.amount} / {snapshot.stars.max}</p></div>
          <PrimaryButton variant="outline" onClick={() => void setStarsAmount(snapshot.stars.max)}>Установить {snapshot.stars.max}</PrimaryButton>
        </div>

        <div className="mt-3 flex items-center gap-3 border-t border-glass-border pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Бесплатная попытка сегодня</p>
            <p className="text-[11px] text-muted-foreground">Выдать дневную попытку повторно для тестирования.</p>
          </div>
          <PrimaryButton variant="outline" onClick={() => void resetDailyFreeSpin()}>Выдать</PrimaryButton>
        </div>

        <div className="mt-3 flex items-center gap-3 border-t border-glass-border pt-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Симуляция ошибки сети</p><p className="text-[11px] text-muted-foreground">{snapshot.dev.simulateNetworkError ? "Все запросы завершатся ошибкой" : "Запросы работают"}</p></div><PrimaryButton variant="outline" onClick={() => void setSimulateNetworkError(!snapshot.dev.simulateNetworkError)}>{snapshot.dev.simulateNetworkError ? "Отключить" : "Включить"}</PrimaryButton></div>
      </GlassCard>

      <PrimaryButton variant="ghost" fullWidth className="mt-4" onClick={() => void resetSession()}>Сбросить тестовую сессию</PrimaryButton>
    </AppShell>
  );
}
