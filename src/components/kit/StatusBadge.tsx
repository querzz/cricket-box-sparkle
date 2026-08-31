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
  PENDING: { label: "Ожидает", tone: "pending" },
  RECEIVED: { label: "Получен", tone: "success" },
  PROBLEM: { label: "Проблема", tone: "problem" },
};

const withdrawalLabels: Record<WithdrawalStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Ожидает", tone: "pending" },
  PROCESSING: { label: "Обрабатывается", tone: "pending" },
  PAID: { label: "Выплачено", tone: "success" },
  REJECTED: { label: "Отклонено", tone: "problem" },
};

const seasonLabels: Record<SeasonState, { label: string; tone: Tone }> = {
  DRAFT: { label: "Черновик", tone: "neutral" },
  SCHEDULED: { label: "Скоро старт", tone: "neutral" },
  ACTIVE: { label: "Активен", tone: "success" },
  ENDING: { label: "Скоро конец", tone: "pending" },
  CLOSED: { label: "Сезон завершён", tone: "problem" },
  PAYOUT: { label: "Выдача призов", tone: "pending" },
  ARCHIVED: { label: "В архиве", tone: "neutral" },
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
