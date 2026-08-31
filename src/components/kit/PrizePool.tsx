import { useRef, useState, type PointerEvent } from "react";
import { rewardArt } from "@/components/assets";
import { GlassCard } from "@/components/kit/GlassCard";
import { cn } from "@/lib/utils";
import type { Prize, RewardKind } from "@/lib/types";

/** Presentation-only rarity mapping derived from reward kind. Business data stays in services. */
const rarity: Record<RewardKind, { label: string; className: string }> = {
  NFT: { label: "Легендарный", className: "text-gold border-gold/40 bg-gold/10" },
  MONEY: { label: "Эпический", className: "text-primary-glow border-primary/40 bg-primary/10" },
  PREMIUM: { label: "Редкий", className: "text-primary-glow border-primary/35 bg-primary/10" },
  STARS: { label: "Обычный", className: "text-muted-foreground border-glass-border bg-muted/40" },
  EMPTY: { label: "Пусто", className: "text-muted-foreground border-glass-border bg-muted/40" },
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
              <div aria-hidden className="absolute size-8 rounded-full bg-primary/35 blur-lg" />
              <img src={rewardArt[prize.kind]} alt="" width={512} height={512} loading="lazy" className="relative size-9 object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">{prize.title}</p>
                <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em]", tier.className)}>{tier.label}</span>
              </div>
              {prize.subtitle && <p className="truncate text-[11px] text-muted-foreground">{prize.subtitle}</p>}
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
                <div className={cn("h-full rounded-full transition-[width] duration-500", low ? "bg-warning" : "[background-image:var(--gradient-primary)] shadow-[0_0_12px_-2px_var(--color-primary)]")} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-lg leading-none">{prize.remaining}</p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">из {prize.total}</p>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

const getHomePrizeLabel = (prize: Prize) => {
  if (prize.kind === "MONEY") return prize.title;
  if (prize.kind === "PREMIUM") return prize.subtitle ? `${prize.title} · ${prize.subtitle}` : prize.title;
  if (prize.kind === "STARS") return prize.title;
  if (prize.kind === "NFT") return prize.title;
  return null;
};

export function PrizeStrip({ prizes }: { prizes: Prize[] }) {
  const visiblePrizes = prizes.filter((prize) => prize.kind !== "EMPTY");
  const scrollerRef = useRef<HTMLUListElement | null>(null);
  const drag = useRef({ active: false, x: 0, left: 0 });
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event: PointerEvent<HTMLUListElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    drag.current = { active: true, x: event.clientX, left: el.scrollLeft };
    setDragging(true);
    el.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLUListElement>) => {
    const el = scrollerRef.current;
    if (!el || !drag.current.active) return;
    el.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
  };

  const stopDrag = () => {
    drag.current.active = false;
    setDragging(false);
  };

  return (
    <ul
      ref={scrollerRef}
      className={cn(
        "no-scrollbar flex touch-pan-x gap-2 overflow-x-auto pb-1 pr-1 select-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onPointerLeave={stopDrag}
      aria-label="Список возможных призов"
    >
      {visiblePrizes.map((prize) => {
        const label = getHomePrizeLabel(prize);
        return (
          <li key={prize.id} className="w-[86px] shrink-0 text-center">
            <div className="glass-panel gloss-top relative mx-auto grid size-[68px] place-items-center overflow-hidden rounded-full">
              <div aria-hidden className="absolute size-11 rounded-full bg-primary/30 blur-lg" />
              <img src={rewardArt[prize.kind]} alt="" width={512} height={512} loading="lazy" className="relative size-11 object-contain" />
            </div>
            {label && <p className="mt-2 min-h-[30px] text-[10px] font-semibold leading-tight text-foreground">{label}</p>}
          </li>
        );
      })}
    </ul>
  );
}
