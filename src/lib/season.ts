import type { SeasonState, SessionSnapshot } from "./types";

export interface SeasonUi {
  /** Season accepts spins/gifts. */
  isLive: boolean;
  /** Season is over — no countdown, no attempts, payout phase copy. */
  isFinished: boolean;
  canSpin: boolean;
  canClaimGift: boolean;
  canWithdraw: boolean;
  headline: string;
  note: string;
  ctaLabel: string;
}

const headlines: Record<SeasonState, { headline: string; note: string }> = {
  DRAFT: { headline: "Сезон готовится", note: "Следующий Cricket Box сейчас собирается." },
  SCHEDULED: { headline: "Скоро старт", note: "Возвращайся, когда закончится обратный отсчёт." },
  ACTIVE: { headline: "Сезон активен", note: "Крути Cricket Box и собирай призы." },
  ENDING: { headline: "Сезон заканчивается", note: "Последние попытки перед закрытием бокса." },
  CLOSED: { headline: "Сезон завершён", note: "Новые прокрутки закрыты, призы проверяются." },
  PAYOUT: { headline: "Выдача призов", note: "Для этого сезона открыта выдача наград." },
  ARCHIVED: { headline: "Сезон в архиве", note: "Этот сезон теперь доступен в истории." },
};

export function seasonUi(snapshot: SessionSnapshot): SeasonUi {
  const state = snapshot.season.state;
  const live = state === "ACTIVE" || state === "ENDING";
  const subscribed = snapshot.user.isSubscribed;
  const meta = headlines[state];

  return {
    isLive: live,
    isFinished: state === "CLOSED" || state === "PAYOUT" || state === "ARCHIVED",
    canSpin: live && subscribed,
    canClaimGift: live && subscribed && snapshot.user.isParticipant,
    canWithdraw: state === "PAYOUT" || state === "CLOSED",
    headline: meta.headline,
    note: meta.note,
    ctaLabel: live ? "Крутить" : state === "SCHEDULED" || state === "DRAFT" ? "Ещё не начался" : "Закрыт",
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
    case "SEASON_NOT_STARTED":
      return "Сезон ещё не начался.";
    case "NOT_SUBSCRIBED":
      return "Подпишись на канал, чтобы участвовать.";
    case "GIFT_UNAVAILABLE":
      return "Ежедневный подарок сейчас недоступен.";
    case "BELOW_MINIMUM":
      return "Сумма меньше минимальной для вывода.";
    default:
      return "Что-то пошло не так. Попробуй ещё раз.";
  }
}
