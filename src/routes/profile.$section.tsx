import { createFileRoute, useParams } from "@tanstack/react-router";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { EmptyState, LoadingState } from "@/components/kit/States";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { formatDate } from "@/lib/format";
import { useSession } from "@/store/session";

export const Route = createFileRoute("/profile/$section")({
  head: () => ({
    meta: [
      { title: "Season info — CRICKET BOX" },
      { name: "description", content: "Leaderboard, rules, FAQ, activity history and support." },
      { property: "og:title", content: "Season info — CRICKET BOX" },
      { property: "og:description", content: "Everything about how a Cricket Box season works." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SectionScreen,
});

const titles: Record<string, string> = {
  leaderboard: "Leaders",
  rules: "Rules",
  faq: "FAQ",
  history: "Activity history",
  support: "Support",
};

const leaders = [
  { name: "@nightowl", stars: 480 },
  { name: "@mika", stars: 415 },
  { name: "@username", stars: 125 },
  { name: "@sable", stars: 90 },
];

const rules = [
  "Each season runs for a fixed period and has its own prize pool.",
  "Every participant receives one free spin per season day.",
  "Extra spins can be bought with internal Cricket Box Stars.",
  "Internal Stars are capped — spending them frees capacity instantly.",
  "Physical and Telegram prizes are issued manually within 48 hours.",
  "Withdrawals open when the season enters the payout stage.",
];

const faq = [
  {
    q: "Are internal Stars the same as Telegram Stars?",
    a: "No. Internal Cricket Box Stars only exist inside this mini app and are used for extra spins and season withdrawals.",
  },
  {
    q: "Why didn't I receive all the Stars I won?",
    a: "Your balance has a maximum. If a reward exceeds the remaining capacity, only the part that fits is credited.",
  },
  {
    q: "When do I get my prize?",
    a: "Digital prizes are issued by an administrator within 48 hours. Money prizes are paid after the season closes.",
  },
];

function SectionScreen() {
  const { section } = useParams({ from: "/profile/$section" });
  const { snapshot, loading } = useSession();
  const title = titles[section] ?? "Section";

  if (loading && !snapshot)
    return (
      <AppShell title={title} back="/profile">
        <LoadingState />
      </AppShell>
    );

  return (
    <AppShell title={title} back="/profile">
      {section === "leaderboard" && (
        <GlassCard className="divide-y divide-glass-border">
          {leaders.map((leader, i) => (
            <div key={leader.name} className="flex items-center gap-3 px-4 py-3.5">
              <span className="w-5 shrink-0 font-display text-sm text-primary">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{leader.name}</span>
              <span className="shrink-0 font-display text-sm tabular-nums">{leader.stars}</span>
            </div>
          ))}
        </GlassCard>
      )}

      {section === "rules" && (
        <GlassCard className="space-y-3 px-4 py-4">
          {rules.map((rule) => (
            <p key={rule} className="text-xs leading-relaxed text-muted-foreground">
              — {rule}
            </p>
          ))}
        </GlassCard>
      )}

      {section === "faq" && (
        <div className="space-y-2.5">
          {faq.map((item) => (
            <GlassCard key={item.q} className="px-4 py-3.5">
              <p className="text-sm font-semibold">{item.q}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.a}</p>
            </GlassCard>
          ))}
        </div>
      )}

      {section === "history" && (
        <div className="space-y-2.5">
          {snapshot && snapshot.rewards.length > 0 ? (
            snapshot.rewards.map((reward) => (
              <GlassCard key={reward.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{reward.title}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDate(reward.wonAt)}</p>
                </div>
                <StatusBadge status={{ type: "reward", value: reward.status }} />
              </GlassCard>
            ))
          ) : (
            <EmptyState title="No activity yet" />
          )}
        </div>
      )}

      {section === "support" && (
        <GlassCard className="space-y-2 px-4 py-5 text-center">
          <p className="font-display text-sm uppercase tracking-[0.16em]">Need help?</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Write to the season administrator in Telegram. Never share payment details with anyone —
            Cricket Box never asks for them inside the app.
          </p>
        </GlassCard>
      )}

      {!(section in titles) && (
        <EmptyState title="Unknown section" description="This page doesn't exist." />
      )}
    </AppShell>
  );
}
