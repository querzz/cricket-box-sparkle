import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Banknote, Crown, Gift, Minus, Plus, RefreshCw, Save, Sparkles, Star, Trash2, Trophy, WalletCards } from "lucide-react";
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
  const parsedWeight = Number(prize.metadata?.weight ?? 1);
  return {
    id: prize.id,
    kind: prize.kind,
    title: prize.title,
    subtitle: prize.subtitle ?? "",
    amount: Number(prize.amount) || 0,
    quantity: prize.quantity_total,
    weight: Number.isFinite(parsedWeight) ? parsedWeight : 1,
    active: prize.is_active,
    unitCost: Number(prize.unit_cost) || 0,
    currency: prize.currency,
    imageUrl: prize.image_url ?? "",
    won: Math.max(0, prize.quantity_total - prize.quantity_remaining),
  };
}

const kindMeta: Record<PrizeKind, { label: string; icon: typeof Gift }> = {
  MONEY: { label: "Деньги", icon: Banknote },
  STARS: { label: "Telegram Stars", icon: Star },
  PREMIUM: { label: "Telegram Premium", icon: Crown },
  NFT: { label: "NFT", icon: Sparkles },
  PHYSICAL: { label: "Физическая награда", icon: Gift },
  CUSTOM: { label: "Своя награда", icon: Gift },
  FREE_SPIN: { label: "Бесплатная прокрутка", icon: Trophy },
  EMPTY: { label: "Пустой исход", icon: WalletCards },
};

function AdminPrizes() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
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
    if (kind === "MONEY") { draft.title = "Денежный приз"; draft.subtitle = "Выигрыш в гривнах"; draft.amount = 100; }
    if (kind === "STARS") { draft.title = "Stars"; draft.subtitle = "Telegram Stars"; draft.amount = 50; }
    if (kind === "PREMIUM") { draft.title = "Telegram Premium"; draft.subtitle = "3 месяца"; draft.amount = 3; }
    if (kind === "EMPTY") { draft.title = "Ничего"; draft.subtitle = "Без награды"; draft.amount = 0; draft.quantity = 100; }
    setDrafts((all) => [...all, draft]);
  };

  const update = (index: number, patch: Partial<Draft>) => setDrafts((all) => all.map((draft, i) => i === index ? { ...draft, ...patch } : draft));
  const remove = async (index: number) => {
    const draft = drafts[index];
    if (!draft) return;
    setError(""); setMessage("");
    if (draft.id) {
      setRemoving(draft.id);
      try {
        await api<{ deactivated: boolean }>("/api/admin/prizes", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: draft.id, seasonId, initData: initData() }) });
      } catch (e) { setError(e instanceof Error ? e.message : "Не удалось убрать награду."); return; }
      finally { setRemoving(null); }
    }
    setDrafts((all) => all.filter((_, i) => i !== index));
  };
  const remaining = (draft: Draft) => Math.max(0, draft.quantity - draft.won);

  const totals = useMemo(() => {
    const winning = drafts.reduce((sum, prize) => sum + (prize.kind === "EMPTY" ? 0 : Math.max(0, prize.quantity)), 0);
    const available = drafts.reduce((sum, prize) => sum + remaining(prize), 0);
    const stars = drafts.filter((p) => p.kind === "STARS").reduce((sum, p) => sum + p.amount * p.quantity, 0);
    const premium = drafts.filter((p) => p.kind === "PREMIUM").reduce((sum, p) => sum + Math.max(0, p.quantity), 0);
    const premiumCost = drafts.filter((p) => p.kind === "PREMIUM").reduce((sum, p) => sum + p.unitCost * Math.max(0, p.quantity), 0);
    const moneyCost = drafts.filter((p) => p.kind === "MONEY").reduce((sum, p) => sum + p.unitCost * Math.max(0, p.quantity), 0);
    const empty = drafts.filter((p) => p.kind === "EMPTY").reduce((sum, p) => sum + p.quantity, 0);
    return { winning, available, stars, premium, premiumCost, moneyCost, empty };
  }, [drafts]);

  const save = async () => {
    if (!seasonId) return;
    const invalid = drafts.find((draft) => !draft.title.trim() || draft.quantity < draft.won || draft.weight < 0 || !Number.isFinite(draft.weight) || draft.amount < 0 || !Number.isFinite(draft.amount) || draft.unitCost < 0 || !Number.isFinite(draft.unitCost));
    if (invalid) { setError("Проверь название, количество, сумму и weight у всех наград."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      for (const draft of drafts) {
        const payload = {
          id: draft.id, seasonId, kind: draft.kind, title: draft.title.trim(), subtitle: draft.subtitle.trim() || null,
          amount: draft.amount, unitCost: draft.unitCost,
          currency: draft.kind === "MONEY" ? "UAH" : draft.kind === "STARS" ? "XTR" : draft.currency || null,
          quantityTotal: Math.max(draft.quantity, draft.won), quantityRemaining: remaining(draft), active: draft.active,
          imageUrl: draft.imageUrl.trim() || null, metadata: { weight: draft.weight },
        };
        await api("/api/admin/prizes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, initData: initData() }) });
      }
      await loadPrizes(seasonId);
      setMessage(`Призовой фонд ${selectedSeason?.code ?? "сезона"} сохранён.`);
    } catch (e) {
      const code = e instanceof Error ? e.message : "REQUEST_FAILED";
      setError(code === "PRIZE_ECONOMICS_LOCKED" ? "Эта награда уже участвовала в розыгрышах: тип, сумма и weight защищены от изменения." : code === "PRIZE_QUANTITY_BELOW_WON" ? "Количество нельзя уменьшить ниже уже выданных наград." : `Не удалось сохранить: ${code}`);
    } finally { setSaving(false); }
  };

  return (
    <AppShell title="Призовой фонд" nav={false}>
      <div className="space-y-4 pb-8">
        <div className="flex items-center justify-between gap-3">
          <Link to="/admin" className="admin-link inline-flex items-center gap-1.5"><ArrowLeft className="size-3.5" /> Обзор</Link>
          <button type="button" onClick={() => { void loadSeasons(); if (seasonId) void loadPrizes(seasonId); }} className="admin-icon-button" aria-label="Обновить"><RefreshCw className="size-4" /></button>
        </div>

        <GlassCard className="admin-hero overflow-hidden border-primary/25 px-4 py-4" glow>
          <div className="flex items-start gap-3">
            <div className="admin-action-icon size-11 shrink-0"><Gift className="size-5 text-primary-glow" /></div>
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Конструктор наград</p>
              <h1 className="mt-1 font-display text-xl uppercase">Призовой фонд</h1>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Здесь задаётся реальный инвентарь, из которого выбирается награда. Всё сохраняется в PostgreSQL.</p>
            </div>
          </div>
          <label className="mt-4 block"><span className="field-label">Сезон</span><select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="admin-input mt-1 w-full">{seasons.map((season) => <option key={season.id} value={season.id}>{season.code} · {season.state}</option>)}</select></label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <SummaryMetric label="Выигрышных" value={String(totals.winning)} icon={Trophy} />
            <SummaryMetric label="Доступно" value={String(totals.available)} icon={WalletCards} />
            <SummaryMetric label="Пустых" value={String(totals.empty)} icon={Gift} />
            <SummaryMetric label="Stars" value={`${totals.stars} ⭐`} icon={Star} />
          </div>
        </GlassCard>

        {error && <GlassCard className="admin-alert admin-alert-error px-4 py-3 text-[11px]">{error}</GlassCard>}
        {message && <GlassCard className="admin-alert admin-alert-success px-4 py-3 text-[11px]">{message}</GlassCard>}

        <section>
          <div className="mb-2 flex items-end justify-between gap-3"><div><h2 className="section-label">Добавить награду</h2><p className="text-[10px] text-muted-foreground">Создай нужный тип, затем заполни параметры.</p></div></div>
          <div className="grid grid-cols-2 gap-2">
            <AddButton icon={Banknote} label="Деньги" hint="любая сумма грн" onClick={() => addPrize("MONEY")} />
            <AddButton icon={Star} label="Stars" hint="любая сумма ⭐" onClick={() => addPrize("STARS")} />
            <AddButton icon={Crown} label="Premium" hint="3 / 6 / 12 месяцев" onClick={() => addPrize("PREMIUM")} />
            <AddButton icon={Sparkles} label="Другая" hint="NFT / item / custom" onClick={() => addPrize("CUSTOM")} />
            <AddButton icon={Gift} label="Ничего" hint="пустой исход" onClick={() => addPrize("EMPTY")} />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="section-label">Награды сезона</h2><span className="text-[10px] text-muted-foreground">{drafts.length} позиций</span></div>
          {loading && <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Загрузка…</GlassCard>}
          {!loading && drafts.length === 0 && <EmptyBuilder />}
          {!loading && drafts.map((draft, index) => <PrizeEditor key={draft.id ?? `new-${index}`} draft={draft} index={index} saving={saving} removing={removing} update={update} remove={remove} remaining={remaining} />)}
        </section>

        <GlassCard className="admin-pool-summary space-y-2.5 px-3.5 py-3.5">
          <div className="flex items-center justify-between"><div><p className="eyebrow">Контроль фонда</p><p className="mt-1 text-xs font-semibold">Перед сохранением проверь доступный остаток</p></div><Trophy className="size-5 text-primary-glow" /></div>
          <div className="grid grid-cols-2 gap-2 text-[10px]"><LineMetric label="Premium" value={`${totals.premium} шт.`}/><LineMetric label="Premium cost" value={`${totals.premiumCost} CHF`}/><LineMetric label="Money cost" value={`${totals.moneyCost} грн`}/><LineMetric label="Stars liability" value={`${totals.stars} ⭐`}/></div>
          <p className="text-[9px] leading-relaxed text-muted-foreground">Weight — относительный вес. Quantity — полный инвентарь. После выдачи первой единицы экономические параметры награды блокируются.</p>
        </GlassCard>

        <PrimaryButton fullWidth disabled={loading || saving || !!removing || !seasonId} onClick={() => void save()}><Save className="size-4" />{saving ? "Сохраняем…" : "Сохранить призовой фонд"}</PrimaryButton>
      </div>
    </AppShell>
  );
}

function PrizeEditor({ draft, index, saving, removing, update, remove, remaining }: { draft: Draft; index: number; saving: boolean; removing: string | null; update: (index: number, patch: Partial<Draft>) => void; remove: (index: number) => Promise<void>; remaining: (draft: Draft) => number; }) {
  const meta = kindMeta[draft.kind];
  const Icon = meta.icon;
  const locked = draft.won > 0;
  return <GlassCard className={`space-y-3 px-3.5 py-3.5 ${locked ? "border-primary/20" : ""}`}>
    <div className="flex items-start gap-3">
      <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl border border-glass-border bg-muted/10">{draft.imageUrl ? <img src={draft.imageUrl} alt="" className="size-full object-cover" /> : <Icon className="size-5 text-primary-glow" />}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5"><span className="admin-state-pill">{meta.label}</span>{locked && <span className="rounded-full border border-warning/20 bg-warning/5 px-2 py-1 text-[8px] font-semibold text-warning">ЗАБЛОКИРОВАНО</span>}</div>
        <p className="mt-1 truncate text-sm font-semibold">{draft.title || "Новая награда"}</p>
        <p className="text-[10px] text-muted-foreground">Выдано {draft.won} · доступно {remaining(draft)} · {draft.active ? "участвует" : "выключена"}</p>
      </div>
      <button type="button" aria-label="Удалить награду" disabled={removing === draft.id || saving} onClick={() => void remove(index)} className="grid size-8 shrink-0 place-items-center rounded-xl border border-destructive/20 bg-destructive/5 text-destructive disabled:opacity-50"><Trash2 className="size-3.5" /></button>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <Field label="Название"><input value={draft.title} onChange={(e) => update(index, { title: e.target.value })} placeholder="Например, 250 грн" className="admin-input w-full" /></Field>
      <Field label="Описание"><input value={draft.subtitle} onChange={(e) => update(index, { subtitle: e.target.value })} placeholder="Короткое описание" className="admin-input w-full" /></Field>
      <Field label={draft.kind === "STARS" ? "Stars" : draft.kind === "MONEY" ? "Сумма, грн" : "Значение"}><input type="number" min={0} step={draft.kind === "MONEY" ? "0.01" : "1"} value={draft.amount} disabled={locked} onChange={(e) => update(index, { amount: Number(e.target.value) })} className="admin-input w-full" /></Field>
      <Field label="Количество"><div className="flex items-center gap-1"><button type="button" disabled={saving} onClick={() => update(index, { quantity: Math.max(draft.won, draft.quantity - 1) })} className="admin-step-button"><Minus className="size-3.5" /></button><input type="number" min={draft.won} value={draft.quantity} onChange={(e) => update(index, { quantity: Math.max(draft.won, Number(e.target.value) || 0) })} className="admin-input min-w-0 flex-1 text-center"/><button type="button" disabled={saving} onClick={() => update(index, { quantity: draft.quantity + 1 })} className="admin-step-button"><Plus className="size-3.5" /></button></div></Field>
      <Field label="Weight"><input type="number" min={0} step="0.01" value={draft.weight} disabled={locked} onChange={(e) => update(index, { weight: Number(e.target.value) })} className="admin-input w-full" /></Field>
      <Field label="Себестоимость"><input type="number" min={0} step="0.01" value={draft.unitCost} disabled={locked} onChange={(e) => update(index, { unitCost: Number(e.target.value) })} className="admin-input w-full" /></Field>
      <Field label="Картинка URL"><input value={draft.imageUrl} onChange={(e) => update(index, { imageUrl: e.target.value })} placeholder="https://..." className="admin-input w-full" /></Field>
      <Field label="Участие"><button type="button" onClick={() => update(index, { active: !draft.active })} className={`admin-input w-full text-left ${draft.active ? "border-primary/40 bg-primary/10" : "opacity-55"}`}>{draft.active ? "✓ Участвует в розыгрыше" : "○ Выключена"}</button></Field>
    </div>
  </GlassCard>;
}

function labelForKind(kind: PrizeKind) { return kindMeta[kind].label; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="field-label">{label}</span><div className="mt-1">{children}</div></label>; }
function AddButton({ icon:Icon, label, hint, onClick }: { icon: typeof Gift; label: string; hint: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="admin-add-button text-left"><span className="admin-action-icon"><Icon className="size-4 text-primary-glow"/></span><span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{hint}</span></span><Plus className="ml-auto size-3.5 text-muted-foreground"/></button>; }
function SummaryMetric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Gift }) { return <div className="admin-metric"><span className="grid size-7 place-items-center rounded-xl border border-glass-border bg-muted/10"><Icon className="size-3.5 text-primary-glow"/></span><div className="min-w-0"><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-sm font-semibold">{value}</p></div></div>; }
function LineMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-glass-border bg-muted/10 px-3 py-2.5"><p className="text-muted-foreground">{label}</p><p className="mt-0.5 font-semibold">{value}</p></div>; }
function EmptyBuilder() { return <GlassCard className="px-4 py-8 text-center"><Gift className="mx-auto size-7 text-muted-foreground"/><p className="mt-2 text-sm font-semibold">Фонд пока пуст</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Добавь хотя бы одну награду и один EMPTY-исход перед активацией сезона.</p></GlassCard>; }
