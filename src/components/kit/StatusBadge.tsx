import { cn } from "@/lib/utils";
import type { RewardStatus, SeasonState, WithdrawalStatus } from "@/lib/types";

type Tone = "pending" | "success" | "problem" | "neutral";

const tones: Record<Tone, string> = {
  pending: "border-warning/40 bg-warning/12 text-warning",
  success: "border-success/40 bg-success/12 text-success",
  problem: "border-destructive/45 bg-destructive/12 text-destructive",
  neutral: "border-glass-border bg-muted/50 text-muted-foreground",
};

const rewardLabels: Record<RewardStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "pending" },
  RECEIVED: { label: "Received", tone: "success" },
  PROBLEM: { label: "Problem", tone: "problem" },
};

const withdrawalLabels: Record<WithdrawalStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "pending" },
  PROCESSING: { label: "Processing", tone: "pending" },
  PAID: { label: "Paid", tone: "success" },
  REJECTED: { label: "Rejected", tone: "problem" },
};

const seasonLabels: Record<SeasonState, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SCHEDULED: { label: "Starts soon", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "success" },
  ENDING: { label: "Ending soon", tone: "pending" },
  CLOSED: { label: "Season ended", tone: "problem" },
  PAYOUT: { label: "Payout", tone: "pending" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
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
