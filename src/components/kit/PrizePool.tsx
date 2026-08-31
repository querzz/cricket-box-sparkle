import { rewardArt } from "@/components/assets";
import { GlassCard } from "@/components/kit/GlassCard";
import { cn } from "@/lib/utils";
import type { Prize, RewardKind } from "@/lib/types";

/** Presentation-only rarity mapping derived from reward kind. Business data stays in services. */
const rarity: Record<RewardKind, { label: string; className: string }> = {
  NFT: { label: "Legendary", className: "text-gold border-gold/40 bg-gold/10" },
  MONEY: { label: "Epic", className: "text-primary-glow border-primary/40 bg-primary/10" },
  PREMIUM: { label: "Rare", className: "text-primary-glow border-primary/35 bg-primary/10" },
  STARS: { label: "Common", className: "text-muted-foreground border-glass-border bg-muted/40" },
  EMPTY: { label: "Blank", className: "text-muted-foreground border-glass-border bg-muted/40" },
};

export function PrizePool({ prizes, className }: { prizes: Prize[]; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {prizes.map((prize) => {
        const pct = prize.total > 0 ? Math.round((prize.remaining / prize.total) * 100) : 0;
        const tier = rarity[prize.kind];
        const low = pct <= 20;
        return (
          <GlassCard key={prize.id} className="flex items-center gap-3.5 px-4 py-3.5">
            <div className="relative grid size-12 shrink-0 place-items-center rounded-xl border border-glass-border bg-primary/10">
              <div
                aria-hidden
                className="absolute size-8 rounded-full bg-primary/35 blur-lg"
              />
              <img
                src={rewardArt[prize.kind]}
                alt=""
                width={512}
                height={512}
                loading="lazy"
                className="relative size-9 object-contain"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">{prize.title}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em]",
                    tier.className,
                  )}
                >
                  {tier.label}
                </span>
              </div>
              {prize.subtitle && (
                <p className="truncate text-[11px] text-muted-foreground">{prize.subtitle}</p>
              )}
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    low
                      ? "bg-warning"
                      : "[background-image:var(--gradient-primary)] shadow-[0_0_12px_-2px_var(--color-primary)]",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="font-display text-lg leading-none">{prize.remaining}</p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                of {prize.total}
              </p>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

export function PrizeStrip({ prizes }: { prizes: Prize[] }) {
  return (
    <ul className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
      {prizes.map((prize) => (
        <li key={prize.id} className="shrink-0">
          <div className="glass-panel gloss-top relative grid size-16 place-items-center overflow-hidden rounded-2xl">
            <div aria-hidden className="absolute size-10 rounded-full bg-primary/30 blur-lg" />
            <img
              src={rewardArt[prize.kind]}
              alt={prize.title}
              width={512}
              height={512}
              loading="lazy"
              className="relative size-10 object-contain"
            />
            <span className="absolute bottom-0.5 right-1 text-[9px] font-semibold text-muted-foreground">
              {prize.remaining}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
