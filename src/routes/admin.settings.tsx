import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Gift, Power, Settings2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Настройки — CRICKET BOX" }] }),
  component: AdminSettings,
});

type VeteranApi = { ok: boolean; enabled?: boolean; code?: string };
type DailyGiftApi = { ok: boolean; config?: { rewardChanceByTier: { ROOKIE: number; VETERAN: number; ELITE: number } }; code?: string };
type MechanicsApi = { ok: boolean; settings?: { enabled: Record<string, boolean>; passCount: number; failureText: string; confirm: boolean }; code?: string };

function initData() {
  if (typeof window === "undefined") return "";
  return (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim() ?? "";
}

async function request<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json() as T & { ok?: boolean; code?: string };
  if (!response.ok || data.ok !== true) throw new Error(data.code ?? "REQUEST_FAILED");
  return data;
}

function AdminSettings() {
  const [veteranEnabled, setVeteranEnabled] = useState(false);
  const [mechanicsEnabledCount, setMechanicsEnabledCount] = useState(0);
  const [mechanicsTotal, setMechanicsTotal] = useState(0);
  const [giftChance, setGiftChance] = useState({ ROOKIE: 1, VETERAN: 3, ELITE: 5 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [veteran, mechanics, dailyGift] = await Promise.all([
        request<VeteranApi>(`/api/admin/veteran?initData=${encodeURIComponent(initData())}`),
        request<MechanicsApi>(`/api/admin/mechanics?initData=${encodeURIComponent(initData())}`),
        request<DailyGiftApi>(`/api/admin/daily-gift?initData=${encodeURIComponent(initData())}`),
      ]);
      setVeteranEnabled(veteran.enabled === true);
      const enabled = Object.values(mechanics.settings?.enabled ?? {});
      setMechanicsEnabledCount(enabled.filter(Boolean).length);
      setMechanicsTotal(enabled.length);
      if (dailyGift.config?.rewardChanceByTier) setGiftChance(dailyGift.config.rewardChanceByTier);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settingsAdmin.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveDailyGift() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await request<DailyGiftApi>("/api/admin/daily-gift", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: initData(), config: { rewardChanceByTier: giftChance } }),
      });
      if (response.config?.rewardChanceByTier) setGiftChance(response.config.rewardChanceByTier);
      setMessage("Шансы Daily Gift сохранены.");
    } catch (e) {
      setError(e instanceof Error && e.message === "INVALID_DAILY_GIFT_CHANCE" ? "Шанс должен быть от 0% до 100%." : "Не удалось сохранить шансы Daily Gift.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleVeteran() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await request<VeteranApi>("/api/admin/veteran", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: initData(), enabled: !veteranEnabled }),
      });
      setVeteranEnabled(data.enabled === true);
      setMessage(data.enabled ? t("settingsAdmin.veteranEnabled") : t("settingsAdmin.veteranDisabled"));
    } catch (e) {
      setError(e instanceof Error && e.message === "OWNER_ONLY" ? t("settingsAdmin.ownerOnly") : t("settingsAdmin.updateFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title={t("settingsAdmin.title")} nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          <ArrowLeft className="size-3.5" /> {t("settingsAdmin.back")}
        </Link>

        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start gap-3">
            <div className="grid size-10 place-items-center rounded-2xl border border-primary/25 bg-primary/10">
              <Settings2 className="size-5 text-primary-glow" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("settingsAdmin.system")}</p>
              <h1 className="mt-1 font-display text-xl uppercase">{t("settingsAdmin.heading")}</h1>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t("settingsAdmin.description")}</p>
            </div>
          </div>
        </GlassCard>

        {loading ? (
          <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">{t("settingsAdmin.loading")}</GlassCard>
        ) : (
          <>
            <GlassCard className="px-4 py-4">
              <div>
                <p className="text-sm font-semibold">Шанс получить награду в Daily Gift</p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Один общий шанс получить что-нибудь, а не отдельный вес для каждого подарка. После успеха конкретная награда выбирается из общего пула.</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["ROOKIE","VETERAN","ELITE"] as const).map((tier) => (
                  <label key={tier} className="block">
                    <span className="field-label">{tier === "ROOKIE" ? "Новичок" : tier === "VETERAN" ? "Ветеран" : "Элита"}</span>
                    <div className="relative mt-1">
                      <input type="number" min={0} max={100} step="1" value={giftChance[tier]} onChange={(e) => setGiftChance((current) => ({ ...current, [tier]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))} className="admin-input pr-8 text-center" />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                    </div>
                  </label>
                ))}
              </div>
              <button disabled={saving} type="button" onClick={() => void saveDailyGift()} className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 text-[10px] font-semibold">Сохранить шанс</button>
            </GlassCard>

            <GlassCard className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{t("settingsAdmin.veteran")}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{t("settingsAdmin.veteranDescription")}</p>
                  <p className="mt-2 text-[10px] font-semibold">{veteranEnabled ? t("settingsAdmin.enabledNow") : t("settingsAdmin.disabledNow")}</p>
                </div>
                <button disabled={saving} type="button" onClick={() => void toggleVeteran()} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[10px] font-semibold">
                  <Power className="size-3.5" /> {veteranEnabled ? t("settingsAdmin.disable") : t("settingsAdmin.enable")}
                </button>
              </div>
            </GlassCard>

            <Link to="/admin/bonuses" className="block">
              <GlassCard className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-2xl border border-glass-border bg-muted/20">
                    <Gift className="size-5 text-primary-glow" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Дополнительные попытки</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Акции для всех участников в начале, середине или конце сезона.</p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </GlassCard>
            </Link>

            <Link to="/admin/mechanics" className="block">
              <GlassCard className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-2xl border border-glass-border bg-muted/20">
                    <Sparkles className="size-5 text-primary-glow" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{t("settingsAdmin.mechanics")}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{t("settingsAdmin.mechanicsDescription", { enabled: mechanicsEnabledCount, total: mechanicsTotal })}</p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </GlassCard>
            </Link>

            <GlassCard className="px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
              {t("settingsAdmin.globalNotice")}
            </GlassCard>
          </>
        )}

        {message && <GlassCard className="border-primary/25 bg-primary/5 px-4 py-3 text-[11px]">{message}</GlassCard>}
        {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
      </div>
    </AppShell>
  );
}
