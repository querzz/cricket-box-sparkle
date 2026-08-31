import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Gift, Heart } from "lucide-react";

import { assets } from "@/components/assets";
import { AppShell } from "@/components/kit/AppShell";
import { Countdown } from "@/components/kit/Countdown";
import { CricketBox } from "@/components/kit/CricketBox";
import { GiftButton } from "@/components/kit/GiftCard";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { PrizeStrip } from "@/components/kit/PrizePool";
import { Avatar } from "@/components/kit/ProfileHeader";
import { RewardCard } from "@/components/kit/RewardCard";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { ErrorState, LoadingState, NoticeBar } from "@/components/kit/States";
import { StarsBalance } from "@/components/kit/StarsBalance";
import { seasonUi } from "@/lib/season";
import { formatRange } from "@/lib/format";
import { useSession } from "@/store/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CRICKET BOX — сезонный розыгрыш" },
      { name: "description", content: "Открывай CRICKET BOX, участвуй в сезоне, крути коробку и забирай призы." },
      { property: "og:title", content: "CRICKET BOX — сезонный розыгрыш" },
      { property: "og:description", content: "Крути Cricket Box, получай призы и участвуй в ежедневных подарках." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomeScreen,
});

function HomeScreen() {
  const { snapshot, loading, error, refresh } = useSession();
  const navigate = useNavigate();

  if (loading && !snapshot)
    return (
      <AppShell bare>
        <LoadingState label="Открываем коробку" />
      </AppShell>
    );
  if (!snapshot)
    return (
      <AppShell bare>
        <div className="pt-24">
          <ErrorState onRetry={() => void refresh()} description={error?.message} />
        </div>
      </AppShell>
    );

  const ui = seasonUi(snapshot);
  const attempts = snapshot.spin.freeSpins;
  const latestRewards = snapshot.rewards.slice(0, 2);
  const rewardCount = snapshot.rewards.length;
  const rewardLabel = rewardCount === 1 ? "приз" : rewardCount >= 2 && rewardCount <= 4 ? "приза" : "призов";

  return (
    <AppShell bare className="pt-[env(safe-area-inset-top)]">
      <section className="relative -mx-4 overflow-hidden rounded-b-[2.25rem] border-b border-glass-border">
        <img src={assets.mascot} alt="Маскот Cricket Box" width={768} height={1024} className="absolute inset-0 size-full scale-105 object-cover object-top opacity-75" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/60 to-background" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(70%_60%_at_50%_10%,var(--color-primary)_0%,transparent_70%)] opacity-25" />
        <div className="relative px-4 pb-5 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
            <Link to="/profile" aria-label="Профиль"><Avatar size={40} /></Link>
            <div className="flex justify-end">
              <Link to="/withdraw" className="press glass-panel gloss-top relative flex items-center gap-1.5 rounded-full px-3 py-1.5">
                <StarsBalance balance={snapshot.stars} size="sm" showMax={false} />
              </Link>
            </div>
            <GiftButton gift={snapshot.gift} />
          </div>

          <div className="mt-5 flex items-end justify-between gap-2">
            <div>
              <h1 className="font-display text-[2.6rem] font-bold uppercase leading-[0.9] tracking-[0.03em] text-gradient-primary drop-shadow-[0_0_28px_oklch(0.72_0.22_350_/_45%)]">Cricket<br />Box</h1>
              <p className="mt-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{snapshot.season.code}</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">{formatRange(snapshot.season.startsAt, snapshot.season.endsAt)}</p>
            </div>
            <CricketBox phase={ui.canSpin ? "idle" : "disabled"} size="sm" className="-mb-2 shrink-0" />
          </div>

          <GlassCard className="mt-4 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              {ui.isFinished ? (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Статус сезона</p>
                  <p className="mt-1 font-display text-lg uppercase tracking-[0.12em] text-gradient-primary">{ui.headline}</p>
                </div>
              ) : <Countdown target={snapshot.season.endsAt} label="Сезон закончится через" />}
              <StatusBadge status={{ type: "season", value: snapshot.season.state }} />
            </div>
            <div className="mt-3 border-t border-glass-border pt-3 text-[11px] text-muted-foreground">
              <p>{ui.note}</p>
              <p className="mt-1">{ui.isFinished ? "Прокрутки и ежедневный подарок закрыты для этого сезона." : `${snapshot.user.isParticipant ? "Ты участвуешь" : "Ты ещё не участвуешь"} · ${attempts} бесплатн${attempts === 1 ? "ая попытка сегодня" : "ых попытки сегодня"}`}</p>
            </div>
          </GlassCard>

          <div className="mt-4">
            {ui.isFinished ? (
              <div className="space-y-2">
                <PrimaryButton fullWidth size="lg" onClick={() => void navigate({ to: "/prizes" })}>Мои призы</PrimaryButton>
                {ui.canWithdraw && <PrimaryButton variant="outline" fullWidth onClick={() => void navigate({ to: "/withdraw" })}>Вывести Stars</PrimaryButton>}
              </div>
            ) : (
              <PrimaryButton fullWidth size="lg" disabled={!ui.canSpin} onClick={() => void navigate({ to: "/draw" })}>{ui.ctaLabel}</PrimaryButton>
            )}
          </div>
        </div>
      </section>

      <section className="mt-5 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Возможные призы</h2>
          <Link to="/prizes" className="flex items-center gap-0.5 text-[11px] text-muted-foreground">Все <ChevronRight className="size-3.5" /></Link>
        </div>
        <PrizeStrip prizes={snapshot.prizes} />
      </section>

      <section className="mt-6 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Твои призы</h2>
            {rewardCount > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Ты уже выиграл {rewardCount} {rewardLabel}</p>}
          </div>
          <Link to="/prizes" className="flex items-center gap-0.5 text-[11px] text-muted-foreground">Все <ChevronRight className="size-3.5" /></Link>
        </div>

        {latestRewards.length === 0 ? (
          <GlassCard className="flex items-center gap-3 px-4 py-3.5">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Gift className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Пока здесь пусто</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Крути бокс, чтобы получить первый приз.</p>
            </div>
            <Link to="/draw" className="shrink-0"><PrimaryButton variant="outline" size="md">Крутить</PrimaryButton></Link>
          </GlassCard>
        ) : (
          <div className="space-y-2.5">
            {latestRewards.map((reward) => <RewardCard key={reward.id} reward={reward} />)}
          </div>
        )}
      </section>

      <section className="mt-6 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Как это работает</h2>
          <Link to="/profile/rules" className="flex items-center gap-0.5 text-[11px] text-muted-foreground">Подробнее <ChevronRight className="size-3.5" /></Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { n: "01", title: "Крутишь", text: "Получаешь одну бесплатную попытку каждый день." },
            { n: "02", title: "Получаешь", text: "Награда определяется из призового пула сезона." },
            { n: "03", title: "Забираешь", text: "Полученный приз появляется в разделе «Мои призы»." },
          ].map((step) => (
            <GlassCard key={step.n} className="px-3 py-3.5">
              <span className="font-display text-[10px] text-primary">{step.n}</span>
              <p className="mt-2 text-xs font-semibold">{step.title}</p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{step.text}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {!snapshot.user.isSubscribed && (
        <GlassCard className="mt-6 flex items-center gap-3 px-3.5 py-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full [background-image:var(--gradient-primary)]"><Heart className="size-4 text-primary-foreground" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold">Подпишись на канал</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Подписка открывает участие и ежедневный подарок.</p>
          </div>
        </GlassCard>
      )}
    </AppShell>
  );
}
