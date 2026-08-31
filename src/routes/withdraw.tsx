import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { EmptyState, ErrorState, LoadingState, NoticeBar } from "@/components/kit/States";
import { StarsBalance } from "@/components/kit/StarsBalance";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { WithdrawalModal } from "@/components/kit/WithdrawalModal";
import { formatDate } from "@/lib/format";
import { errorCopy, seasonUi } from "@/lib/season";
import { isServiceError, useSession } from "@/store/session";

export const Route = createFileRoute("/withdraw")({
  head: () => ({
    meta: [
      { title: "Withdraw Stars — CRICKET BOX" },
      {
        name: "description",
        content: "Request a withdrawal of your internal Cricket Box Stars after the season.",
      },
      { property: "og:title", content: "Withdraw Stars — CRICKET BOX" },
      { property: "og:description", content: "Internal Stars withdrawal requests and their status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WithdrawScreen,
});

function WithdrawScreen() {
  const { snapshot, loading, error, refresh, requestWithdrawal } = useSession();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (loading && !snapshot)
    return (
      <AppShell title="Withdrawals" back="/profile" nav={false}>
        <LoadingState />
      </AppShell>
    );
  if (!snapshot)
    return (
      <AppShell title="Withdrawals" back="/profile" nav={false}>
        <ErrorState onRetry={() => void refresh()} description={error?.message} />
      </AppShell>
    );

  const ui = seasonUi(snapshot);

  const submit = async (amount: number) => {
    setSubmitting(true);
    setFormError(null);
    const result = await requestWithdrawal(amount);
    setSubmitting(false);
    if (isServiceError(result)) {
      setFormError(errorCopy(result.code));
      return;
    }
    setOpen(false);
    toast.success("Withdrawal request submitted");
  };

  return (
    <AppShell title="Withdrawals" back="/profile" nav={false}>
      <GlassCard className="px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Internal Stars balance
        </p>
        <StarsBalance balance={snapshot.stars} size="lg" showProgress className="mt-2" />
        <PrimaryButton
          fullWidth
          className="mt-4"
          disabled={!ui.canWithdraw || snapshot.stars.amount < snapshot.withdrawalMinimum}
          onClick={() => setOpen(true)}
        >
          Withdraw
        </PrimaryButton>
        {!ui.canWithdraw && (
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Withdrawals open when the season closes.
          </p>
        )}
      </GlassCard>

      <NoticeBar className="mt-3">
        Internal Cricket Box Stars are not your personal Telegram Stars. Minimum withdrawal:{" "}
        {snapshot.withdrawalMinimum} Stars.
      </NoticeBar>

      <h2 className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Requests
      </h2>
      <div className="mt-3 space-y-2.5">
        {snapshot.withdrawals.length === 0 ? (
          <EmptyState title="No requests yet" description="Your withdrawal requests appear here." />
        ) : (
          snapshot.withdrawals.map((w) => (
            <GlassCard key={w.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{w.amount} Stars</p>
                <p className="text-[11px] text-muted-foreground">
                  {w.rewardTitle} · {formatDate(w.requestedAt)}
                </p>
              </div>
              <StatusBadge status={{ type: "withdrawal", value: w.status }} />
            </GlassCard>
          ))
        )}
      </div>

      <WithdrawalModal
        open={open}
        balance={snapshot.stars}
        minimum={snapshot.withdrawalMinimum}
        allowed={ui.canWithdraw}
        submitting={submitting}
        error={formError}
        onClose={() => setOpen(false)}
        onSubmit={(amount) => void submit(amount)}
      />
    </AppShell>
  );
}
