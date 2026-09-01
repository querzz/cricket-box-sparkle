import { useEffect, useState } from "react";

import { rewardArt } from "@/components/assets";
import { Modal } from "@/components/kit/Modal";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { Sparkles } from "@/components/kit/Sparkles";
import { cn } from "@/lib/utils";
import type { Reward } from "@/lib/types";

interface Props {
  reward: Reward | null;
  onClaim: () => void;
  onSpinAgain?: (() => void) | undefined;
  spinAgainDisabled?: boolean | undefined;
  claiming?: boolean | undefined;
}

const SUSPENSE_MS = 750;

export function RewardModal({ reward, onClaim, onSpinAgain, spinAgainDisabled, claiming }: Props) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!reward) {
      setRevealed(false);
      return;
    }
    setRevealed(false);
    const t = setTimeout(() => setRevealed(true), SUSPENSE_MS);
    return () => clearTimeout(t);
  }, [reward]);

  if (!reward) return null;
  const empty = reward.kind === "EMPTY" || reward.kind === "NOTHING";
  const uncredited = reward.uncreditedAmount ?? 0;
  const capped = reward.kind === "STARS" && uncredited > 0;
  const eyebrow = !revealed ? "Открываем коробку" : empty ? "Не повезло" : reward.kind === "XP" ? "Награда за активность" : "Вы выиграли";
  const subtitle = !revealed
    ? "Секунду…"
    : empty
      ? "Коробка оказалась пустой. Попробуй снова завтра."
      : reward.kind === "XP"
        ? `Опыт +${reward.amount ?? 0} XP. Уровень прокачивается автоматически.`
        : reward.kind === "FREE_SPIN"
          ? "Бонусная прокрутка сохранена — её можно использовать после основной ежедневной попытки."
          : (reward.subtitle ?? "Поздравляем!");

  return (
    <Modal open onClose={onClaim} className="text-center">
      <div className="relative pb-2 pt-2">
        {revealed && !empty && <Sparkles count={18} />}

        <p className="font-display text-xs uppercase tracking-[0.3em] text-primary-glow">{eyebrow}</p>

        <div className="relative mx-auto mt-5 grid size-40 place-items-center">
          <div aria-hidden className={cn("absolute size-32 rounded-full bg-primary/45 blur-3xl", revealed ? "animate-glow-pulse" : "animate-suspense")} />
          {revealed && !empty && (
            <>
              <span aria-hidden className="absolute size-36 rounded-full border border-primary/40 animate-ring-burst" />
              <span aria-hidden className="absolute size-36 rounded-full border border-primary-glow/30 animate-ring-burst [animation-delay:-0.5s]" />
            </>
          )}

          {revealed ? (
            reward.kind === "XP" ? (
              <span className="relative grid size-32 place-items-center rounded-full border border-primary/30 bg-primary/10 font-display text-3xl text-primary glow-text animate-pop-in">XP</span>
            ) : reward.kind === "FREE_SPIN" ? (
              <span className="relative grid size-32 place-items-center rounded-full border border-primary/30 bg-primary/10 text-5xl animate-pop-in">🎰</span>
            ) : (
              <img src={rewardArt[reward.kind]} alt={reward.title} width={512} height={512} className="relative size-32 object-contain animate-pop-in drop-shadow-[0_0_32px_oklch(0.78_0.19_348_/_65%)]" />
            )
          ) : (
            <span aria-hidden className="relative size-24 rounded-full bg-primary/25 blur-md animate-suspense" />
          )}
        </div>

        <h2 className={cn("mt-4 min-h-8 font-display text-2xl font-semibold uppercase tracking-[0.1em]", revealed && "animate-rise")}>{revealed ? reward.title : "…"}</h2>
        <p className="mt-1.5 min-h-8 text-xs text-muted-foreground">{subtitle}</p>

        {revealed && capped && (
          <div className="mt-4 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warning">Достигнут лимит баланса</p>
            <dl className="mt-2 space-y-1 text-[11px]">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Награда</dt><dd className="font-semibold">{reward.amount} Stars</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Зачислено</dt><dd className="font-semibold">{reward.creditedAmount ?? 0} Stars</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Не зачислено</dt><dd className="font-semibold text-warning">{uncredited} Stars</dd></div>
            </dl>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Потрать Stars, чтобы освободить место для новых наград.</p>
          </div>
        )}

        <div className="mt-6 space-y-2">
          <PrimaryButton fullWidth size="lg" loading={claiming} disabled={!revealed} onClick={onClaim}>{empty ? "Закрыть" : "Забрать"}</PrimaryButton>
          {onSpinAgain && <PrimaryButton variant="ghost" fullWidth disabled={spinAgainDisabled || claiming || !revealed} onClick={onSpinAgain}>Крутить ещё</PrimaryButton>}
        </div>
      </div>
    </Modal>
  );
}
