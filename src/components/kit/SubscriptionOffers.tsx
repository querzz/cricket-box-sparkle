import { Gift, Send, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { GlassCard } from "@/components/kit/GlassCard";

type Offer = {
  id: string;
  title: string;
  description: string;
  channel_username: string;
  channel_url: string;
  reward_spins: number;
  claimed: boolean;
};

type Api = { ok: boolean; offers?: Offer[]; code?: string; addedSpins?: number; duplicate?: boolean };

function initData() {
  return typeof window === "undefined" ? "" : (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim() ?? "";
}

function openTelegramLink(url: string) {
  const webApp = (window as Window & { Telegram?: { WebApp?: { openTelegramLink?: (value: string) => void } } }).Telegram?.WebApp;
  if (webApp?.openTelegramLink) webApp.openTelegramLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export function SubscriptionOffers({ primarySubscribed, onClaimed }: { primarySubscribed: boolean; onClaimed?: () => void }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingId, setCheckingId] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/subscription-offers?initData=" + encodeURIComponent(initData()));
    const data = await response.json() as Api;
    if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
    setOffers(data.offers ?? []);
  }

  useEffect(() => {
    void load().catch(() => setMessage("Не удалось загрузить рекламные задания.")).finally(() => setLoading(false));
  }, []);

  async function claim(offer: Offer) {
    setCheckingId(offer.id);
    setMessage("");
    try {
      const response = await fetch("/api/subscription-offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: initData(), offerId: offer.id, confirmedSubscription: true }),
      });
      const data = await response.json() as Api;
      if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
      setOffers((items) => items.map((item) => item.id === offer.id ? { ...item, claimed: true } : item));
      setMessage(data.duplicate ? "Ты уже забрал награду за это задание. Повторно получить бонус нельзя." : "Готово! Добавлено " + Number(data.addedSpins ?? offer.reward_spins) + " бесплатных прокруток.");
      onClaimed?.();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const messages: Record<string, string> = {
        NOT_SUBSCRIBED: "Сначала подпишись на основной канал CRICKET BOX.",
        SUBSCRIPTION_CONFIRMATION_REQUIRED: "Подтверди, что подписался на рекламный канал.",
        NOT_PARTICIPANT: "Сначала заверши регистрацию участника.",
        OFFER_NOT_AVAILABLE: "Это рекламное задание уже завершено.",
        BONUS_SPIN_CAP_REACHED: "У тебя слишком много накопленных бонусных прокруток. Используй часть и попробуй снова.",
        SEASON_NOT_ACTIVE: "Сейчас нет активного сезона.",
        SEASON_PAUSED: "Сезон временно на паузе.",
      };
      setMessage(messages[code] ?? "Не удалось получить бонус: " + code);
    } finally {
      setCheckingId("");
    }
  }

  if (loading || (!offers.length && !message)) return null;
  if (!offers.length && message.startsWith("Не удалось")) return <GlassCard className="mt-4 px-4 py-3 text-[10px] text-muted-foreground">{message}</GlassCard>;

  return <section className="mt-5 space-y-2.5">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Бесплатные прокрутки за подписку</h2>
      <span className="text-[9px] text-muted-foreground">до 3 заданий</span>
    </div>
    <p className="text-[10px] leading-relaxed text-muted-foreground">Подписка на рекламный канал не проверяется автоматически. Нажимая кнопку, ты подтверждаешь, что подписался. За одно задание награда выдаётся только один раз.</p>
    <div className="space-y-2.5">
      {offers.map((offer) => <GlassCard key={offer.id} className="px-3.5 py-3.5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/10"><Gift className="size-5 text-primary-glow" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{offer.title}</p><span className="shrink-0 text-[11px] font-bold text-primary-glow">+{offer.reward_spins} 🎟️</span></div>
            <p className="mt-1 text-[10px] text-muted-foreground">@{offer.channel_username}</p>
            {offer.description && <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{offer.description}</p>}
            {offer.claimed ? <div className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[10px] font-semibold"><ShieldCheck className="size-3.5" /> Награда получена</div> : <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => openTelegramLink(offer.channel_url)} className="inline-flex items-center gap-1.5 rounded-xl border border-glass-border px-3 py-2 text-[10px] font-semibold"><Send className="size-3.5" /> Подписаться</button>
              <button type="button" disabled={checkingId === offer.id || !primarySubscribed} onClick={() => void claim(offer)} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-semibold disabled:opacity-40">{checkingId === offer.id ? "Выдаём…" : "Я подписался — забрать"}</button>
            </div>}
          </div>
        </div>
      </GlassCard>)}
    </div>
    {!primarySubscribed && <p className="text-[10px] leading-relaxed text-muted-foreground">Для участия также нужна подписка на основной канал CRICKET BOX.</p>}
    {message && <GlassCard className="border-primary/20 px-3 py-2.5 text-[10px] text-muted-foreground">{message}</GlassCard>}
  </section>;
}
