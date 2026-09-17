import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Power, Settings2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Настройки — CRICKET BOX" }] }),
  component: AdminSettings,
});

type VeteranApi = { ok: boolean; enabled?: boolean; code?: string };
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [veteran, mechanics] = await Promise.all([
        request<VeteranApi>(`/api/admin/veteran?initData=${encodeURIComponent(initData())}`),
        request<MechanicsApi>(`/api/admin/mechanics?initData=${encodeURIComponent(initData())}`),
      ]);
      setVeteranEnabled(veteran.enabled === true);
      const enabled = Object.values(mechanics.settings?.enabled ?? {});
      setMechanicsEnabledCount(enabled.filter(Boolean).length);
      setMechanicsTotal(enabled.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить настройки.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
      setMessage(data.enabled ? "Бонусы ветеранов включены." : "Бонусы ветеранов выключены.");
    } catch (e) {
      setError(e instanceof Error && e.message === "OWNER_ONLY" ? "Только владелец может менять бонусы ветеранов." : "Не удалось изменить настройку.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Настройки" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          <ArrowLeft className="size-3.5" /> Админ-панель
        </Link>

        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start gap-3">
            <div className="grid size-10 place-items-center rounded-2xl border border-primary/25 bg-primary/10">
              <Settings2 className="size-5 text-primary-glow" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Системные настройки</p>
              <h1 className="mt-1 font-display text-xl uppercase">Настройки CRICKET BOX</h1>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Здесь собраны настройки, которые действуют между сезонами. Сезонная экономика и призы остаются в своих разделах.</p>
            </div>
          </div>
        </GlassCard>

        {loading ? (
          <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Загрузка настроек…</GlassCard>
        ) : (
          <>
            <GlassCard className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Бонусы ветеранов</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Отдельная V2-система бонусных попыток для пользователей с историей нескольких завершённых сезонов.</p>
                  <p className="mt-2 text-[10px] font-semibold">{veteranEnabled ? "Сейчас включены" : "Сейчас выключены"}</p>
                </div>
                <button disabled={saving} type="button" onClick={() => void toggleVeteran()} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[10px] font-semibold">
                  <Power className="size-3.5" /> {veteranEnabled ? "Выключить" : "Включить"}
                </button>
              </div>
            </GlassCard>

            <Link to="/admin/mechanics" className="block">
              <GlassCard className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-2xl border border-glass-border bg-muted/20">
                    <Sparkles className="size-5 text-primary-glow" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Развлекательные механики</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{mechanicsEnabledCount} из {mechanicsTotal} механик включено · передача подарков и мини-игры</p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </GlassCard>
            </Link>

            <GlassCard className="px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
              Планировщик экономики, цены платной прокрутки, призовой фонд и сезонные даты намеренно не дублируются здесь, чтобы не создавать два источника правды.
            </GlassCard>
          </>
        )}

        {message && <GlassCard className="border-primary/25 bg-primary/5 px-4 py-3 text-[11px]">{message}</GlassCard>}
        {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
      </div>
    </AppShell>
  );
}
