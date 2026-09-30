import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { LoadingState, NoticeBar } from "@/components/kit/States";
import { useSession } from "@/store/session";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [
    { title: "Настройки — CRICKET BOX" },
    { name: "description", content: t("settings.description") },
  ] }),
  component: SettingsScreen,
});

type AdminSeasonsResponse = { ok?: boolean; seasons?: Array<{ id: string; code: string; name: string; paid_spin_price: number; paid_spin_enabled: boolean }> };

function initData() {
  return (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim() ?? "";
}

function SettingsScreen() {
  const { snapshot, setStarsAmount, setSimulateNetworkError, resetDailyFreeSpin, resetSession } = useSession();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [paidSpinPrice, setPaidSpinPrice] = useState("100");
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceMessage, setPriceMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    fetch(`/api/admin/seasons?initData=${encodeURIComponent(initData())}`)
      .then((response) => response.json() as Promise<AdminSeasonsResponse>)
      .then((data) => {
        if (!mounted) return;
        setAdmin(Boolean(data.ok));
        const current = data.seasons?.find((season) => season.id === snapshot?.season.id) ?? data.seasons?.find((season) => season.code === snapshot?.season.code) ?? data.seasons?.[0];
        if (current) setPaidSpinPrice(String(current.paid_spin_price));
      })
      .catch(() => { if (mounted) setAdmin(false); });
    return () => { mounted = false; };
  }, [snapshot?.season.code, snapshot?.season.id]);

  const runDevPaidSpin = async () => {
    try {
      const response = await fetch("/api/dev/paid-spin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: initData() }),
      });
      const data = await response.json() as { ok?: boolean; code?: string; reward?: { title?: string } };
      if (!response.ok || !data.ok) throw new Error(data.code ?? "DEV_PAID_SPIN_FAILED");
      window.alert(`Тестовая платная прокрутка: ${data.reward?.title ?? "приз"}. Фонд, выплаты, XP и Stars не изменены.`);
    } catch (error) {
      window.alert(`Тестовая прокрутка не выполнена: ${error instanceof Error ? error.message : "UNKNOWN"}`);
    }
  };

  const savePaidSpinPrice = async () => {
    if (!snapshot?.season.id) return;
    const normalized = paidSpinPrice.replace(/^0+(?=\d)/, "");
    if (normalized !== paidSpinPrice) setPaidSpinPrice(normalized);
    const value = Number(normalized);
    if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(value) || value <= 0) {
      setPriceMessage("Укажи положительное целое число Stars.");
      return;
    }
    setSavingPrice(true);
    setPriceMessage("");
    try {
      const response = await fetch("/api/admin/seasons", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: initData(), id: snapshot.season.id, paidSpinPrice: value }),
      });
      const data = await response.json() as { ok?: boolean; code?: string; season?: { paid_spin_price?: number } };
      if (!response.ok || !data.ok) throw new Error(data.code ?? "PRICE_UPDATE_FAILED");
      setPaidSpinPrice(String(data.season?.paid_spin_price ?? value));
      setPriceMessage(t("settings.saved", { price: value }));
      await resetSession();
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      setPriceMessage(code === "PAID_SPIN_PRICE_LOCKED" ? "Цена уже зафиксирована: в сезоне есть реальные платные прокрутки." : `Не сохранено: ${code}`);
    } finally {
      setSavingPrice(false);
    }
  };

  if (admin === false) return <AppShell title={t("settings.title")} back="/profile" nav={false}><NoticeBar tone="danger">{t("settings.accessDenied")}</NoticeBar><Link to="/" className="mt-4 block"><PrimaryButton fullWidth>На главную</PrimaryButton></Link></AppShell>;
  if (admin === null || !snapshot) return <AppShell title="Настройки" back="/profile" nav={false}><LoadingState label="Проверяем доступ" /></AppShell>;

  return (
    <AppShell title="Настройки" back="/profile" nav={false}>
      <GlassCard className="px-4 py-4"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t("settings.currentSeason")}</p><p className="mt-1 text-sm font-semibold">{snapshot.season.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{snapshot.season.state}</p></GlassCard>
      <GlassCard className="mt-3 space-y-3 px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t("settings.drawSettings")}</p>
        <div>
          <p className="text-sm font-semibold">{t("settings.paidPrice")}</p>
          <p className="text-[11px] text-muted-foreground">{t("settings.paidPriceDescription")}</p>
          <div className="mt-2 flex items-center gap-2">
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={paidSpinPrice} onChange={(event) => setPaidSpinPrice(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))} onBlur={() => setPaidSpinPrice((value) => value.replace(/^0+(?=\d)/, ""))} placeholder="100" className="min-w-0 flex-1 rounded-xl border border-glass-border bg-muted/20 px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
            <PrimaryButton variant="outline" loading={savingPrice} onClick={() => void savePaidSpinPrice()}>Сохранить</PrimaryButton>
          </div>
          {priceMessage && <p className={`mt-2 text-[11px] ${priceMessage.startsWith("Сохранено") ? "text-emerald-300" : "text-muted-foreground"}`}>{priceMessage}</p>}
        </div>
      </GlassCard>
      <GlassCard className="mt-3 space-y-3 px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t("settings.developerTools")}</p>
        <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Stars</p><p className="text-[11px] text-muted-foreground">{snapshot.stars.amount} / {snapshot.stars.max}</p></div><PrimaryButton variant="outline" onClick={() => void setStarsAmount(snapshot.stars.max)}>Установить {snapshot.stars.max}</PrimaryButton></div>
        <div className="flex items-center gap-3 border-t border-glass-border pt-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{t("settings.testPaidSpin")}</p><p className="text-[11px] text-muted-foreground">{t("settings.testPaidSpinDescription")}</p></div><PrimaryButton variant="outline" onClick={() => void runDevPaidSpin()}>{t("settings.test")}</PrimaryButton></div>
        <div className="flex items-center gap-3 border-t border-glass-border pt-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{t("settings.dailyAttempt")}</p><p className="text-[11px] text-muted-foreground">{t("settings.dailyAttemptDescription")}</p></div><PrimaryButton variant="outline" onClick={() => void resetDailyFreeSpin()}>{t("settings.grant")}</PrimaryButton></div>
        <div className="flex items-center gap-3 border-t border-glass-border pt-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{t("settings.networkSimulation")}</p><p className="text-[11px] text-muted-foreground">{snapshot.dev.simulateNetworkError ? t("settings.requestsFail") : t("settings.requestsWork")}</p></div><PrimaryButton variant="outline" onClick={() => void setSimulateNetworkError(!snapshot.dev.simulateNetworkError)}>{snapshot.dev.simulateNetworkError ? "Отключить" : "Включить"}</PrimaryButton></div>
      </GlassCard>
      <Link to="/admin" className="mt-4 block"><PrimaryButton fullWidth variant="outline">{t("settings.adminPanel")}</PrimaryButton></Link>
      <PrimaryButton variant="ghost" fullWidth className="mt-2" onClick={() => void resetSession()}>{t("settings.refreshSession")}</PrimaryButton>
    </AppShell>
  );
}
