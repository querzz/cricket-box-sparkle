import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronRight,
  Trophy,
  ScrollText,
  HelpCircle,
  History,
  LifeBuoy,
  Settings,
  Plus,
} from "lucide-react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { ProfileHeader } from "@/components/kit/ProfileHeader";
import { ErrorState, LoadingState } from "@/components/kit/States";
import { StarsBalance } from "@/components/kit/StarsBalance";
import { useSession } from "@/store/session";

export const Route = createFileRoute("/profile/")({
  head: () => ({
    meta: [
      { title: "Profile — CRICKET BOX" },
      {
        name: "description",
        content: "Your Cricket Box participant profile, internal Stars balance and season history.",
      },
      { property: "og:title", content: "Profile — CRICKET BOX" },
      { property: "og:description", content: "Participant status, internal Stars and settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfileScreen,
});

const sections = [
  { slug: "leaderboard", label: "Leaderboard", icon: Trophy },
  { slug: "rules", label: "Rules", icon: ScrollText },
  { slug: "faq", label: "FAQ", icon: HelpCircle },
  { slug: "history", label: "Activity history", icon: History },
  { slug: "support", label: "Support", icon: LifeBuoy },
] as const;

function ProfileScreen() {
  const { snapshot, loading, error, refresh } = useSession();

  if (loading && !snapshot)
    return (
      <AppShell title="Profile">
        <LoadingState />
      </AppShell>
    );
  if (!snapshot)
    return (
      <AppShell title="Profile">
        <ErrorState onRetry={() => void refresh()} description={error?.message} />
      </AppShell>
    );

  return (
    <AppShell
      title="Profile"
      action={
        <Link
          to="/settings"
          aria-label="Settings"
          className="press grid size-9 place-items-center rounded-full bg-muted/50"
        >
          <Settings className="size-4" />
        </Link>
      }
    >
      <ProfileHeader user={snapshot.user} />

      <GlassCard glow className="mt-5 px-4 py-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full bg-primary/25 blur-3xl"
        />
        <p className="relative text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Internal Cricket Box Stars
        </p>
        <div className="relative mt-2.5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <StarsBalance balance={snapshot.stars} size="lg" showProgress />
          </div>
          <Link
            to="/draw"
            aria-label="Spend Stars on a spin"
            className="press grid size-12 shrink-0 place-items-center self-start rounded-full [background-image:var(--gradient-primary)] shadow-[var(--shadow-glow)]"
          >
            <Plus className="size-5 text-primary-foreground" />
          </Link>
        </div>
      </GlassCard>


      <GlassCard className="mt-4 divide-y divide-glass-border">
        {sections.map(({ slug, label, icon: Icon }) => (
          <Link
            key={slug}
            to="/profile/$section"
            params={{ section: slug }}
            className="press flex items-center gap-3 px-4 py-3.5"
          >
            <Icon className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </GlassCard>

      <Link
        to="/withdraw"
        className="press mt-4 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3.5"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">Withdraw internal Stars</span>
        <ChevronRight className="size-4 shrink-0 text-primary" />
      </Link>

      <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted-foreground">
        Internal Cricket Box Stars are an in-app season currency. They are not your personal
        Telegram Stars balance and cannot be spent outside Cricket Box.
      </p>
    </AppShell>
  );
}
