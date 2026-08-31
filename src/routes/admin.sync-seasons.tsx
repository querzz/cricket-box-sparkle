import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Database, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

const STORAGE_KEY = "cricket-box:admin-seasons:v1";

type LocalSeason = {
  id: string;
  code: string;
  state?: string;
  days?: number;
  paidPrice?: number;
  dailyFree?: boolean;
};

type Season = { id: string; code: string; name: string; state: string };
type Api = { ok: boolean; seasons?: Season[]; code?: string };

function initData() {
  if (typeof window === "undefined") return "";
  const tg = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return tg?.WebApp?.initData?.trim() ?? "";
}

async function request(method: string, body?: Record<string, unknown>) {
  const response = await fetch("/api/admin/seasons", {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify({ ...body, initData: initData() }) } : {}),
  });
  const data = (await response.json()) as Api;
  if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
  return data;
}

export const Route = createFileRoute("/admin/sync-seasons")({
  head: () => ({ meta: [{ title: "Синхронизация сезонов — CRICKET BOX" }] }),
  component: SyncSeasons,
});

function SyncSeasons() {
  const [localCount, setLocalCount] = useState(0);
  const [dbCount, setDbCount] = useState(0);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    setError("");
    try {
      const local = typeof window === "undefined" ? [] : readLocal();
      setLocalCount(local.length);
      const data = await request("GET");
      setDbCount(data.seasons?.length ?? 0);
    } catch {
      setError("Не удалось получить состояние сезонов.");
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function sync() {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const local = readLocal();
      const db = await request("GET");
      const existingCodes = new Set((db.seasons ?? []).map((s) => s.code));
      let imported = 0;
      for (const season of local) {
        if (!season.code?.trim() || existingCodes.has(season.code.trim())) continue;
        await request("POST", {
          code: season.code.trim(),
          name: season.code.trim(),
          paidSpinPrice: Math.max(1, Number(season.paidPrice ?? 100)),
          dailyFreeSpin: season.dailyFree !== false,
        });
        existingCodes.add(season.code.trim());
        imported += 1;
      }
      await refresh();
      setMessage(imported ? `Импортировано сезонов: ${imported}.` : "Новых сезонов для импорта нет.");
    } catch {
      setError("Не удалось синхронизировать сезоны.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <AppShell title="Синхронизация сезонов" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
        <GlassCard className="px-4 py-5" glow>
          <div className="flex items-start gap-3"><div className="grid size-10 place-items-center rounded-xl border border-primary/30 bg-primary/10"><Database className="size-5 text-primary-glow" /></div><div><p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Перенос данных</p><h1 className="mt-1 font-display text-xl uppercase">Сезоны → PostgreSQL</h1><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Одноразово переносит старые сезоны из localStorage в базу. Уже существующие сезоны по тому же коду не дублируются.</p></div></div>
        </GlassCard>
        <div className="grid grid-cols-2 gap-2"><Metric label="В браузере" value={String(localCount)} /><Metric label="В PostgreSQL" value={String(dbCount)} /></div>
        <GlassCard className="px-3 py-3"><button disabled={working || localCount === 0} type="button" onClick={() => void sync()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-3 text-xs font-semibold disabled:opacity-50"><RefreshCw className={`size-4 ${working ? "animate-spin" : ""}`} /> {working ? "Синхронизируем…" : "Синхронизировать сезоны"}</button><button type="button" onClick={() => void refresh()} className="mt-2 w-full rounded-xl border border-glass-border px-3 py-2 text-[10px] text-muted-foreground">Обновить счётчики</button></GlassCard>
        {message && <GlassCard className="border-primary/25 bg-primary/5 px-4 py-3 text-[11px]">{message}</GlassCard>}
        {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
        <GlassCard className="px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">После синхронизации зайди в «Призовой фонд» — в селекте должны появиться сезоны из PostgreSQL.</GlassCard>
      </div>
    </AppShell>
  );
}

function readLocal(): LocalSeason[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? data.filter((x): x is LocalSeason => Boolean(x && typeof x === "object" && typeof (x as LocalSeason).code === "string")) : [];
  } catch {
    return [];
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>;
}
