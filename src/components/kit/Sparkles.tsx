import { useMemo } from "react";

import { cn } from "@/lib/utils";

/** Lightweight CSS particle field. Count stays low for mobile performance. */
export function Sparkles({ count = 14, className }: { count?: number; className?: string }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${Math.round(Math.random() * 100)}%`,
        top: `${Math.round(40 + Math.random() * 55)}%`,
        size: 3 + Math.round(Math.random() * 5),
        x: `${Math.round(Math.random() * 60 - 30)}px`,
        y: `${-40 - Math.round(Math.random() * 90)}px`,
        delay: `${(Math.random() * 1.4).toFixed(2)}s`,
      })),
    [count],
  );

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full bg-primary-glow animate-spark"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            ["--spark-x" as string]: p.x,
            ["--spark-y" as string]: p.y,
            boxShadow: "0 0 10px 2px oklch(0.75 0.15 350 / 60%)",
          }}
        />
      ))}
    </div>
  );
}
