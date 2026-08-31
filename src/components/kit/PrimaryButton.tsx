import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline";
type Size = "md" | "lg";

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant | undefined;
  size?: Size | undefined;
  loading?: boolean | undefined;
  fullWidth?: boolean | undefined;
  children: ReactNode;
}

const base =
  "press relative inline-flex items-center justify-center gap-2 rounded-full font-display font-semibold uppercase tracking-[0.18em] disabled:pointer-events-none disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary:
    "text-primary-foreground shadow-[var(--shadow-glow)] [background-image:var(--gradient-primary)] border border-glass-border",
  outline:
    "border border-primary/60 text-foreground bg-primary/10 backdrop-blur-md shadow-[0_0_24px_-14px_var(--color-primary)]",
  ghost: "text-muted-foreground",
};

const sizes: Record<Variant, Record<Size, string>> = {
  primary: { md: "px-7 py-4 text-sm", lg: "px-8 py-[1.15rem] text-base tracking-[0.2em]" },
  outline: { md: "px-6 py-3.5 text-sm", lg: "px-7 py-4 text-sm" },
  ghost: { md: "px-5 py-3 text-sm", lg: "px-6 py-3.5 text-sm" },
};

export function PrimaryButton({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...rest
}: PrimaryButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        base,
        variants[variant],
        sizes[variant][size],
        fullWidth && "w-full",
        "overflow-hidden",
        isPrimary && !disabled && size === "lg" && "shadow-[var(--shadow-glow-strong)]",
        className,
      )}
      {...rest}
    >
      {isPrimary && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-foreground/25 to-transparent"
        />
      )}
      {isPrimary && !disabled && !loading && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-foreground/25 blur-md animate-sheen"
        />
      )}
      {loading && <Loader2 className="relative size-4 animate-spin" />}
      <span className="relative">{children}</span>
    </button>
  );
}
