import { createFileRoute, Link } from "@tanstack/react-router";
import { History } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/kit/AppShell";
import { Countdown } from "@/components/kit/Countdown";
import { CricketBox, type BoxPhase } from "@/components/kit/CricketBox";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { RewardModal } from "@/components/kit/RewardModal";
import { ErrorState, LoadingState, NoticeBar } from "@/components/kit/States";
import { StarsBalance } from "@/components/kit/StarsBalance";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { errorCopy, seasonUi } from "@/lib/season";
import type { Reward } from "@/lib/types";
import { isServiceError, useSession } from "@/store/session";

export const Route = createFileRoute("/draw")({
  head: () => ({
    meta: [
      { title: "Розыгрыш — CRICKET BOX" },
      { name: "description", content: "Крути Cricket Box, используй бесплатную попытку или плати Stars за дополнительную прокрутку." },
      { property: "og:title", content: "Розыгрыш — CRICKET BOX" },
      { property: "og:description", content: "Крути Cricket Box и узнай, какой приз тебе достался." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DrawScreen,
});

function DrawScreen() {
  const { snapshot, loading, error, refresh, spin } = useSession();
  const [phase, setPhase] = useState<BoxPhase>("idle");
  const [reward, setReward] = useState<Reward | null>(null);
  const [busy, setBusy] = useState(false);

  const runSpin = useCallback(async (paid: boolean) => {
    if (busy) return;
    setBusy(true);
    setReward(null);
    setPhase("charging");
    const result = await spin({ paid });
    if (isServiceError(result)) {
      setPhase("idle");
      setBusy(false);
      toast.error(errorCopy(result.code));
      return;
    }
    setPhase("opening");
    setTimeout(() => {
      setReward(result);
      setPhase("idle");
      setBusy(false);
    }, 500);
  }, [busy, spin]);

  if (loading && !snapshot) return <AppShell title="Розыгрыш"><LoadingState /></AppShell>;
  if (!snapshot) return <AppShell title="Розыгрыш"><ErrorState onRetry={() => void refresh()} description={error?.message} /></AppShell>;

  const ui = seasonUi(snapshot);
  const price = snapshot.spin.paidSpinPrice;
  const freeSpins = snapshot.spin.freeSpins;
  const canPay = price !== null && snapshot.stars.amount >= price;
  const starsFull = snapshot.stars.amount >= snapshot.stars.max;

  return (
    <AppShell title="Розыгрыш" action={<Link to="/prizes" aria-label="История призов" className="press grid size-9 place-items-center rounded-full bg-muted/50"><History className="size-4" /></Link>}>
      <div className="flex items-center justify-between"><StatusBadge status={{ type: "season", value: snapshot.season.state }} /><StarsBalance balance={snapshot.stars} size="sm" /></div>
      <GlassCard className="mt-4 px-4 pb-6 pt-4" glow>
        <div className="text-center"><p className="font-display text-xs uppercase tracking-[0.24em] text-primary-glow">{snapshot.season.code}</p></div>
        <CricketBox phase={ui.canSpin ? phase : "disabled"} size="md" className="mt-1" />
        <div className="mt-5 space-y-2.5">
          <PrimaryButton fullWidth size="lg" loading={busy && !reward} disabled={!ui.canSpin || freeSpins <= 0} onClick={() => void runSpin(false)}>
            {ui.isFinished ? "Сезон завершён" : busy ? "Открываем" : "Крутить"}
          </PrimaryButton>
          {price !== null && !ui.isFinished && <PrimaryButton variant="outline" fullWidth disabled={!ui.canSpin || busy || !canPay} onClick={() => void runSpin(true)}>Дополнительная прокрутка · {price} Stars</PrimaryButton>}
          <p className="text-center text-[11px] text-muted-foreground">
            {ui.isFinished ? "Сезон завершён — попыток больше нет" : freeSpins > 0 ? `${freeSpins} бесплатн${freeSpins === 1 ? "ая попытка" : "ых попытки"}` : "Бесплатная попытка использована"}
          </p>
        </div>
      </GlassCard>

      <div className="mt-4 space-y-2.5">
        {!ui.canSpin && <NoticeBar tone="warning">{snapshot.user.isSubscribed ? ui.headline : "Подпишись на канал, чтобы участвовать."}</NoticeBar>}
        {ui.canSpin && freeSpins <= 0 && !canPay && price !== null && <NoticeBar tone="danger">Бесплатная попытка использована. Нужно ещё {price - snapshot.stars.amount} Stars для платной прокрутки.</NoticeBar>}
        {starsFull && <NoticeBar tone="warning">Баланс Stars заполнен ({snapshot.stars.max}/{snapshot.stars.max}). Потрать Stars на дополнительные прокрутки, чтобы снова получать награды Stars.</NoticeBar>}
        <GlassCard className="px-4 py-3.5">
          {ui.isFinished ? (
            <div className="text-center">
              <p className="font-display text-base uppercase tracking-[0.14em] text-gradient-primary">{ui.headline}</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{ui.note}</p>
              <div className="mt-3 space-y-2"><Link to="/prizes" className="block"><PrimaryButton fullWidth>Мои призы</PrimaryButton></Link>{ui.canWithdraw && <Link to="/withdraw" className="block"><PrimaryButton variant="outline" fullWidth>Вывести Stars</PrimaryButton></Link>}</div>
            </div>
          ) : <Countdown target={snapshot.season.endsAt} label="Сезон закончится через" />}
        </GlassCard>
      </div>
      <RewardModal reward={reward} claiming={false} onClaim={() => setReward(null)} onSpinAgain={freeSpins > 0 || canPay ? () => void runSpin(freeSpins <= 0) : undefined} spinAgainDisabled={busy} />
    </AppShell>
  );
}
