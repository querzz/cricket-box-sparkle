import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { PrizePool } from "@/components/kit/PrizePool";
import { RewardCard } from "@/components/kit/RewardCard";
import { EmptyState, ErrorState, LoadingState, SkeletonCard } from "@/components/kit/States";
import { cn } from "@/lib/utils";
import { useSession } from "@/store/session";

export const Route = createFileRoute("/prizes/")({
  head: () => ({
    meta: [
      { title: "My prizes — CRICKET BOX" },
      { name: "description", content: "Track every reward you won this Cricket Box season." },
      { property: "og:title", content: "My prizes — CRICKET BOX" },
      { property: "og:description", content: "Pending and received Cricket Box rewards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrizesScreen,
});

const tabs = [
  { id: "ALL", label: "All" },
  { id: "PENDING", label: "Pending" },
  { id: "RECEIVED", label: "Received" },
] as const;

function PrizesScreen() {
  const { snapshot, loading, error, refresh } = useSession();
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("ALL");

  if (loading && !snapshot)
    return (
      <AppShell title="My prizes">
        <LoadingState />
        <div className="space-y-2.5">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </AppShell>
    );
  if (!snapshot)
    return (
      <AppShell title="My prizes">
        <ErrorState onRetry={() => void refresh()} description={error?.message} />
      </AppShell>
    );

  const rewards = snapshot.rewards.filter((r) => (tab === "ALL" ? true : r.status === tab));

  return (
    <AppShell title="My prizes">
      <div className="glass-panel grid grid-cols-3 gap-1 rounded-full p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "press rounded-full py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
              tab === t.id
                ? "text-primary-foreground [background-image:var(--gradient-primary)]"
                : "text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2.5">
        {rewards.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="Spin the Cricket Box to win your first reward this season."
          />
        ) : (
          rewards.map((reward) => <RewardCard key={reward.id} reward={reward} />)
        )}
      </div>

      <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Season prize pool
      </h2>
      <PrizePool prizes={snapshot.prizes} className="mt-3" />
    </AppShell>
  );
}
