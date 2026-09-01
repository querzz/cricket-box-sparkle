import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, Minus, Plus, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import type { RewardKind } from "@/lib/types";

type Season = { id: string; code: string; name: string; state: string; paid_spin_price: number; daily_free_spin: boolean };
type Prize = { id: string; season_id: string; kind: string; title: string; subtitle: string | null; amount: string; unit_cost: string; currency: string | null; quantity_total: number; quantity_remaining: number };
type CatalogPrize = { key: string; kind: RewardKind; title: string; subtitle: string; amount: number; unitCost: number };
type Api<T> = { ok: boolean; seasons?: T; prizes?: T; code?: string };

const CATALOG: CatalogPrize[] = [
  { key: "money-500", kind: "MONEY", title: "500 грн", subtitle: "Денежный приз", amount: 500, unitCost: 500 },
  { key: "premium-3", kind: "PREMIUM", title: "Telegram Premium", subtitle: "3 месяца", amount: 3, unitCost: 14 },
  { key: "premium-6", kind: "PREMIUM", title: "Telegram Premium", subtitle: "6 месяцев", amount: 6, unitCost: 18 },
  { key: "premium-12", kind: "PREMIUM", title: "Telegram Premium", subtitle: "12 месяцев", amount: 12, unitCost: 30 },
  { key: "stars-100", kind: "STARS", title: "100 Stars", subtitle: "Telegram Stars", amount: 100, unitCost: 0 },
  { key: "stars-50", kind: "STARS", title: "50 Stars", subtitle: "Telegram Stars", amount: 50, unitCost: 0 },
  { key: "stars-20", kind: "STARS", title: "20 Stars", subtitle: "Telegram Stars", amount: 20, unitCost: 0 },
];

export const Route = createFileRoute("/admin/prizes")({
  head: () => ({ meta: [{ title: "Призовой фонд — CRICKET BOX" }] }),
  component: AdminPrizes,
});

function initData() { return (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim() ?? ""; }
async function json<T>(url: string, options?: RequestInit) { const response = await fetch(url, options); const data = await response.json() as Api<T>; if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED"); return data; }

function AdminPrizes() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedSeason = useMemo(() => seasons.find((x) => x.id === seasonId), [seasons, seasonId]);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const data = await json<Season[]>(`/api/admin/seasons?initData=${encodeURIComponent(initData())}`);
      const list = data.seasons ?? [];
      setSeasons(list);
      const live = list.find((x) => x.state === "ACTIVE") ?? list.find((x) => x.state === "ENDING") ?? list[0];
      setSeasonId((current) => current && list.some((x) => x.id === current) ? current : live?.id ?? "");
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось загрузить сезоны."); }
    finally { setLoading(false); }
  };

  const loadPrizes = async (id: string) => {
    if (!id) { setPrizes([]); setQuantities({}); return; }
    try {
      const data = await json<Prize[]>(`/api/admin/prizes?seasonId=${encodeURIComponent(id)}&initData=${encodeURIComponent(initData())}`);
      const rows = data.prizes ?? [];
      setPrizes(rows);
      const next: Record<string, number> = {};
      for (const item of CATALOG) {
        const found = rows.find((p) => p.kind === item.kind && p.title === item.title && Number(p.amount) === item.amount);
        next[item.key] = found?.quantity_total ?? 0;
      }
      setQuantities(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось загрузить призовой фонд."); setPrizes([]); }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { void loadPrizes(seasonId); }, [seasonId]);

  const change = (key: string, delta: number) => setQuantities((q) => ({ ...q, [key]: Math.max(0, (q[key] ?? 0) + delta) }));

  const saveCatalog = async () => {
    if (!seasonId) return;
    setSaving(true); setError("");
    try {
      for (const item of CATALOG) {
        const current = prizes.find((p) => p.kind === item.kind && p.title === item.title && Number(p.amount) === item.amount);
        const quantity = quantities[item.key] ?? 0;
        const body = {
          id: current?.id,
          seasonId,
          kind: item.kind,
          title: item.title,
          subtitle: item.subtitle,
          amount: item.amount,
          unitCost: item.unitCost,
          currency: item.kind === "MONEY" ? "UAH" : null,
          quantityTotal: quantity,
          quantityRemaining: current ? Math.min(quantity, current.quantity_remaining) + Math.max(0, quantity - current.quantity_total) : quantity,
        };
        await json("/api/admin/prizes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, initData: initData() }) });
      }
      await loadPrizes(seasonId);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить призовой фонд."); }
    finally { setSaving(false); }
  };

  const total = CATALOG.reduce((sum, item) => sum + (quantities[item.key] ?? 0), 0);
  const existingCustom = prizes.filter((p) => !CATALOG.some((item) => p.kind === item.kind && p.title === item.title && Number(p.amount) === item.amount));

  return (
    <AppShell title="Призовой фонд" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Каталог наград</p><h1 className="mt-1 font-display text-xl uppercase">Призовой фонд</h1></div><button type="button" onClick={() => void load()} className="grid size-9 place-items-center rounded-xl border border-glass-border bg-muted/10"><RefreshCw className="size-4" /></button></div>
          <label className="mt-4 block"><span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Сезон</span><select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="admin-input mt-1 w-full">{seasons.map((season) => <option key={season.id} value={season.id}>{season.code} · {season.state}</option>)}</select></label>
          <div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Наград" value={String(total)} /><Metric label="Цена прокрутки" value={selectedSeason ? `${selectedSeason.paid_spin_price} ⭐` : "—"} /></div>
          <p className="mt-3 text-[10px] text-muted-foreground">Выбирай количество готовых наград здесь. Именно этот каталог сохраняется в PostgreSQL и используется при прокрутках выбранного сезона.</p>
        </GlassCard>
        {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}

        <section className="space-y-2.5">
          {CATALOG.map((item) => {
            const count = quantities[item.key] ?? 0;
            return <GlassCard key={item.key} className="px-3.5 py-3.5"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl border border-glass-border bg-muted/10"><Gift className="size-4 text-primary-glow" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.title}</p><p className="text-[10px] text-muted-foreground">{item.subtitle}</p></div><div className="flex items-center gap-1 rounded-xl border border-glass-border bg-muted/10 p-1"><button type="button" onClick={() => change(item.key, -1)} className="grid size-7 place-items-center rounded-lg"><Minus className="size-3" /></button><span className="w-8 text-center text-sm font-semibold">{count}</span><button type="button" onClick={() => change(item.key, 1)} className="grid size-7 place-items-center rounded-lg"><Plus className="size-3" /></button></div></div></GlassCard>;
          })}
        </section>

        {existingCustom.length > 0 && <GlassCard className="px-4 py-3"><p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Другие награды</p><p className="mt-1 text-[11px] text-muted-foreground">В базе уже есть {existingCustom.length} пользовательских наград. Они сохраняются отдельно и не удаляются каталогом.</p></GlassCard>}
        <PrimaryButton fullWidth disabled={loading || saving || !seasonId} onClick={() => void saveCatalog()}><Save className="size-4" />{saving ? "Сохраняем…" : "Сохранить призовой фонд"}</PrimaryButton>
      </div>
    </AppShell>
  );
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>; }
