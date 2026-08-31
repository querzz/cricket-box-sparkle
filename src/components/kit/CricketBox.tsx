import { assets } from "@/components/assets";
import { Sparkles } from "@/components/kit/Sparkles";
import { cn } from "@/lib/utils";

export type BoxPhase = "idle" | "charging" | "opening" | "disabled";

interface Props {
  phase?: BoxPhase | undefined;
  size?: "sm" | "md" | "lg" | undefined;
  className?: string | undefined;
}

const sizes = { sm: "size-32", md: "size-48", lg: "size-60" } as const;

export function CricketBox({ phase = "idle", size = "md", className }: Props) {
  const dim = phase === "disabled";

  return (
    <div className={cn("relative grid place-items-center", className)}>
      {/* Ambient halo */}
      <div
        aria-hidden
        className={cn(
          "absolute size-[82%] rounded-full bg-primary/40 blur-3xl",
          phase === "charging"
            ? "animate-glow-pulse [animation-duration:0.8s]"
            : "animate-glow-pulse",
          dim && "opacity-20",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "absolute size-[55%] rounded-full bg-primary-glow/35 blur-2xl",
          dim && "opacity-20",
        )}
      />

      {/* Energy rings */}
      {!dim && (
        <>
          <span
            aria-hidden
            className="absolute size-[78%] rounded-full border border-primary/25 animate-ring-burst"
          />
          <span
            aria-hidden
            className="absolute size-[78%] rounded-full border border-primary-glow/20 animate-ring-burst [animation-delay:-0.55s]"
          />
        </>
      )}

      {phase === "opening" && <Sparkles count={16} />}

      <img
        src={assets.cricketBox}
        alt="Cricket Box"
        width={1024}
        height={1024}
        className={cn(
          "relative object-contain drop-shadow-[0_26px_44px_oklch(0.04_0.02_340_/_85%)]",
          sizes[size],
          phase === "idle" && "animate-float",
          phase === "charging" && "animate-shake",
          phase === "opening" && "scale-105 transition-transform duration-500",
          dim && "opacity-45 grayscale",
        )}
      />

      {/* Floor reflection */}
      <div
        aria-hidden
        className={cn(
          "absolute bottom-0 h-4 w-[55%] rounded-[100%] bg-primary/35 blur-md",
          dim && "opacity-20",
        )}
      />
    </div>
  );
}
