import { assets } from "@/components/assets";
import { cn } from "@/lib/utils";
import type { StarsBalance as StarsBalanceModel } from "@/lib/types";

interface Props {
  balance: StarsBalanceModel;
  size?: "sm" | "md" | "lg" | undefined;
  showMax?: boolean | undefined;
  showProgress?: boolean | undefined;
  className?: string | undefined;
}

export function StarsBalance({
  balance,
  size = "md",
  showMax = true,
  showProgress = false,
  className,
}: Props) {
  const pct = Math.min(100, Math.round((balance.amount / balance.max) * 100));
  const full = balance.amount >= balance.max;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        <img
          src={assets.star}
          alt=""
          width={512}
          height={512}
          loading="lazy"
          className={cn(
            "object-contain drop-shadow-[0_0_10px_oklch(0.83_0.14_85_/_45%)]",
            size === "sm" ? "size-4" : size === "md" ? "size-6" : "size-9",
          )}
        />
        <span
          className={cn(
            "font-display font-semibold leading-none",
            size === "sm" ? "text-sm" : size === "md" ? "text-lg" : "text-3xl",
          )}
        >
          {balance.amount}
          {showMax && (
            <span className="text-muted-foreground"> / {balance.max}</span>
          )}
        </span>
      </div>

      {showProgress && (
        <div className="space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                full ? "bg-warning" : "[background-image:var(--gradient-primary)]",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {full
              ? "Balance full — spend Stars to receive new Stars rewards."
              : "Internal Cricket Box Stars, separate from your Telegram Stars."}
          </p>
        </div>
      )}
    </div>
  );
}
