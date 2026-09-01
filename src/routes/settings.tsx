import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { LoadingState, NoticeBar } from "@/components/kit/States";
import { useSession } from "@/store/session";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Настройки — CRICKET BOX" },
      { name: "description", content: "Настройки профиля и параметры Cricket Box." },
    ],
  }),
  component: SettingsScreen,
});

function SettingsScreen() {
  const {
    snapshot,
    setSubscribed,
    setStarsAmount,
    setSimulateNetworkError,
    resetDailyFreeSpin,
    resetSession,
  } = useSession();

  const runDevPaidSpin = async () => {
    const initData = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim() ?? "";
    try {
      const response = await fetch("/api/dev/paid-spin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      const data = await response.json() as { ok?: boolean; code?: string; reward?: { title?: string } };
      if (!response.ok || !data.ok) throw new Error(data.code ?? "DEV_PAID_SPIN_FAILED");
      window.alert(`Тестовая платная прокрутка готова: ${data.reward?.title ?? "приз"}. Реальные Stars не списывались.`);
      await resetSession();
    } catch (error) {
      window.alert(`Тестовая прокрутка не выполнена: ${error instanceof Error ? error.message : "UNKNOWN"}`);
    }
  };

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
      <GlassCard className="flex items-center gap-3 px-4 py-4">
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Подписка на канал</p><p className="text-[11px] text-muted-foreground">{snapshot.user.isSubscribed ? "Подписан" : "Не подписан"}</p></div>
        <PrimaryButton variant="outline" onClick={() => void setSubscribed(!snapshot.user.isSubscribed)}>Переключить</PrimaryButton>
      </GlassCard>

      <GlassCard className="mt-3 space-y-3 px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Инструменты разработчика</p>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Stars</p><p className="text-[11px] text-muted-foreground">{snapshot.stars.amount} / {snapshot.stars.max}</p></div>
          <PrimaryButton variant="outline" onClick={() => void setStarsAmount(snapshot.stars.max)}>Установить {snapshot.stars.max}</PrimaryButton>
        </div>

        <div className="flex items-center gap-3 border-t border-glass-border pt-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Тестовая платная прокрутка</p><p className="text-[11px] text-muted-foreground">Полный spin → приз → payout, без списания Stars.</p></div>
          <PrimaryButton variant="outline" onClick={() => void runDevPaidSpin()}>Тест</PrimaryButton>
        </div>

        <div className="flex items-center gap-3 border-t border-glass-border pt-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Бесплатная попытка сегодня</p><p className="text-[11px] text-muted-foreground">Выдать дневную попытку повторно для тестирования.</p></div>
          <PrimaryButton variant="outline" onClick={() => void resetDailyFreeSpin()}>Выдать</PrimaryButton>
        </div>

        <div className="flex items-center gap-3 border-t border-glass-border pt-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Симуляция ошибки сети</p><p className="text-[11px] text-muted-foreground">{snapshot.dev.simulateNetworkError ? "Все запросы завершатся ошибкой" : "Запросы работают"}</p></div><PrimaryButton variant="outline" onClick={() => void setSimulateNetworkError(!snapshot.dev.simulateNetworkError)}>{snapshot.dev.simulateNetworkError ? "Отключить" : "Включить"}</PrimaryButton></div>
      </GlassCard>

      <Link to="/admin" className="mt-4 block"><PrimaryButton fullWidth variant="outline">Открыть админ-панель</PrimaryButton></Link>
      <PrimaryButton variant="ghost" fullWidth className="mt-2" onClick={() => void resetSession()}>Сбросить тестовую сессию</PrimaryButton>
    </AppShell>
  );
}
