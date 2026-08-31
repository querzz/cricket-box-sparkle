import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { LoadingState, NoticeBar } from "@/components/kit/States";
import { cn } from "@/lib/utils";
import type { SeasonState } from "@/lib/types";
import { useSession } from "@/store/session";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — CRICKET BOX" },
      { name: "description", content: "Season state preview and participation settings." },
      { property: "og:title", content: "Settings — CRICKET BOX" },
      { property: "og:description", content: "Preview every Cricket Box season state." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsScreen,
});

const states: SeasonState[] = [
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "ENDING",
  "CLOSED",
  "PAYOUT",
  "ARCHIVED",
];

function SettingsScreen() {
  const { snapshot, setSeasonState, setSubscribed, resetSession } = useSession();

  if (!snapshot)
    return (
      <AppShell title="Settings" back="/profile" nav={false}>
        <LoadingState />
      </AppShell>
    );

  return (
    <AppShell title="Settings" back="/profile" nav={false}>
      <NoticeBar>
        Preview tools. In production these values come from the backend, never from the client.
      </NoticeBar>

      <GlassCard className="mt-4 px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Season state
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {states.map((state) => (
            <button
              key={state}
              type="button"
              onClick={() => void setSeasonState(state)}
              className={cn(
                "press rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                snapshot.season.state === state
                  ? "border-transparent text-primary-foreground [background-image:var(--gradient-primary)]"
                  : "border-glass-border bg-muted/40 text-muted-foreground",
              )}
            >
              {state}
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="mt-3 flex items-center gap-3 px-4 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Channel subscription</p>
          <p className="text-[11px] text-muted-foreground">
            {snapshot.user.isSubscribed ? "Subscribed" : "Not subscribed"}
          </p>
        </div>
        <PrimaryButton
          variant="outline"
          onClick={() => void setSubscribed(!snapshot.user.isSubscribed)}
        >
          Toggle
        </PrimaryButton>
      </GlassCard>

      <PrimaryButton variant="ghost" fullWidth className="mt-4" onClick={() => void resetSession()}>
        Reset mock session
      </PrimaryButton>
    </AppShell>
  );
}
