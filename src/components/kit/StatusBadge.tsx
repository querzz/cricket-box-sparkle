import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { RewardStatus, SeasonState, WithdrawalStatus } from "@/lib/types";

type Tone = "pending" | "success" | "problem" | "neutral";

const tones: Record<Tone, string> = {
  pending: "border-warning/40 bg-warning/12 text-warning",
  success: "border-success/40 bg-success/12 text-success",
  problem: "border-destructive/45 bg-destructive/12 text-destructive",
  neutral: "border-glass-border bg-muted/50 text-muted-foreground",
};

const rewardLabels: Record<RewardStatus, { label: string; tone: Tone }> = {
  PENDING: { label: t("rewardStatus.pending"), tone: "pending" },
  RECEIVED: { label: t("rewardStatus.received"), tone: "success" },
  PROBLEM: { label: t("rewardStatus.problem"), tone: "problem" },
};

const withdrawalLabels: Record<WithdrawalStatus, { label: string; tone: Tone }> = {
  PENDING: { label: t("withdrawalStatus.pending"), tone: "pending" },
  PROCESSING: { label: t("withdrawalStatus.processing"), tone: "pending" },
  PAID: { label: t("withdrawalStatus.paid"), tone: "success" },
  REJECTED: { label: t("withdrawalStatus.rejected"), tone: "problem" },
};

const seasonLabels: Record<SeasonState, { label: string; tone: Tone }> = {
  DRAFT: { label: t("seasonStatus.draft"), tone: "neutral" },
  SCHEDULED: { label: t("seasonStatus.scheduled"), tone: "neutral" },
  ACTIVE: { label: t("seasonStatus.active"), tone: "success" },
  ENDING: { label: t("seasonStatus.ending"), tone: "pending" },
  CLOSED: { label: t("seasonStatus.closed"), tone: "problem" },
  PAYOUT: { label: t("seasonStatus.payout"), tone: "pending" },
  ARCHIVED: { label: t("seasonStatus.archived"), tone: "neutral" },
};

export function StatusBadge({
  status,
  className,
}: {
  status:
    | { type: "reward"; value: RewardStatus }
    | { type: "withdrawal"; value: WithdrawalStatus }
    | { type: "season"; value: SeasonState }
    | { type: "custom"; label: string; tone?: Tone };
  className?: string | undefined;
}) {
  const resolved =
    status.type === "reward"
      ? rewardLabels[status.value]
      : status.type === "withdrawal"
        ? withdrawalLabels[status.value]
        : status.type === "season"
          ? seasonLabels[status.value]
          : { label: status.label, tone: status.tone ?? "neutral" };

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
        tones[resolved.tone],
        className,
      )}
    >
      {resolved.label}
    </span>
  );
}
