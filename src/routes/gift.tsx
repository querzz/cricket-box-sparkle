import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { assets } from "@/components/assets";
import { AppShell } from "@/components/kit/AppShell";
import { Countdown } from "@/components/kit/Countdown";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { RewardModal } from "@/components/kit/RewardModal";
import { Sparkles } from "@/components/kit/Sparkles";
import { ErrorState, LoadingState, NoticeBar } from "@/components/kit/States";
import { errorCopy, seasonUi } from "@/lib/season";
import type { Reward } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isServiceError, useSession } from "@/store/session";

export const Route = createFileRoute("/gift")({
  head: () => ({
    meta: [
      { title: "Daily gift — CRICKET BOX" },
      { name: "description", content: "Open your Cricket Box daily gift once every 24 hours." },
      { property: "og:title", content: "Daily gift — CRICKET BOX" },
      { property: "og:description", content: "A free daily gift for active season participants." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GiftScreen,
});

function GiftScreen() {
  const { snapshot, loading, error, refresh, claimGift } = useSession();
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);

  if (loading && !snapshot)
    return (
      <AppShell title="Your gift" back="/" nav={false}>
        <LoadingState />
      </AppShell>
    );
  if (!snapshot)
    return (
      <AppShell title="Your gift" back="/" nav={false}>
        <ErrorState onRetry={() => void refresh()} description={error?.message} />
      </AppShell>
    );

  const ui = seasonUi(snapshot);
  const available = snapshot.gift.state === "AVAILABLE" && ui.canClaimGift;

  const open = async () => {
    if (busy) return;
    setBusy(true);
    setOpening(true);
    const result = await claimGift();
    if (isServiceError(result)) {
      toast.error(errorCopy(result.code));
      setOpening(false);
      setBusy(false);
      return;
    }
    setTimeout(() => {
      setReward(result);
      setOpening(false);
      setBusy(false);
    }, 400);
  };

  return (
    <AppShell title="Your gift" back="/" nav={false}>
      <div className="relative mt-6 grid place-items-center">
        {opening && <Sparkles count={20} />}
        <div
          aria-hidden
          className="absolute size-56 rounded-full bg-primary/32 blur-3xl animate-glow-pulse"
        />
        {available && (
          <>
            <span
              aria-hidden
              className="absolute size-56 rounded-full border border-primary/25 animate-ring-burst"
            />
            <span
              aria-hidden
              className="absolute size-56 rounded-full border border-primary-glow/20 animate-ring-burst [animation-delay:-0.55s]"
            />
          </>
        )}
        <img
          src={assets.gift}
          alt="Daily gift box"
          width={1024}
          height={1024}
          className={cn(
            "relative size-56 object-contain drop-shadow-[0_22px_44px_oklch(0.04_0.02_340_/_80%)]",
            available && !opening && "animate-float",
            opening && "animate-shake",
            !available && "opacity-45 grayscale",
          )}
        />
        <div
          aria-hidden
          className={cn(
            "absolute bottom-1 h-4 w-40 rounded-[100%] bg-primary/30 blur-md",
            !available && "opacity-25",
          )}
        />
      </div>


      <div className="mt-4 text-center">
        <h2 className="font-display text-xl uppercase tracking-[0.14em]">Your daily gift</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {available
            ? "Open your gift and collect internal Stars."
            : snapshot.gift.state === "COOLDOWN"
              ? "Already claimed. Come back later."
              : ui.note}
        </p>
      </div>

      {snapshot.gift.state === "COOLDOWN" && (
        <div className="mt-5 flex justify-center">
          <Countdown target={snapshot.gift.availableAt} label="Next gift in" />
        </div>
      )}

      <div className="mt-7 space-y-3">
        <PrimaryButton
          fullWidth
          size="lg"
          loading={busy}
          disabled={!available}
          onClick={() => void open()}
        >
          {available ? "Open" : snapshot.gift.state === "COOLDOWN" ? "Claimed" : "Unavailable"}
        </PrimaryButton>


        {!ui.canClaimGift && (
          <NoticeBar tone="warning">
            Only active participants of a live season can claim the daily gift.
          </NoticeBar>
        )}

        <p className="text-center text-[11px] text-muted-foreground">
          Available once every 24 hours · active participants only
        </p>
      </div>

      <RewardModal reward={reward} onClaim={() => setReward(null)} />
    </AppShell>
  );
}
