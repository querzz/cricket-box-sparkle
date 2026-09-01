import type { SeasonState, SessionSnapshot } from "./types";

export interface SeasonUi {
  /** Season accepts spins/gifts. */
  isLive: boolean;
  /** Season is over — no countdown, no attempts, payout phase copy. */
  isFinished: boolean;
  /** Season is waiting to be started manually/scheduled. */
  isWaiting: boolean;
  canSpin: boolean;
  canClaimGift: boolean;
  canWithdraw: boolean;
  headline: string;
  note: string;
  ctaLabel: string;
  countdownTarget: string | null;
  countdownLabel: string | null;
}

const headlines: Record<SeasonState, { headline: string; note: string }> = {
  DRAFT: { headline: "Сезон готовится", note: "Следующий Cricket Box сейчас собирается." },
  SCHEDULED: { headline: "Скоро старт", note: "Возвращайся, когда наступит время старта сезона." },
  ACTIVE: { headline: "Сезон активен", note: "Крути Cricket Box и собирай призы." },
  ENDING: { headline: "Сезон заканчивается", note: "Последние попытки перед закрытием бокса." },
  CLOSED: { headline: "Сезон завершён", note: "Новые прокрутки закрыты, призы проверяются." },
  PAYOUT: { headline: "Выдача призов", note: "Для этого сезона открыта выдача наград." },
  ARCHIVED: { headline: "Сезон в архиве", note: "Этот сезон теперь доступен в истории." },
};

export function seasonUi(snapshot: SessionSnapshot): SeasonUi {
  const state = snapshot.season.state;
  const live = state === "ACTIVE" || state === "ENDING";
  const finished = state === "CLOSED" || state === "PAYOUT" || state === "ARCHIVED";
  const waiting = state === "DRAFT" || state === "SCHEDULED";
  const subscribed = snapshot.user.isSubscribed;
  const participant = snapshot.user.isParticipant;
  const meta = headlines[state];

  let countdownTarget: string | null = null;
  let countdownLabel: string | null = null;

  if (state === "SCHEDULED" && snapshot.season.startsAt) {
    countdownTarget = snapshot.season.startsAt;
    countdownLabel = "Сезон начнётся через";
  } else if ((state === "ACTIVE" || state === "ENDING") && snapshot.season.endsAt) {
    countdownTarget = snapshot.season.endsAt;
    countdownLabel = state === "ENDING" ? "Сезон завершится через" : "Сезон закончится через";
  }

  return {
    isLive: live,
    isFinished: finished,
    isWaiting: waiting,
    canSpin: live && subscribed && participant,
    canClaimGift: live && subscribed && participant,
    canWithdraw: state === "PAYOUT" || state === "CLOSED",
    headline: meta.headline,
    note: meta.note,
    ctaLabel: live ? "Крутить" : waiting ? "Ещё не начался" : "Закрыт",
    countdownTarget,
    countdownLabel,
  };
}

export function errorCopy(code: string): string {
  switch (code) {
    case "NO_ATTEMPTS":
      return "Бесплатная попытка уже использована. Купи дополнительную прокрутку за Stars.";
    case "INSUFFICIENT_STARS":
      return "Недостаточно Stars для этого действия.";
    case "STARS_FULL":
      return "Баланс Stars заполнен. Потрать Stars, чтобы освободить место.";
    case "SEASON_CLOSED":
      return "Сезон завершён.";
    case "SEASON_NOT_ACTIVE":
      return "Сейчас нет активного сезона.";
    case "SEASON_NOT_STARTED":
      return "Сезон ещё не начался.";
    case "NOT_SUBSCRIBED":
      return "Подпишись на канал, чтобы участвовать.";
    case "NOT_PARTICIPANT":
      return "Ты пока не участвуешь в этом сезоне.";
    case "NO_PRIZES":
      return "В этом сезоне сейчас нет доступных призов.";
    case "PAID_SPIN_DISABLED":
      return "Платные прокрутки сейчас недоступны.";
    case "PAYMENT_REQUIRED":
      return "Оплата платной прокрутки ещё не завершена.";
    case "PAYMENT_CANCELLED":
      return "Оплата отменена.";
    case "PAYMENT_FAILED":
      return "Не удалось завершить оплату Telegram Stars.";
    case "PAYMENT_PROCESSING":
      return "Платёж принят. Результат прокрутки ещё обрабатывается.";
    case "GIFT_UNAVAILABLE":
      return "Ежедневный подарок сейчас недоступен.";
    case "BELOW_MINIMUM":
      return "Сумма меньше минимальной для вывода.";
    case "NETWORK":
      return "Не удалось связаться с сервером. Попробуй ещё раз.";
    default:
      return `Ошибка операции (${code}). Попробуй ещё раз.`;
  }
}
