import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

type GlassCardProps = {
  as?: ElementType | undefined;
  glow?: boolean | undefined;
  children: ReactNode;
} & ComponentPropsWithoutRef<"div">;

export function GlassCard({ as, glow = false, className, children, ...rest }: GlassCardProps) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      className={cn(
        "glass-panel gloss-top relative overflow-hidden rounded-2xl",
        glow && "shadow-[var(--shadow-glow)]",
        className,
      )}

      {...rest}
    >
      {children}
    </Tag>
  );
}
