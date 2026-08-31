import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";

import { rewardArt } from "@/components/assets";
import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { EmptyState, ErrorState, LoadingState, NoticeBar } from "@/components/kit/States";
import { StarsBalance } from "@/components/kit/StarsBalance";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { formatDate } from "@/lib/format";
import { seasonUi } from "@/lib/season";
import { useSession } from "@/store/session";

export const Route = createFileRoute("/prizes/$rewardId")({
  head: () => ({
    meta: [
      { title: "Детали приза — CRICKET BOX" },
      { name: "description", content: "Статус приза, информация о выдаче и вывод Stars." },
    ],
  }),
  component: RewardDetailScreen,
});

function RewardDetailScreen() {
  const { rewardId } = useParams({ from: "/prizes/$rewardId" });
  const { snapshot, loading, error, refresh } = useSession();
  const navigate = useNavigate();

  if (loading && !snapshot) return <AppShell title="Приз" back="/prizes"><LoadingState label="Загрузка" /></AppShell>;
  if (!snapshot) return <AppShell title="Приз" back="/prizes"><ErrorState title="Ошибка сети" description={error?.message ?? "Не удалось загрузить приз."} onRetry={() => void refresh()} /></AppShell>;

  const reward = snapshot.rewards.find((r) => r.id === rewardId);
  if (!reward) return <AppShell title="Приз" back="/prizes"><EmptyState title="Приз не найден" description="Эта награда больше недоступна." /></AppShell>;

  const ui = seasonUi(snapshot);
  const isStars = reward.kind === "STARS";

  return (
    <AppShell title="Приз" back="/prizes">
      <div className="relative mx-auto mt-2 grid size-44 place-items-center">
        <div aria-hidden className="absolute size-32 rounded-full bg-primary/30 blur-3xl animate-glow-pulse" />
        <img src={rewardArt[reward.kind]} alt={reward.title} width={512} height={512} className="relative size-36 object-contain animate-float" />
      </div>
      <div className="mt-2 text-center">
        <h2 className="font-display text-2xl font-semibold uppercase tracking-[0.08em]">{reward.title}</h2>
        {reward.subtitle && <p className="mt-1 text-xs text-muted-foreground">{reward.subtitle}</p>}
        <p className="mt-3 text-xs text-muted-foreground">Выигран: {formatDate(reward.wonAt)}</p>
        <StatusBadge className="mt-3" status={{ type: "reward", value: reward.status }} />
      </div>
      <GlassCard className="mt-6 space-y-3 px-4 py-4">
        <Row label="Статус" value={reward.status.toLowerCase()} />
        <Row label="Дата выигрыша" value={formatDate(reward.wonAt)} />
        {reward.amount !== undefined && <Row label="Сумма" value={String(reward.amount)} />}
        <p className="border-t border-glass-border pt-3 text-[11px] leading-relaxed text-muted-foreground">{reward.payoutNote}</p>
      </GlassCard>
      {isStars && <GlassCard className="mt-3 space-y-3 px-4 py-4"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Баланс Stars</p><StarsBalance balance={snapshot.stars} size="lg" showProgress /></GlassCard>}
      <div className="mt-5 space-y-2">
        {isStars && <PrimaryButton fullWidth onClick={() => void navigate({ to: "/withdraw" })}>Вывести</PrimaryButton>}
        {!isStars && reward.status === "PENDING" && <NoticeBar>{ui.canWithdraw ? "Выдача приза обрабатывается. Администратор свяжется с вами в Telegram." : "Этот приз будет выдан после завершения сезона."}</NoticeBar>}
        {reward.status === "PROBLEM" && <NoticeBar tone="danger">С этим призом возникла проблема. Обратитесь в поддержку через профиль.</NoticeBar>}
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">{label}</span><span className="truncate font-medium capitalize">{value}</span></div>;
}
