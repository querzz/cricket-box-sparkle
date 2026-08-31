import { assets } from "@/components/assets";
import { StatusBadge } from "@/components/kit/StatusBadge";
import type { User } from "@/lib/types";

export function ProfileHeader({ user }: { user: User }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img
        src={user.avatarUrl ?? assets.mascot}
        alt=""
        width={768}
        height={1024}
        loading="lazy"
        className="size-14 shrink-0 rounded-full border border-glass-border object-cover"
      />
      <div className="min-w-0">
        <p className="truncate font-display text-base">{user.username}</p>
        <StatusBadge
          className="mt-1.5"
          status={{
            type: "custom",
            label: user.isParticipant ? "Active participant" : "Observer",
            tone: user.isParticipant ? "pending" : "neutral",
          }}
        />
      </div>
    </div>
  );
}

export function Avatar({ url, size = 36 }: { url?: string; size?: number }) {
  return (
    <img
      src={url ?? assets.mascot}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full border border-glass-border object-cover"
    />
  );
}
