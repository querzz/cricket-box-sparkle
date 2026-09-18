import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, History } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { t } from "@/lib/i18n";
import { seasonUi } from "@/lib/season";
import { completePaidSpin } from "@/services/paid-spin";
import type { Reward } from "@/lib/types";
import { isServiceError, useSession } from "@/store/session";

type PublicLinks = { ok?: boolean; channel?: { title: string; username: string | null; url: string | null }; season?: { title: string } | null };
type ChannelInfo = { ok?: boolean; channel?: { title: string | null; username: string | null; url: string | null } | null };

export const Route = createFileRoute("/draw")({
  head: () => ({ meta: [
    { title: "Розыгрыш — CRICKET BOX" },
    { name: "description", content: "Крути Cricket Box, используй бесплатную попытку или плати Stars за дополнительную прокрутку." },
    { property: "og:title", content: "Розыгрыш — CRICKET BOX" },
    { property: "og:description", content: "Крути Cricket Box и узнай, какой приз тебе достался." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: DrawScreen,
});

function DrawScreen() {
  const { snapshot, loading, error, refresh, spin } = useSession();
  const [phase, setPhase] = useState<BoxPhase>("idle");
  const [reward, setReward] = useState<Reward | null>(null);
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState<ChannelInfo["channel"]>(null);
  const [publicSeasonTitle, setPublicSeasonTitle] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!snapshot?.user.isSubscribed) {
      void fetch("/api/channel")
        .then((response) => response.ok ? response.json() as Promise<ChannelInfo> : null)
        .then((data) => { if (mounted) setChannel(data?.channel ?? null); })
        .catch(() => { if (mounted) setChannel(null); });
    }
    void fetch("/api/public-links")
      .then((response) => response.ok ? response.json() as Promise<PublicLinks> : null)
      .then((data) => { if (mounted) setPublicSeasonTitle(data?.season?.title ?? null); })
      .catch(() => { if (mounted) setPublicSeasonTitle(null); });
    return () => { mounted = false; };
  }, [snapshot?.user.isSubscribed]);

  const runSpin = useCallback(async (paid: boolean) => {
    if (busy) return;
    setBusy(true);
    setReward(null);
    setPhase("charging");
    let animationOwnsBusy = false;
    try {
      if (!snapshot) throw new Error("SESSION_NOT_READY");
      console.log("[CRICKET BOX] spin:start", {
        paid,
        seasonId: snapshot.season.id,
        seasonState: snapshot.season.state,
        freeSpins: snapshot.spin.freeSpins,
        paidSpinPrice: snapshot.spin.paidSpinPrice,
        stars: snapshot.stars.amount,
      });

      if (paid) {
        const paidResult = await completePaidSpin(snapshot.spin.paidSpinPrice ?? 0);
        if (!paidResult.ok) {
          console.error("[CRICKET BOX] paid-spin:error", paidResult.error);
          setPhase("idle");
          toast.error(paidResult.error.message);
          return;
        }
        console.log("[CRICKET BOX] paid-spin:success", { rewardId: paidResult.reward.id });
        // The payment result already contains the authoritative reward. Do not
        // block the reveal on a secondary session refresh: a transient refresh
        // failure must never make a successful paid spin look like it failed.
        void refresh().catch((refreshError) => console.warn("[CRICKET BOX] paid-spin:refresh-failed", refreshError));
        setPhase("opening");
        animationOwnsBusy = true;
        window.setTimeout(() => {
          setReward(paidResult.reward);
          setPhase("idle");
          setBusy(false);
        }, 350);
        return;
      }

      const result = await spin({ paid: false });
      if (isServiceError(result)) {
        console.error("[CRICKET BOX] spin:error", { paid, code: result.code, message: result.message });
        setPhase("idle");
        if (["SEASON_CLOSED", "SEASON_NOT_ACTIVE", "SEASON_NOT_STARTED", "NO_PRIZES"].includes(result.code)) await refresh();
        toast.error(result.message || "Не удалось выполнить прокрутку.");
        return;
      }
      console.log("[CRICKET BOX] spin:success", { rewardId: result.id, paid });
      // Refresh in the background so the next "Spin again" action sees the
      // consumed free/bonus spin instead of the pre-spin cached count.
      void refresh().catch((refreshError) => console.warn("[CRICKET BOX] free-spin:refresh-failed", refreshError));
      setPhase("opening");
      animationOwnsBusy = true;
      window.setTimeout(() => {
        setReward(result);
        setPhase("idle");
        setBusy(false);
      }, 500);
      return;
    } catch (caught) {
      console.error("[CRICKET BOX] spin:exception", caught instanceof Error ? caught.message : caught);
      setPhase("idle");
      toast.error("Не удалось выполнить прокрутку. Попробуй ещё раз.");
    } finally {
      if (!animationOwnsBusy) setBusy(false);
    }
  }, [busy, refresh, snapshot, spin]);

  if (loading && !snapshot) return <AppShell title="Розыгрыш"><LoadingState /></AppShell>;
  if (!snapshot) return <AppShell title="Розыгрыш"><ErrorState onRetry={() => void refresh()} description={error?.message} /></AppShell>;

  const ui = seasonUi(snapshot);
  const price = snapshot.spin.paidSpinPrice;
  const freeSpins = snapshot.spin.freeSpins;
  // Paid spins are charged by Telegram XTR. The internal CRICKET BOX Stars
  // balance must not gate access to the Telegram payment flow.
  const canPay = price !== null;
  const starsFull = snapshot.stars.amount >= snapshot.stars.max;
  const seasonTitle = publicSeasonTitle ?? snapshot.season.title;

  return (
    <AppShell title="Розыгрыш" action={<Link to="/prizes" aria-label={t("draw.history")} className="press grid size-9 place-items-center rounded-full bg-muted/50"><History className="size-4" /></Link>}>
      <div className="flex items-center justify-between"><StatusBadge status={{ type: "season", value: snapshot.season.state }} /><StarsBalance balance={snapshot.stars} size="sm" /></div>
      <GlassCard className="mt-4 px-4 pb-6 pt-4" glow>
        <div className="text-center"><p className="font-display text-xs uppercase tracking-[0.16em] text-primary-glow">{seasonTitle}</p></div>
        <CricketBox phase={ui.canSpin ? phase : "disabled"} size="md" className="mt-1" />
        <div className="mt-5 space-y-2.5">
          <PrimaryButton fullWidth size="lg" loading={busy && !reward} disabled={!ui.canSpin || freeSpins <= 0} onClick={() => void runSpin(false)}>{ui.isFinished ? t("draw.seasonFinished") : busy ? t("draw.opening") : t("draw.spin")}</PrimaryButton>
          {price !== null && !ui.isFinished && <PrimaryButton variant="outline" fullWidth disabled={!ui.canSpin || busy || !canPay} onClick={() => void runSpin(true)}>{t("draw.paidSpin")} · {price} Stars</PrimaryButton>}
          <p className="text-center text-[11px] text-muted-foreground">{ui.isFinished ? "Сезон завершён — попыток больше нет" : !snapshot.user.isSubscribed ? "Подпишись на канал, чтобы получить бесплатную попытку" : freeSpins > 0 ? t("draw.dailyAvailable") : t("draw.dailyUsed")}</p>
        </div>
      </GlassCard>

      <div className="mt-4 space-y-2.5">
        {!ui.canSpin && !snapshot.user.isSubscribed && <GlassCard className="space-y-2.5 px-4 py-3.5"><p className="text-sm font-semibold">Чтобы участвовать, подпишись на канал</p><p className="text-[11px] leading-relaxed text-muted-foreground">После подписки вернись сюда — приложение автоматически перепроверит доступ.</p>{channel?.url && <a href={channel.url} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary-glow"><span>{channel.username ? `Открыть ${channel.username}` : "Открыть канал"}</span><ExternalLink className="size-4" /></a>}</GlassCard>}
        {!ui.canSpin && snapshot.user.isSubscribed && <NoticeBar tone="warning">{ui.headline}</NoticeBar>}
        {ui.isWaiting && <NoticeBar>{ui.headline}. Прокрутки откроются после старта сезона.</NoticeBar>}
        {ui.canSpin && snapshot.user.isSubscribed && freeSpins <= 0 && price !== null && <NoticeBar tone="warning">{t("draw.dailyUsed")}. Ты можешь использовать платную прокрутку за {price} Stars через Telegram.</NoticeBar>}
        {starsFull && <NoticeBar tone="warning">Баланс Stars заполнен ({snapshot.stars.max}/{snapshot.stars.max}). Следующие Stars-награды будут ограничены при выдаче до освобождения места.</NoticeBar>}
        <GlassCard className="px-4 py-3.5">
          {ui.isFinished ? <div className="text-center"><p className="font-display text-base uppercase tracking-[0.14em] text-gradient-primary">{ui.headline}</p><p className="mt-1.5 text-[11px] text-muted-foreground">{ui.note}</p><div className="mt-3 space-y-2"><Link to="/prizes" className="block"><PrimaryButton fullWidth>Мои призы</PrimaryButton></Link>{ui.canWithdraw && <Link to="/withdraw" className="block"><PrimaryButton variant="outline" fullWidth>Вывести Stars</PrimaryButton></Link>}</div></div> : ui.countdownTarget ? <Countdown target={ui.countdownTarget} label={ui.countdownLabel ?? undefined} /> : <div className="text-center"><p className="font-display text-base uppercase tracking-[0.14em] text-gradient-primary">{ui.headline}</p><p className="mt-1.5 text-[11px] text-muted-foreground">{ui.note}</p></div>}
        </GlassCard>
      </div>
      <RewardModal reward={reward} claiming={false} onClaim={() => setReward(null)} onSpinAgain={freeSpins > 0 || canPay ? () => void runSpin(freeSpins <= 0) : undefined} spinAgainDisabled={busy} />
    </AppShell>
  );
}
