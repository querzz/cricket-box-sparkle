import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, Megaphone, Power, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/subscription-offers")({
  head: () => ({ meta: [{ title: "Реклама и подписки — CRICKET BOX" }] }),
  component: SubscriptionOffersAdmin,
});

type Offer = {
  id: string;
  title: string;
  description: string;
  channel_username: string;
  channel_url: string;
  reward_spins: number;
  enabled: boolean;
  starts_at: string;
  ends_at: string | null;
  is_expired: boolean;
  claimed_users: number;
  awarded_spins: number;
};
type Api = { ok: boolean; offers?: Offer[]; code?: string };

function initData() {
  return typeof window === "undefined" ? "" : (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim() ?? "";
}

function SubscriptionOffersAdmin() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");
  const [rewardSpins, setRewardSpins] = useState(1);
  const [endsAt, setEndsAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const activeCount = useMemo(() => offers.filter((offer) => offer.enabled && !offer.is_expired).length, [offers]);

  async function load() {
    const response = await fetch("/api/admin/subscription-offers?initData=" + encodeURIComponent(initData()));
    const data = await response.json() as Api;
    if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
    setOffers(data.offers ?? []);
  }

  useEffect(() => {
    setLoading(true);
    void load().catch((e) => setError(e instanceof Error ? e.message : "Не удалось загрузить задания.")).finally(() => setLoading(false));
  }, []);

  async function createOffer() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/subscription-offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: initData(), title, channelUsername: username, description, rewardSpins, endsAt }),
      });
      const data = await response.json() as Api;
      if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
      setTitle(""); setUsername(""); setDescription(""); setRewardSpins(1); setEndsAt("");
      setOffers(data.offers ?? []);
      setMessage("Рекламное задание создано и уже показывается участникам.");
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      const messages: Record<string, string> = {
        ACTIVE_OFFER_LIMIT: "Можно держать включёнными не больше трёх заданий одновременно.",
        CHANNEL_ALREADY_PROMOTED: "Этот канал уже находится в активных заданиях.",
        INVALID_OFFER: "Проверь название, @username и количество прокруток.",
        INVALID_EXPIRY: "Дата окончания должна быть в будущем.",
      };
      setError(messages[code] ?? "Не удалось создать задание: " + code);
    } finally { setSaving(false); }
  }

  async function toggle(offer: Offer) {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/subscription-offers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: initData(), id: offer.id, enabled: !offer.enabled }),
      });
      const data = await response.json() as Api;
      if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
      setOffers(data.offers ?? []);
      setMessage(offer.enabled ? "Задание выключено. История выполнений сохранена." : "Задание включено.");
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      const messages: Record<string, string> = {
        ACTIVE_OFFER_LIMIT: "Сначала выключи одно из трёх активных заданий.",
        CHANNEL_ALREADY_PROMOTED: "Этот канал уже находится в активных заданиях.",
        OFFER_EXPIRED: "Срок задания закончился. Создай новое задание.",
      };
      setError(messages[code] ?? "Не удалось изменить задание: " + code);
    } finally { setSaving(false); }
  }

  return <AppShell title="Реклама и подписки" nav={false}>
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
        <button type="button" onClick={() => { setLoading(true); void load().catch((e) => setError(e instanceof Error ? e.message : "Не удалось обновить.")).finally(() => setLoading(false)); }} className="inline-flex items-center gap-1.5 text-[10px] text-primary-glow"><RefreshCw className="size-3.5" /> Обновить</button>
      </div>

      <GlassCard className="px-4 py-4" glow>
        <div className="flex items-start gap-3">
          <div className="grid size-10 place-items-center rounded-2xl border border-primary/25 bg-primary/10"><Megaphone className="size-5 text-primary-glow" /></div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">LiveOps · реклама</p>
            <h1 className="mt-1 font-display text-xl uppercase">Подписка за прокрутку</h1>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Добавляй каналы рекламодателей. Участник подписывается на канал и сам подтверждает подписку в приложении. Бот не проверяет подписку на рекламный канал автоматически. Одно задание можно выполнить только один раз.</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-glass-border px-3 py-2.5">
          <span className="text-[11px] text-muted-foreground">Активные задания</span>
          <span className="text-sm font-semibold">{activeCount} / 3</span>
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">Важно: добавлять бота CRICKET BOX администратором рекламного канала не нужно. Подписка на рекламный канал не проверяется автоматически: участник подтверждает её кнопкой в приложении. Награда за одно задание выдаётся только один раз. Поддерживаются публичные каналы с @username.</p>
      </GlassCard>

      {message && <GlassCard className="border-primary/25 bg-primary/5 px-4 py-3 text-[11px]">{message}</GlassCard>}
      {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}

      <GlassCard className="space-y-3 px-4 py-4">
        <div className="flex items-center gap-2"><Gift className="size-4 text-primary-glow" /><p className="text-sm font-semibold">Добавить рекламный канал</p></div>
        <label className="block"><span className="field-label">Название задания</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, Подписка на канал Влада" className="admin-input mt-1 w-full" maxLength={100} /></label>
        <label className="block"><span className="field-label">Telegram-канал</span><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@channel_name" className="admin-input mt-1 w-full" autoCapitalize="none" /></label>
        <label className="block"><span className="field-label">Описание (необязательно)</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Подпишись и забери бесплатную прокрутку" className="admin-input mt-1 w-full" maxLength={300} /></label>
        <label className="block"><span className="field-label">Бонусных прокруток за подписку</span><input type="number" min={1} max={20} value={rewardSpins} onChange={(e) => setRewardSpins(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="admin-input mt-1 w-full" /></label>
        <label className="block"><span className="field-label">Дата окончания (необязательно)</span><input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="admin-input mt-1 w-full" /></label>
        <button disabled={saving || !title.trim() || !username.trim() || activeCount >= 3} type="button" onClick={() => void createOffer()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 text-[10px] font-semibold disabled:opacity-50">{saving ? "Создаём…" : activeCount >= 3 ? "Сначала освободи место" : "Добавить задание"}</button>
      </GlassCard>

      <section>
        <div className="mb-2 flex items-center justify-between"><h2 className="section-label">Рекламные задания</h2><span className="text-[10px] text-muted-foreground">{offers.length}</span></div>
        {loading ? <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Загрузка…</GlassCard> : <div className="space-y-2.5">
          {offers.map((offer) => <GlassCard key={offer.id} className="px-4 py-3.5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{offer.title}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">@{offer.channel_username} · +{offer.reward_spins} прокрут.</p>
                {offer.description && <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{offer.description}</p>}
                <p className="mt-1 text-[10px] text-muted-foreground">Выполнили: {offer.claimed_users} · Выдано прокруток: {offer.awarded_spins}</p>
                {offer.ends_at && <p className="mt-1 text-[9px] text-muted-foreground">До: {new Date(offer.ends_at).toLocaleString("ru-RU", { hour12: false })}</p>}
                <p className="mt-1 text-[9px] text-muted-foreground">{offer.is_expired ? "Срок закончился" : offer.enabled ? "Показывается участникам" : "Выключено"}</p>
              </div>
              <button disabled={saving || offer.is_expired} type="button" onClick={() => void toggle(offer)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[10px] font-semibold disabled:opacity-40"><Power className="size-3.5" />{offer.enabled ? "Выключить" : "Включить"}</button>
            </div>
          </GlassCard>)}
          {offers.length === 0 && <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Рекламных заданий пока нет.</GlassCard>}
        </div>}
      </section>
    </div>
  </AppShell>;
}
