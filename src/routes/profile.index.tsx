import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Flame, Trophy, ScrollText, HelpCircle, History, LifeBuoy, Settings } from "lucide-react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { ProfileHeader } from "@/components/kit/ProfileHeader";
import { ErrorState, LoadingState } from "@/components/kit/States";
import { StarsBalance } from "@/components/kit/StarsBalance";
import { useSession } from "@/store/session";

export const Route = createFileRoute("/profile/")({
  head: () => ({ meta: [
    { title: "Профиль — CRICKET BOX" },
    { name: "description", content: "Профиль участника Cricket Box, баланс Stars и история сезона." },
    { property: "og:title", content: "Профиль — CRICKET BOX" },
    { property: "og:description", content: "Статус участника, Stars и настройки." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ProfileScreen,
});

const sections = [
  { slug: "leaderboard", label: "Таблица лидеров", icon: Trophy },
  { slug: "rules", label: "Правила", icon: ScrollText },
  { slug: "faq", label: "FAQ", icon: HelpCircle },
  { slug: "history", label: "История активности", icon: History },
  { slug: "support", label: "Поддержка", icon: LifeBuoy },
] as const;

function ProfileScreen() {
  const { snapshot, loading, error, refresh } = useSession();
  if (loading && !snapshot) return <AppShell title="Профиль"><LoadingState /></AppShell>;
  if (!snapshot) return <AppShell title="Профиль"><ErrorState onRetry={() => void refresh()} description={error?.message} /></AppShell>;

  return (
    <AppShell title="Профиль" action={<Link to="/settings" aria-label="Настройки" className="press grid size-9 place-items-center rounded-full bg-muted/50"><Settings className="size-4" /></Link>}>
      <ProfileHeader user={snapshot.user} />
      {snapshot.streak.enabled && <GlassCard className="mt-4 overflow-hidden px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-orange-400/25 bg-orange-500/10"><Flame className="size-5 text-orange-400"/></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-end gap-2"><p className="font-display text-2xl leading-none">{snapshot.streak.currentStreak}</p><p className="pb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">дней подряд</p></div>
            <p className="mt-1 text-[10px] text-muted-foreground">{snapshot.streak.checkedInToday ? "Сегодня ✅" : "Зайди сегодня, чтобы сохранить огонёк"}</p>
          </div>
          <div className="text-right"><p className="font-display text-base">{snapshot.streak.visitedDays}/{snapshot.streak.totalDays}</p><p className="text-[9px] text-muted-foreground">дней сезона</p></div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/40"><div className="h-full rounded-full [background-image:var(--gradient-primary)]" style={{width:`${Math.min(100,Math.round((snapshot.streak.visitedDays/Math.max(1,snapshot.streak.totalDays))*100))}%`}}/></div>
        <p className="mt-2 text-[10px] text-muted-foreground">{snapshot.streak.eligibleForReward ? `Полный проход — ${snapshot.streak.rewardStars} ⭐ в конце сезона` : `Цель: ${snapshot.streak.totalDays}/${snapshot.streak.totalDays} дней`}</p>
      </GlassCard>}
      <GlassCard glow className="mt-5 px-4 py-4">
        <p className="relative text-[10px] uppercase tracking-[0.24em] text-muted-foreground">⭐ Баланс CRICKET BOX</p>
        <div className="relative mt-2.5"><StarsBalance balance={snapshot.stars} size="lg" showProgress /></div>
        <p className="relative mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Это внутренний баланс наград CRICKET BOX. Его можно вывести после завершения сезона. Он не списывается за обычные дополнительные прокрутки — они оплачиваются отдельно через Telegram Stars.
        </p>
        <Link to="/profile/$section" params={{ section: "rules" }} className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary-glow">Как работают Stars <ChevronRight className="size-3.5" /></Link>
      </GlassCard>
      <GlassCard className="mt-4 divide-y divide-glass-border">
        {sections.map(({ slug, label, icon: Icon }) => <Link key={slug} to="/profile/$section" params={{ section: slug }} className="press flex items-center gap-3 px-4 py-3.5"><Icon className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-sm">{label}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></Link>)}
      </GlassCard>
      <Link to="/withdraw" className="press mt-4 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3.5"><span className="min-w-0 flex-1 truncate text-sm font-semibold">Вывести Stars</span><ChevronRight className="size-4 shrink-0 text-primary" /></Link>
    </AppShell>
  );
}
