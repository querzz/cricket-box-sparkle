import { Link } from "@tanstack/react-router";
import { Gift as GiftIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Gift } from "@/lib/types";

export function GiftButton({ gift }: { gift: Gift }) {
  const available = gift.state === "AVAILABLE";
  return (
    <Link
      to="/gift"
      aria-label="Daily gift"
      className={cn(
        "press relative grid size-9 place-items-center rounded-full border border-glass-border",
        available
          ? "[background-image:var(--gradient-primary)] shadow-[var(--shadow-glow)]"
          : "bg-muted/60 text-muted-foreground",
      )}
    >
      <GiftIcon className="size-4" />
      {available && (
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary-glow shadow-[var(--shadow-glow)]" />
      )}
    </Link>
  );
}
