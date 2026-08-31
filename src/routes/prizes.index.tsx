import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/kit/AppShell";
import { PrizePool } from "@/components/kit/PrizePool";
import { RewardCard } from "@/components/kit/RewardCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/kit/States";
import { cn } from "@/lib/utils";
import { useSession } from "@/store/session";

export const Route = createFileRoute("/prizes/")({
  head: () => ({ meta: [
    { title: "Мои призы — CRICKET BOX" },
    { name: "description", content: "История всех призов, выигранных в текущем сезоне Cricket Box." },
    { property: "og:title", content: "Мои призы — CRICKET BOX" },
    { property: "og:description", content: "Ожидающие и полученные призы Cricket Box." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: PrizesScreen,
});

const tabs = [
  { id: "ALL", label: "Все" },
  { id: "PENDING", label: "Ожидают" },
  { id: "RECEIVED", label: "Получены" },
] as const;

function PrizesScreen() {
  const { snapshot, loading, error, refresh } = useSession();
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("ALL");

  const rewards = useMemo(
    () => snapshot?.rewards.filter((reward) => reward.kind !== "EMPTY" && (tab === "ALL" ? true : reward.status === tab)) ?? [],
    [snapshot, tab],
  );

  if (loading && !snapshot) return <AppShell title="Мои призы"><LoadingState /></AppShell>;
  if (!snapshot) return <AppShell title="Мои призы"><ErrorState onRetry={() => void refresh()} description={error?.message} /></AppShell>;

  return (
    <AppShell title="Мои призы">
      <div className="glass-panel grid grid-cols-3 gap-1 rounded-full p-1">
        {tabs.map((t) => <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn("press rounded-full py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors", tab === t.id ? "text-primary-foreground [background-image:var(--gradient-primary)]" : "text-muted-foreground")}>{t.label}</button>)}
      </div>
      <div className="mt-4 space-y-2.5">
        {rewards.length === 0 ? <EmptyState title="Здесь пока пусто" description="Крути Cricket Box, чтобы выиграть свой первый приз в этом сезоне." /> : rewards.map((reward) => <RewardCard key={reward.id} reward={reward} />)}
      </div>
      <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Призовой фонд сезона</h2>
      <PrizePool prizes={snapshot.prizes} className="mt-3" />
    </AppShell>
  );
}
