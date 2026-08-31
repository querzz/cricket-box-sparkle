import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { rewardArt } from "@/components/assets";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { formatDate } from "@/lib/format";
import type { Reward } from "@/lib/types";

export function RewardCard({ reward }: { reward: Reward }) {
  return (
    <Link
      to="/prizes/$rewardId"
      params={{ rewardId: reward.id }}
      className="press glass-panel flex items-center gap-3 rounded-2xl px-3.5 py-3"
    >
      <img
        src={rewardArt[reward.kind]}
        alt=""
        width={512}
        height={512}
        loading="lazy"
        className="size-11 shrink-0 object-contain drop-shadow-[0_0_12px_oklch(0.7_0.15_350_/_35%)]"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{reward.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {reward.subtitle ? `${reward.subtitle} · ` : ""}Won {formatDate(reward.wonAt)}
        </p>
      </div>
      <StatusBadge status={{ type: "reward", value: reward.status }} />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
