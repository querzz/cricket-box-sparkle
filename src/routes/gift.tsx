import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { assets } from "@/components/assets";
import { AppShell } from "@/components/kit/AppShell";
import { Countdown } from "@/components/kit/Countdown";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { RewardModal } from "@/components/kit/RewardModal";
import { Sparkles } from "@/components/kit/Sparkles";
import { ErrorState, LoadingState, NoticeBar } from "@/components/kit/States";
import { errorCopy, seasonUi } from "@/lib/season";
import type { Reward } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isServiceError, useSession } from "@/store/session";

export const Route = createFileRoute("/gift")({
  head: () => ({ meta: [
    { title: "Ежедневный подарок — CRICKET BOX" },
    { name: "description", content: "Открывай ежедневный подарок Cricket Box раз в 24 часа." },
    { property: "og:title", content: "Ежедневный подарок — CRICKET BOX" },
    { property: "og:description", content: "Бесплатный ежедневный подарок для участников активного сезона." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: GiftScreen,
});

function GiftScreen() {
  const { snapshot, loading, error, refresh, claimGift } = useSession();
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);

  if (loading && !snapshot) return <AppShell title="Твой подарок" back="/"><LoadingState /></AppShell>;
  if (!snapshot) return <AppShell title="Твой подарок" back="/"><ErrorState onRetry={() => void refresh()} description={error?.message} /></AppShell>;

  const ui = seasonUi(snapshot);
  const balanceFull = snapshot.stars.amount >= snapshot.stars.max;
  const available = snapshot.gift.state === "AVAILABLE" && ui.canClaimGift;

  const open = async () => {
    if (busy || !available) return;
    setBusy(true); setOpening(true);
    try {
      const result = await claimGift();
      if (isServiceError(result)) {
        toast.error(errorCopy(result.code));
        return;
      }
      setTimeout(() => setReward(result), 400);
    } finally {
      window.setTimeout(() => { setOpening(false); setBusy(false); }, 450);
    }
  };

  let description = ui.note;
  if (available) description = "Открой подарок и получи Stars на баланс CRICKET BOX.";
  else if (snapshot.gift.state === "COOLDOWN") description = "Подарок уже получен. Возвращайся после окончания таймера.";
  else if (balanceFull) description = "Баланс 500/500 ⭐. Освободи место после завершения сезона через вывод доступных Stars.";
  else if (!snapshot.user.isSubscribed) description = "Подпишись на канал, чтобы открыть ежедневный подарок.";
  else if (!snapshot.user.isParticipant) description = "Для подарка нужно участвовать в текущем сезоне.";
  else if (!ui.isLive) description = ui.isWaiting ? "Подарок откроется после старта сезона." : "Подарок закрыт вместе с сезоном.";

  return (
    <AppShell title="Твой подарок" back="/">
      <div className="relative mt-6 grid place-items-center">
        {opening && <Sparkles count={20} />}
        <div aria-hidden className="absolute size-56 rounded-full bg-primary/32 blur-3xl animate-glow-pulse" />
        {available && <><span aria-hidden className="absolute size-56 rounded-full border border-primary/25 animate-ring-burst" /><span aria-hidden className="absolute size-56 rounded-full border border-primary-glow/20 animate-ring-burst [animation-delay:-0.55s]" /></>}
        <img src={assets.gift} alt="Подарочная коробка" width={1024} height={1024} className={cn("relative size-56 object-contain drop-shadow-[0_22px_44px_oklch(0.04_0.02_340_/_80%)]", available && !opening && "animate-float", opening && "animate-shake", !available && "opacity-45 grayscale")} />
        <div aria-hidden className={cn("absolute bottom-1 h-4 w-40 rounded-[100%] bg-primary/30 blur-md", !available && "opacity-25")} />
      </div>

      <div className="mt-4 text-center">
        <h2 className="font-display text-xl uppercase tracking-[0.14em]">Ежедневный подарок</h2>
        <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      </div>

      {snapshot.gift.state === "COOLDOWN" && <div className="mt-5 flex justify-center"><Countdown target={snapshot.gift.availableAt} label="Следующий подарок через" /></div>}

      <div className="mt-7 space-y-3">
        <PrimaryButton fullWidth size="lg" loading={busy} disabled={!available} onClick={() => void open()}>{available ? "Открыть" : snapshot.gift.state === "COOLDOWN" ? "Получено" : balanceFull ? "Баланс заполнен" : "Недоступно"}</PrimaryButton>
        {balanceFull && <NoticeBar tone="warning">Ежедневный подарок не используется для обычной прокрутки. При полном балансе сначала освободи место выводом Stars после завершения сезона.</NoticeBar>}
        {!ui.canClaimGift && !balanceFull && snapshot.gift.state !== "COOLDOWN" && <NoticeBar tone="warning">Проверь подписку, участие и состояние текущего сезона.</NoticeBar>}
        <p className="text-center text-[11px] text-muted-foreground">Доступен раз в 24 часа · только для участников активного сезона</p>
      </div>
      <RewardModal reward={reward} onClaim={() => setReward(null)} />
    </AppShell>
  );
}
