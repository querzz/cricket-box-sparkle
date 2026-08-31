import { useState } from "react";

import { Modal } from "@/components/kit/Modal";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { NoticeBar } from "@/components/kit/States";
import { StarsBalance } from "@/components/kit/StarsBalance";
import type { StarsBalance as StarsBalanceModel } from "@/lib/types";

interface Props {
  open: boolean;
  balance: StarsBalanceModel;
  minimum: number;
  allowed: boolean;
  submitting: boolean;
  error?: string | null | undefined;
  onClose: () => void;
  onSubmit: (amount: number) => void;
}

export function WithdrawalModal({
  open,
  balance,
  minimum,
  allowed,
  submitting,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [amount, setAmount] = useState(minimum);
  const [confirming, setConfirming] = useState(false);

  const valid = amount >= minimum && amount <= balance.amount;

  return (
    <Modal open={open} onClose={submitting ? undefined : onClose} dismissible={!submitting}>
      <div className="space-y-5">
        <div className="text-center">
          <h2 className="font-display text-base uppercase tracking-[0.18em]">Withdraw Stars</h2>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Internal Cricket Box Stars — not your personal Telegram Stars.
          </p>
        </div>

        <StarsBalance balance={balance} size="lg" showProgress className="items-start" />

        {!allowed ? (
          <NoticeBar tone="warning">
            Withdrawals open when the season enters the payout stage.
          </NoticeBar>
        ) : (
          <>
            <div className="space-y-2">
              <label
                htmlFor="withdraw-amount"
                className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
              >
                Amount
              </label>
              <input
                id="withdraw-amount"
                type="number"
                inputMode="numeric"
                min={minimum}
                max={balance.amount}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full rounded-xl border border-input bg-muted/40 px-4 py-3 font-display text-lg tabular-nums outline-none focus:border-ring"
              />
              <div className="flex gap-2">
                {[minimum, 100, balance.amount].map((preset, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAmount(preset)}
                    className="press rounded-full border border-glass-border bg-muted/40 px-3 py-1.5 text-[11px]"
                  >
                    {i === 2 ? "Max" : preset}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Minimum withdrawal: {minimum} Stars. Available: {balance.amount} Stars.
              </p>
            </div>

            {error && <NoticeBar tone="danger">{error}</NoticeBar>}

            <NoticeBar>
              No payment details are stored in the app. Payouts are handled by an administrator
              after review.
            </NoticeBar>

            {confirming ? (
              <div className="space-y-2">
                <p className="text-center text-xs text-muted-foreground">
                  Request withdrawal of {amount} Stars?
                </p>
                <PrimaryButton fullWidth loading={submitting} onClick={() => onSubmit(amount)}>
                  {submitting ? "Processing" : "Confirm"}
                </PrimaryButton>
                <PrimaryButton
                  variant="ghost"
                  fullWidth
                  disabled={submitting}
                  onClick={() => setConfirming(false)}
                >
                  Back
                </PrimaryButton>
              </div>
            ) : (
              <PrimaryButton fullWidth disabled={!valid} onClick={() => setConfirming(true)}>
                Continue
              </PrimaryButton>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
