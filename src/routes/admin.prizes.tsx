import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, Minus, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";

export const Route = createFileRoute("/admin/prizes")({
  head: () => ({ meta: [{ title: "Призовой фонд — CRICKET BOX" }] }),
  component: AdminPrizes,
});

type Season = { id: string; code: string; name: string; state: string; paid_spin_price: number; daily_free_spin: boolean };
type PrizeKind = "MONEY" | "STARS" | "PREMIUM" | "NFT" | "PHYSICAL" | "CUSTOM" | "FREE_SPIN" | "EMPTY";
type Prize = {
  id: string; season_id: string; kind: PrizeKind; title: string; subtitle: string | null; amount: string; unit_cost: string;
  currency: string | null; quantity_total: number; quantity_remaining: number; is_active: boolean; image_url: string | null; metadata: Record<string, unknown> | null;
};
type Draft = {
  id?: string; kind: PrizeKind; title: string; subtitle: string; amount: number; quantity: number; weight: number;
  active: boolean; unitCost: number; currency: string | null; imageUrl: string; won: number;
};
type Api<T> = { ok: boolean; seasons?: T; prizes?: T; code?: string };

function initData() {
  return (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim() ?? "";
}

async function api<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json() as Api<T>;
  if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
  return data;
}

const emptyDraft = (): Draft => ({ kind: "CUSTOM", title: "", subtitle: "", amount: 0, quantity: 1, weight: 1, active: true, unitCost: 0, currency: null, imageUrl: "", won: 0 });

function fromPrize(prize: Prize): Draft {
  return {
    id: prize.id, kind: prize.kind, title: prize.title, subtitle: prize.subtitle ?? "", amount: Number(prize.amount) || 0,
    quantity: prize.quantity_total, weight: Number(prize.metadata?.weight ?? 1) || 1, active: prize.is_active,
    unitCost: Number(prize.unit_cost) || 0, currency: prize.currency, imageUrl: prize.image_url ?? "",
    won: Math.max(0, prize.quantity_total - prize.quantity_remaining),
  };
}

function AdminPrizes() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selectedSeason = useMemo(() => seasons.find((season) => season.id === seasonId), [seasons, seasonId]);

  const loadSeasons = async () => {
    setLoading(true); setError("");
    try {
      const data = await api<Season[]>(`/api/admin/seasons?initData=${encodeURIComponent(initData())}`);
      const list = data.seasons ?? [];
      setSeasons(list);
      setSeasonId((current) => current && list.some((item) => item.id === current) ? current : list.find((item) => item.state === "ACTIVE")?.id ?? list.find((item) => item.state === "ENDING")?.id ?? list[0]?.id ?? "");
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось загрузить сезоны."); }
    finally { setLoading(false); }
  };

  const loadPrizes = async (id: string) => {
    if (!id) { setDrafts([]); return; }
    try {
      const data = await api<Prize[]>(`/api/admin/prizes?seasonId=${encodeURIComponent(id)}&initData=${encodeURIComponent(initData())}`);
      setDrafts((data.prizes ?? []).map(fromPrize));
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось загрузить призовой фонд."); }
  };

  useEffect(() => { void loadSeasons(); }, []);
  useEffect(() => { void loadPrizes(seasonId); }, [seasonId]);

  const addPrize = (kind: PrizeKind) => {
    const draft = emptyDraft();
    draft.kind = kind;
    draft.currency = kind === "MONEY" ? "UAH" : kind === "STARS" ? "XTR" : null;
    if (kind === "EMPTY") { draft.title = "Ничего"; draft.subtitle = "Без награды"; draft.amount = 0; draft.quantity = 100; }
    setDrafts((all) => [...all, draft]);
  };

  const update = (index: number, patch: Partial<Draft>) => setDrafts((all) => all.map((draft, i) => i === index ? { ...draft, ...patch } : draft));
  const remove = (index: number) => setDrafts((all) => all.filter((_, i) => i !== index));
  const remaining = (draft: Draft) => Math.max(0, draft.quantity - draft.won);

  const save = async () => {
    if (!seasonId) return;
    const invalid = drafts.find((draft) => !draft.title.trim() || draft.quantity < draft.won || draft.weight < 0 || draft.amount < 0 || draft.unitCost < 0);
    if (invalid) { setError("Проверь название, количество, сумму и weight у всех наград."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      for (const draft of drafts) {
        const payload = {
          id: draft.id, seasonId, kind: draft.kind, title: draft.title.trim(), subtitle: draft.subtitle.trim() || null,
          amount: Number(draft.amount) || 0, unitCost: Number(draft.unitCost) || 0,
          currency: draft.kind === "MONEY" ? "UAH" : draft.kind === "STARS" ? "XTR" : draft.currency || null,
          quantityTotal: Math.max(draft.quantity, draft.won), quantityRemaining: remaining(draft), active: draft.active,
          imageUrl: draft.imageUrl.trim() || null, metadata: { weight: Math.max(0, Number(draft.weight) || 0) },
        };
        await api("/api/admin/prizes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, initData: initData() }) });
      }
      await loadPrizes(seasonId);
      setMessage(`Призовой фонд ${selectedSeason?.code ?? "сезона"} сохранён в PostgreSQL.`);
    } catch (e) {
      const code = e instanceof Error ? e.message : "REQUEST_FAILED";
      setError(code === "PRIZE_ECONOMICS_LOCKED" ? "Экономика награды уже заблокирована первым спином: сумму, тип, quantity и weight нельзя менять задним числом." : code === "PRIZE_QUANTITY_BELOW_WON" ? "Количество нельзя уменьшить ниже уже выданных наград." : `Не удалось сохранить: ${code}`);
    } finally { setSaving(false); }
  };

  const totalInventory = drafts.reduce((sum, draft) => sum + draft.quantity, 0);
  const totalRemaining = drafts.reduce((sum, draft) => sum + remaining(draft), 0);

  return (
    <AppShell title="Призовой фонд" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Конструктор наград</p><h1 className="mt-1 font-display text-xl uppercase">Призовой фонд</h1></div><button type="button" onClick={() => void loadSeasons()} className="grid size-9 place-items-center rounded-xl border border-glass-border bg-muted/10"><RefreshCw className="size-4" /></button></div>
          <label className="mt-4 block"><span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Сезон</span><select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="admin-input mt-1 w-full">{seasons.map((season) => <option key={season.id} value={season.id}>{season.code} · {season.state}</option>)}</select></label>
          <div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Всего единиц" value={String(totalInventory)} /><Metric label="Доступно" value={String(totalRemaining)} /></div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">Добавляй деньги на любую сумму в гривнах и Stars на любую сумму. Quantity — общее количество, weight — вес выбора. После первого спина экономические параметры существующей награды блокируются.</p>
        </GlassCard>

        {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
        {message && <GlassCard className="border-primary/25 bg-primary/5 px-4 py-3 text-[11px]">{message}</GlassCard>}

        <div className="grid grid-cols-2 gap-2">
          <AddButton label="Деньги" hint="любая сумма грн" onClick={() => addPrize("MONEY")} />
          <AddButton label="Stars" hint="любая сумма ⭐" onClick={() => addPrize("STARS")} />
          <AddButton label="Premium" hint="срок / количество" onClick={() => addPrize("PREMIUM")} />
          <AddButton label="Другая награда" hint="NFT / item / custom" onClick={() => addPrize("CUSTOM")} />
          <AddButton label="Ничего" hint="EMPTY outcome" onClick={() => addPrize("EMPTY")} />
        </div>

        <section className="space-y-3">
          {drafts.length === 0 && <EmptyBuilder />}
          {drafts.map((draft, index) => (
            <GlassCard key={draft.id ?? `new-${index}`} className="space-y-3 px-3.5 py-3.5">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-glass-border bg-muted/10">{draft.imageUrl ? <img src={draft.imageUrl} alt="" className="size-full object-cover" /> : <Gift className="size-4 text-primary-glow" />}</div>
                <div className="min-w-0 flex-1"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{labelForKind(draft.kind)}</p><p className="mt-1 truncate text-sm font-semibold">{draft.title || "Новая награда"}</p><p className="text-[10px] text-muted-foreground">Выдано {draft.won} · доступно {remaining(draft)}</p></div>
                <button type="button" aria-label="Удалить награду" onClick={() => remove(index)} className="grid size-8 place-items-center rounded-lg border border-destructive/20 bg-destructive/5 text-destructive"><Trash2 className="size-3.5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Название"><input value={draft.title} onChange={(e) => update(index, { title: e.target.value })} placeholder="Например, 250 грн" className="admin-input w-full" /></Field>
                <Field label="Подзаголовок"><input value={draft.subtitle} onChange={(e) => update(index, { subtitle: e.target.value })} placeholder="Описание" className="admin-input w-full" /></Field>
                <Field label={draft.kind === "STARS" ? "Сумма Stars" : draft.kind === "MONEY" ? "Сумма грн" : "Сумма / значение"}><input type="number" min={0} step={draft.kind === "MONEY" ? "0.01" : "1"} value={draft.amount} onChange={(e) => update(index, { amount: Number(e.target.value) })} className="admin-input w-full" /></Field>
                <Field label="Количество"><div className="flex items-center gap-1"><button type="button" onClick={() => update(index, { quantity: Math.max(draft.won, draft.quantity - 1) })} className="grid size-9 place-items-center rounded-xl border border-glass-border"><Minus className="size-3.5" /></button><input type="number" min={draft.won} value={draft.quantity} onChange={(e) => update(index, { quantity: Math.max(draft.won, Number(e.target.value) || 0) })} className="admin-input min-w-0 flex-1 text-center" /><button type="button" onClick={() => update(index, { quantity: draft.quantity + 1 })} className="grid size-9 place-items-center rounded-xl border border-glass-border"><Plus className="size-3.5" /></button></div></Field>
                <Field label="Weight"><input type="number" min={0} step="0.01" value={draft.weight} onChange={(e) => update(index, { weight: Number(e.target.value) })} className="admin-input w-full" /></Field>
                <Field label="Себестоимость"><input type="number" min={0} step="0.01" value={draft.unitCost} onChange={(e) => update(index, { unitCost: Number(e.target.value) })} className="admin-input w-full" /></Field>
                <Field label="Картинка URL"><input value={draft.imageUrl} onChange={(e) => update(index, { imageUrl: e.target.value })} placeholder="https://..." className="admin-input w-full" /></Field>
                <Field label="Активна"><button type="button" onClick={() => update(index, { active: !draft.active })} className={`admin-input w-full text-left ${draft.active ? "border-primary/40 bg-primary/10" : "opacity-60"}`}>{draft.active ? "✓ Участвует в выборе" : "○ Выключена"}</button></Field>
              </div>
            </GlassCard>
          ))}
        </section>

        <PrimaryButton fullWidth disabled={loading || saving || !seasonId} onClick={() => void save()}><Save className="size-4" />{saving ? "Сохраняем…" : "Сохранить призовой фонд"}</PrimaryButton>
      </div>
    </AppShell>
  );
}

function labelForKind(kind: PrizeKind) { return ({ MONEY: "Денежный приз", STARS: "Stars", PREMIUM: "Telegram Premium", NFT: "NFT", PHYSICAL: "Физическая награда", CUSTOM: "Своя награда", FREE_SPIN: "Бонусная прокрутка", EMPTY: "Без награды" } as Record<PrizeKind, string>)[kind]; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>; }
function AddButton({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="rounded-2xl border border-glass-border bg-muted/10 px-3 py-3 text-left transition hover:border-primary/30"><span className="block text-sm font-semibold">+ {label}</span><span className="mt-1 block text-[10px] text-muted-foreground">{hint}</span></button>; }
function EmptyBuilder() { return <GlassCard className="px-4 py-7 text-center"><Gift className="mx-auto size-6 text-muted-foreground" /><p className="mt-2 text-sm font-semibold">Призов пока нет</p><p className="mt-1 text-[11px] text-muted-foreground">Добавь любую награду кнопками выше.</p></GlassCard>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>; }
