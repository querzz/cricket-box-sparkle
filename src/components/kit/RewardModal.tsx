import { useEffect, useState } from "react";

import { rewardArt } from "@/components/assets";
import { Modal } from "@/components/kit/Modal";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { Sparkles } from "@/components/kit/Sparkles";
import { cn } from "@/lib/utils";
import type { Reward } from "@/lib/types";

interface Props {
  reward: Reward | null;
  onClaim: () => void;
  onSpinAgain?: (() => void) | undefined;
  spinAgainDisabled?: boolean | undefined;
  claiming?: boolean | undefined;
}

/** Suspense beat before the reward is revealed, in ms. Short enough to stay snappy. */
const SUSPENSE_MS = 750;

export function RewardModal({ reward, onClaim, onSpinAgain, spinAgainDisabled, claiming }: Props) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!reward) {
      setRevealed(false);
      return;
    }
    setRevealed(false);
    const t = setTimeout(() => setRevealed(true), SUSPENSE_MS);
    return () => clearTimeout(t);
  }, [reward]);

  if (!reward) return null;
  const empty = reward.kind === "EMPTY";

  return (
    <Modal open onClose={onClaim} className="text-center">
      <div className="relative pb-2 pt-2">
        {revealed && !empty && <Sparkles count={18} />}

        <p className="font-display text-xs uppercase tracking-[0.3em] text-primary-glow">
          {!revealed ? "Opening the box" : empty ? "No luck" : "You won"}
        </p>

        <div className="relative mx-auto mt-5 grid size-40 place-items-center">
          <div
            aria-hidden
            className={cn(
              "absolute size-32 rounded-full bg-primary/45 blur-3xl",
              revealed ? "animate-glow-pulse" : "animate-suspense",
            )}
          />
          {revealed && !empty && (
            <>
              <span
                aria-hidden
                className="absolute size-36 rounded-full border border-primary/40 animate-ring-burst"
              />
              <span
                aria-hidden
                className="absolute size-36 rounded-full border border-primary-glow/30 animate-ring-burst [animation-delay:-0.5s]"
              />
            </>
          )}

          {revealed ? (
            <img
              src={rewardArt[reward.kind]}
              alt={reward.title}
              width={512}
              height={512}
              className="relative size-32 object-contain animate-pop-in drop-shadow-[0_0_32px_oklch(0.78_0.19_348_/_65%)]"
            />
          ) : (
            <span
              aria-hidden
              className="relative size-24 rounded-full bg-primary/25 blur-md animate-suspense"
            />
          )}
        </div>

        <h2
          className={cn(
            "mt-4 min-h-8 font-display text-2xl font-semibold uppercase tracking-[0.1em]",
            revealed && "animate-rise",
          )}
        >
          {revealed ? reward.title : "…"}
        </h2>
        <p className="mt-1.5 min-h-8 text-xs text-muted-foreground">
          {!revealed
            ? "Hold tight"
            : empty
              ? "The box was empty. Try another spin."
              : (reward.subtitle ?? "Congratulations!")}
        </p>

        <div className="mt-6 space-y-2">
          <PrimaryButton
            fullWidth
            size="lg"
            loading={claiming}
            disabled={!revealed}
            onClick={onClaim}
          >
            {empty ? "Close" : "Claim"}
          </PrimaryButton>
          {onSpinAgain && (
            <PrimaryButton
              variant="ghost"
              fullWidth
              disabled={spinAgainDisabled || claiming || !revealed}
              onClick={onSpinAgain}
            >
              Spin again
            </PrimaryButton>
          )}
        </div>
      </div>
    </Modal>
  );
}
