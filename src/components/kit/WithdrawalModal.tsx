import { useState } from "react";

import { Modal } from "@/components/kit/Modal";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { NoticeBar } from "@/components/kit/States";
import { StarsBalance } from "@/components/kit/StarsBalance";
import type { StarsBalance as StarsBalanceModel } from "@/lib/types";
import { t } from "@/lib/i18n";

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
          <h2 className="font-display text-base uppercase tracking-[0.18em]">{t("withdrawal.title")}</h2>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t("withdrawal.balanceNotice")}
          </p>
        </div>

        <StarsBalance balance={balance} size="lg" showProgress className="items-start" />

        {!allowed ? (
          <NoticeBar tone="warning">
            {t("withdrawal.unavailableNotice")}
          </NoticeBar>
        ) : (
          <>
            <div className="space-y-2">
              <label
                htmlFor="withdraw-amount"
                className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
              >
                {t("withdrawal.amount")}
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
                    {i === 2 ? t("withdrawal.max") : preset}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("withdrawal.available", { minimum, balance: balance.amount })}
              </p>
            </div>

            {error && <NoticeBar tone="danger">{error}</NoticeBar>}

            <NoticeBar>
              {t("withdrawal.paymentNotice")}
            </NoticeBar>

            {confirming ? (
              <div className="space-y-2">
                <p className="text-center text-xs text-muted-foreground">
                  {t("withdrawal.confirmQuestion", { amount })}
                </p>
                <PrimaryButton fullWidth loading={submitting} onClick={() => onSubmit(amount)}>
                  {submitting ? t("common.processing") : t("common.confirm")}
                </PrimaryButton>
                <PrimaryButton
                  variant="ghost"
                  fullWidth
                  disabled={submitting}
                  onClick={() => setConfirming(false)}
                >
                  {t("withdrawal.back")}
                </PrimaryButton>
              </div>
            ) : (
              <PrimaryButton fullWidth disabled={!valid} onClick={() => setConfirming(true)}>
                {t("common.continue")}
              </PrimaryButton>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
