import { Loader2, Inbox, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { cn } from "@/lib/utils";

export function LoadingState({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16", className)}>
      <Loader2 className="size-7 animate-spin text-primary" />
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return <div className={cn("h-20 animate-pulse rounded-2xl bg-muted/60", className)} />;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string | undefined;
  icon?: ReactNode | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <GlassCard className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-primary/12 text-primary">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <div>
        <h3 className="font-display text-sm uppercase tracking-[0.16em]">{title}</h3>
        {description && <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </GlassCard>
  );
}

export function ErrorState({
  title = "Network error",
  description = "We couldn't reach the Cricket Box servers. Check your connection and try again.",
  onRetry,
}: {
  title?: string | undefined;
  description?: string | undefined;
  onRetry?: () => void | undefined;
}) {
  return (
    <GlassCard className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-destructive/15 text-destructive">
        <WifiOff className="size-5" />
      </div>
      <div>
        <h3 className="font-display text-sm uppercase tracking-[0.16em]">{title}</h3>
        <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <PrimaryButton variant="outline" onClick={onRetry}>
          Try again
        </PrimaryButton>
      )}
    </GlassCard>
  );
}

export function NoticeBar({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-2.5 text-[11px] leading-relaxed",
        tone === "info" && "border-glass-border bg-muted/40 text-muted-foreground",
        tone === "warning" && "border-warning/35 bg-warning/10 text-warning",
        tone === "danger" && "border-destructive/40 bg-destructive/10 text-destructive",
        className,
      )}
    >
      {children}
    </div>
  );
}
