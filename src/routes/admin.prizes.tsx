import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, Minus, Plus, Save, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import type { RewardKind } from "@/lib/types";

type Season = {
  id: string;
  code: string;
  name: string;
  state: string;
  paid_spin_price: number;
  daily_free_spin: boolean;
};

type Prize = {
  id: string;
  season_id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  amount: string;
  unit_cost: string;
  currency: string | null;
  quantity_total: number;
  quantity_remaining: number;
};

type Api<T> = { ok: boolean; seasons?: T; prizes?: T; code?: string; season?: T; prize?: T };

export const Route = createFileRoute("/admin/prizes")({
  head: () => ({ meta: [{ title: "Призовой фонд — CRICKET BOX" }] }),
  component: AdminPrizes,
});

function initData() {
  if (typeof window === "undefined") return "";
  const tg = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return tg?.WebApp?.initData?.trim() ?? "";
}

async function getJson<T>(url: string) {
  const response = await fetch(url);
  const data = (await response.json()) as Api<T>;
  if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
  return data;
}

async function postJson<T>(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, initData: initData() }),
  });
  const data = (await response.json()) as Api<T>;
  if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
  return data;
}

function AdminPrizes() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [newPrize, setNewPrize] = useState({ title: "", subtitle: "", kind: "STARS", amount: 20, unitCost: 0, quantity: 1 });

  const selectedSeason = useMemo(() => seasons.find((x) => x.id === seasonId), [seasons, seasonId]);
  const isSelectedSeasonLive = selectedSeason?.state === "ACTIVE" || selectedSeason?.state === "ENDING";
  const total = useMemo(() => prizes.reduce((sum, p) => sum + Math.max(0, p.quantity_total), 0), [prizes]);
  const remaining = useMemo(() => prizes.reduce((sum, p) => sum + Math.max(0, p.quantity_remaining), 0), [prizes]);

  async function loadSeasons() {
    setLoading(true);
    setError("");
    try {
      const data = await getJson<Season[]>(`/api/admin/seasons?initData=${encodeURIComponent(initData())}`);
      const list = data.seasons ?? [];
      setSeasons(list);
      setSeasonId((current) => {
        if (current && list.some((x) => x.id === current)) return current;
        const live = list.find((x) => x.state === "ACTIVE") ?? list.find((x) => x.state === "ENDING");
        return live?.id ?? list[0]?.id ?? "";
      });
    } catch {
      setError("Не удалось загрузить сезоны.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPrizes(id: string) {
    if (!id) { setPrizes([]); return; }
    setError("");
    try {
      const data = await getJson<Prize[]>(`/api/admin/prizes?seasonId=${encodeURIComponent(id)}&initData=${encodeURIComponent(initData())}`);
      setPrizes(data.prizes ?? []);
    } catch {
      setError("Не удалось загрузить призовой фонд.");
      setPrizes([]);
    }
  }

  useEffect(() => { void loadSeasons(); }, []);
  useEffect(() => { void loadPrizes(seasonId); }, [seasonId]);

  function patchPrize(id: string, patch: Partial<Prize>) {
    setPrizes((all) => all.map((p) => p.id === id ? { ...p, ...patch } : p));
  }

  async function savePrize(prize: Prize) {
    setSaving(prize.id);
    setError("");
    try {
      await postJson<Prize>("/api/admin/prizes", {
        id: prize.id,
        seasonId: prize.season_id,
        kind: prize.kind,
        title: prize.title,
        subtitle: prize.subtitle,
        amount: Number(prize.amount) || 0,
        unitCost: Number(prize.unit_cost) || 0,
        currency: prize.currency,
        quantityTotal: Math.max(0, Number(prize.quantity_total) || 0),
        quantityRemaining: Math.min(Math.max(0, Number(prize.quantity_remaining) || 0), Math.max(0, Number(prize.quantity_total) || 0)),
      });
      await loadPrizes(seasonId);
    } catch {
      setError("Не удалось сохранить приз.");
    } finally {
      setSaving(null);
    }
  }

  async function addPrize() {
    if (!seasonId || !newPrize.title.trim()) {
      setError("Выберите сезон и укажите название награды.");
      return;
    }
    setSaving("new");
    setError("");
    try {
      await postJson<Prize>("/api/admin/prizes", {
        seasonId,
        kind: newPrize.kind as RewardKind,
        title: newPrize.title.trim(),
        subtitle: newPrize.subtitle.trim() || null,
        amount: Number(newPrize.amount) || 0,
        unitCost: Number(newPrize.unitCost) || 0,
        quantityTotal: Math.max(0, Number(newPrize.quantity) || 0),
        quantityRemaining: Math.max(0, Number(newPrize.quantity) || 0),
      });
      setNewPrize({ title: "", subtitle: "", kind: "STARS", amount: 20, unitCost: 0, quantity: 1 });
      await loadPrizes(seasonId);
    } catch {
      setError("Не удалось добавить награду.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <AppShell title="Призовой фонд" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>

        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Управление наградами</p><h1 className="mt-1 font-display text-xl uppercase">Призовой фонд</h1></div>
            <button type="button" onClick={() => void loadSeasons()} className="grid size-9 place-items-center rounded-xl border border-glass-border bg-muted/10"><RefreshCw className="size-4" /></button>
          </div>
          <div className="mt-4">
            <label className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Сезон</label>
            <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="admin-input mt-1 w-full">
              {seasons.length === 0 && <option value="">Нет сезонов</option>}
              {seasons.map((season) => <option key={season.id} value={season.id}>{season.code} · {season.state}</option>)}
            </select>
            {selectedSeason && !isSelectedSeasonLive && (
              <p className="mt-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-200">
                Сейчас игроки крутят только активный сезон. Для этого экрана выбран {selectedSeason.code} со статусом {selectedSeason.state}. Его призы не участвуют в прокрутке, пока сезон не станет ACTIVE/ENDING.
              </p>
            )}
            {selectedSeason && isSelectedSeasonLive && (
              <p className="mt-2 text-[10px] text-emerald-300">Этот призовой фонд сейчас используется игроками для прокруток.</p>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2"><Metric label="Всего" value={String(total)} /><Metric label="Осталось" value={String(remaining)} /><Metric label="Цена прокрутки" value={selectedSeason ? `${selectedSeason.paid_spin_price} ⭐` : "—"} /></div>
        </GlassCard>

        {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}

        <GlassCard className="space-y-3 px-3 py-3">
          <div><p className="text-sm font-semibold">Добавить награду</p><p className="text-[10px] text-muted-foreground">Сохраняется сразу в PostgreSQL.</p></div>
          <input value={newPrize.title} onChange={(e) => setNewPrize((x) => ({ ...x, title: e.target.value }))} placeholder="Название" className="admin-input w-full" />
          <input value={newPrize.subtitle} onChange={(e) => setNewPrize((x) => ({ ...x, subtitle: e.target.value }))} placeholder="Описание (необязательно)" className="admin-input w-full" />
          <div className="grid grid-cols-2 gap-2"><input type="number" min={0} value={newPrize.amount} onChange={(e) => setNewPrize((x) => ({ ...x, amount: Number(e.target.value) || 0 }))} placeholder="Размер" className="admin-input" /><input type="number" min={0} value={newPrize.quantity} onChange={(e) => setNewPrize((x) => ({ ...x, quantity: Number(e.target.value) || 0 }))} placeholder="Количество" className="admin-input" /></div>
          <button disabled={saving === "new"} type="button" onClick={() => void addPrize()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs font-semibold disabled:opacity-50"><Plus className="size-4" /> Добавить</button>
        </GlassCard>

        {loading ? <GlassCard className="px-4 py-6 text-center text-xs text-muted-foreground">Загрузка…</GlassCard> : prizes.length === 0 ? <GlassCard className="px-4 py-6 text-center text-xs text-muted-foreground">У этого сезона пока нет призов.</GlassCard> : <section className="space-y-2.5">
          {prizes.map((prize) => (
            <GlassCard key={prize.id} className="space-y-3 px-3.5 py-3.5">
              <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><input value={prize.title} onChange={(e) => patchPrize(prize.id, { title: e.target.value })} className="admin-input w-full text-sm font-semibold" /><input value={prize.subtitle ?? ""} onChange={(e) => patchPrize(prize.id, { subtitle: e.target.value })} placeholder="Описание" className="admin-input mt-2 w-full text-[10px]" /></div><span className="rounded-full border border-glass-border px-2 py-1 text-[9px]">{prize.kind}</span></div>
              <div className="grid grid-cols-2 gap-2"><Field label="Размер" value={prize.amount} onChange={(value) => patchPrize(prize.id, { amount: value })} /><Field label="Всего" value={String(prize.quantity_total)} onChange={(value) => patchPrize(prize.id, { quantity_total: Math.max(0, Number(value) || 0) })} type="number" /><Field label="Осталось" value={String(prize.quantity_remaining)} onChange={(value) => patchPrize(prize.id, { quantity_remaining: Math.max(0, Math.min(Number(prize.quantity_total) || 0, Number(value) || 0)) })} type="number" /><Field label="Себестоимость" value={prize.unit_cost} onChange={(value) => patchPrize(prize.id, { unit_cost: value })} /></div>
              <div className="flex items-center justify-between rounded-xl border border-glass-border bg-muted/10 px-3 py-2.5"><div className="flex items-center gap-1"><button type="button" onClick={() => patchPrize(prize.id, { quantity_remaining: Math.max(0, prize.quantity_remaining - 1) })} className="grid size-8 place-items-center rounded-lg border border-glass-border"><Minus className="size-3" /></button><span className="w-12 text-center text-xs font-semibold">{prize.quantity_remaining}</span><button type="button" onClick={() => patchPrize(prize.id, { quantity_remaining: Math.min(prize.quantity_total, prize.quantity_remaining + 1) })} className="grid size-8 place-items-center rounded-lg border border-glass-border"><Plus className="size-3" /></button></div><button disabled={saving === prize.id} type="button" onClick={() => void savePrize(prize)} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-semibold disabled:opacity-50"><Save className="size-3.5" /> Сохранить</button></div>
            </GlassCard>
          ))}
        </section>}
      </div>
    </AppShell>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label><span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="admin-input mt-1 w-full" /></label>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>; }
