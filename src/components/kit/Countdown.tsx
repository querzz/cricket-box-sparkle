import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { timeUntil } from "@/lib/format";

interface Props {
  target: string;
  label?: string | undefined;
  compact?: boolean | undefined;
  onComplete?: () => void | undefined;
  className?: string | undefined;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function Countdown({ target, label, compact = false, onComplete, className }: Props) {
  const [parts, setParts] = useState(() => timeUntil(target));

  useEffect(() => {
    setParts(timeUntil(target));
    const id = setInterval(() => {
      const next = timeUntil(target);
      setParts(next);
      if (next.done) {
        clearInterval(id);
        onComplete?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [target, onComplete]);

  const cells = [
    { value: parts.days > 0 ? parts.days : parts.hours, unit: parts.days > 0 ? "days" : "hrs" },
    { value: parts.days > 0 ? parts.hours : parts.minutes, unit: parts.days > 0 ? "hrs" : "min" },
    { value: parts.days > 0 ? parts.minutes : parts.seconds, unit: parts.days > 0 ? "min" : "sec" },
  ];

  if (compact) {
    return (
      <span className={cn("font-display text-sm tabular-nums", className)}>
        {cells.map((c) => pad(c.value)).join(":")}
      </span>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </p>
      )}
      <div className="flex items-end gap-2">
        {cells.map((cell, i) => (
          <div key={cell.unit} className="flex items-end gap-2">
            <div className="text-center">
              <div className="font-display text-2xl font-semibold tabular-nums leading-none">
                {pad(cell.value)}
              </div>
              <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                {cell.unit}
              </div>
            </div>
            {i < cells.length - 1 && (
              <span className="pb-4 font-display text-xl text-primary/60">:</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
