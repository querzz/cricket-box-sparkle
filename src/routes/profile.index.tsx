import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Trophy, ScrollText, HelpCircle, History, LifeBuoy, Settings, Plus } from "lucide-react";

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
      <GlassCard glow className="mt-5 px-4 py-4">
        <p className="relative text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Stars Cricket Box</p>
        <div className="relative mt-2.5 flex items-center gap-3">
          <div className="min-w-0 flex-1"><StarsBalance balance={snapshot.stars} size="lg" showProgress /></div>
          <Link to="/draw" aria-label="Потратить Stars на прокрутку" className="press grid size-12 shrink-0 place-items-center self-start rounded-full [background-image:var(--gradient-primary)] shadow-[var(--shadow-glow)]"><Plus className="size-5 text-primary-foreground" /></Link>
        </div>
      </GlassCard>
      <GlassCard className="mt-4 divide-y divide-glass-border">
        {sections.map(({ slug, label, icon: Icon }) => <Link key={slug} to="/profile/$section" params={{ section: slug }} className="press flex items-center gap-3 px-4 py-3.5"><Icon className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-sm">{label}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></Link>)}
      </GlassCard>
      <Link to="/withdraw" className="press mt-4 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3.5"><span className="min-w-0 flex-1 truncate text-sm font-semibold">Вывести Stars</span><ChevronRight className="size-4 shrink-0 text-primary" /></Link>
      <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted-foreground">Stars внутри Cricket Box используются в рамках механики сезона. Баланс ограничен лимитом и не является отдельным балансом Telegram.</p>
    </AppShell>
  );
}
