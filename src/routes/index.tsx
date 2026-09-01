import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Gift, Heart } from "lucide-react";

import { assets, rewardArt } from "@/components/assets";
import { AppShell } from "@/components/kit/AppShell";
import { Countdown } from "@/components/kit/Countdown";
import { CricketBox } from "@/components/kit/CricketBox";
import { GiftButton } from "@/components/kit/GiftCard";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { PrizeStrip } from "@/components/kit/PrizePool";
import { Avatar } from "@/components/kit/ProfileHeader";
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
  const latestReward = snapshot.rewards.find((reward) => reward.kind !== "EMPTY");

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
              {ui.countdownTarget ? (
                <Countdown target={ui.countdownTarget} label={ui.countdownLabel ?? undefined} />
              ) : (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Статус сезона</p>
                  <p className="mt-1 font-display text-lg uppercase tracking-[0.12em] text-gradient-primary">{ui.headline}</p>
                </div>
              )}
              <StatusBadge status={{ type: "season", value: snapshot.season.state }} />
            </div>
            <div className="mt-3 border-t border-glass-border pt-3 text-[11px] text-muted-foreground">
              <p>{ui.note}</p>
              <p className="mt-1">{ui.isFinished ? "Прокрутки и ежедневный подарок закрыты для этого сезона." : ui.isWaiting ? "Прокрутки откроются после старта сезона." : `${snapshot.user.isParticipant ? "Ты участвуешь" : "Ты ещё не участвуешь"} · ${attempts} бесплатн${attempts === 1 ? "ая попытка" : "ых попытки"}`}</p>
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

      <section className="mt-5 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Твои призы</h2>
          <Link to="/prizes" className="flex items-center gap-0.5 text-[11px] text-muted-foreground">Все <ChevronRight className="size-3.5" /></Link>
        </div>
        <Link to="/prizes" className="block">
          <GlassCard className="press flex items-center gap-3 px-4 py-3.5">
            {latestReward ? (
              <>
                <img src={rewardArt[latestReward.kind]} alt="" width={512} height={512} className="size-12 shrink-0 object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Последний приз</p>
                  <p className="mt-1 truncate text-sm font-semibold">{latestReward.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{latestReward.status === "RECEIVED" ? "Получен" : latestReward.status === "PROBLEM" ? "Требует решения" : "Ожидает выдачи"}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </>
            ) : (
              <>
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10"><Gift className="size-6 text-primary-glow" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Пока здесь пусто</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Крути бокс, чтобы получить свой первый приз.</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </GlassCard>
        </Link>
      </section>

      <section className="mt-5 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Как это работает</h2>
          <Link to="/profile/$section" params={{ section: "rules" }} className="flex items-center gap-0.5 text-[11px] text-muted-foreground">Подробнее <ChevronRight className="size-3.5" /></Link>
        </div>
        <GlassCard className="grid grid-cols-3 gap-2 px-3 py-4">
          {[
            ["01", "🎰", "Крутишь"],
            ["02", "🎁", "Получаешь"],
            ["03", "⭐", "Используешь или выводишь"],
          ].map(([number, icon, label]) => (
            <div key={number} className="text-center">
              <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{number}</p>
              <p className="mt-1 text-xl">{icon}</p>
              <p className="mt-1 text-[10px] font-semibold leading-tight">{label}</p>
            </div>
          ))}
        </GlassCard>
      </section>

      <GlassCard className="mt-5 flex items-center gap-3 px-3.5 py-3">
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">🔥 Уже сыграно {snapshot.spin.totalSpins} прокруток в этом сезоне.</p>
        <span className="press grid size-9 shrink-0 place-items-center rounded-full [background-image:var(--gradient-primary)]"><Heart className="size-4 text-primary-foreground" /></span>
      </GlassCard>

      {!snapshot.user.isSubscribed && <NoticeBar tone="warning" className="mt-4">Подпишись на канал, чтобы открыть прокрутки и ежедневный подарок.</NoticeBar>}

      <GlassCard className="mt-4 flex items-center gap-3 px-3.5 py-3">
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">Подпишись на канал и получай больше шансов выиграть в каждом сезоне.</p>
        <span className="press grid size-9 shrink-0 place-items-center rounded-full [background-image:var(--gradient-primary)]"><Heart className="size-4 text-primary-foreground" /></span>
      </GlassCard>
    </AppShell>
  );
}
