import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose?: (() => void) | undefined;
  children: ReactNode;
  className?: string | undefined;
  dismissible?: boolean | undefined;
}

export function Modal({ open, onClose, children, className, dismissible = true }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-background/85 backdrop-blur-md animate-in fade-in"
        onClick={dismissible ? onClose : undefined}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "glass-panel relative z-10 w-full max-w-[430px] rounded-t-3xl px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 animate-rise sm:rounded-3xl sm:pb-6",
          className,
        )}
      >
        {dismissible && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-muted/60 text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string | undefined;
  confirmLabel?: string | undefined;
  cancelLabel?: string | undefined;
  loading?: boolean | undefined;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={loading ? undefined : onClose} dismissible={!loading}>
      <div className="space-y-5 text-center">
        <div>
          <h2 className="font-display text-base uppercase tracking-[0.16em]">{title}</h2>
          {description && <p className="mt-2 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="space-y-2">
          <PrimaryButton fullWidth loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </PrimaryButton>
          <PrimaryButton variant="ghost" fullWidth disabled={loading} onClick={onClose}>
            {cancelLabel}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
