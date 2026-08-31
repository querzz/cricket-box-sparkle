import type { SeasonState, SessionSnapshot } from "./types";

export interface SeasonUi {
  canSpin: boolean;
  canClaimGift: boolean;
  canWithdraw: boolean;
  headline: string;
  note: string;
  ctaLabel: string;
}

const headlines: Record<SeasonState, { headline: string; note: string }> = {
  DRAFT: { headline: "Season in preparation", note: "The next Cricket Box is being assembled." },
  SCHEDULED: { headline: "Season starts soon", note: "Come back when the countdown hits zero." },
  ACTIVE: { headline: "Season is live", note: "Spin the Cricket Box and collect rewards." },
  ENDING: { headline: "Season is ending", note: "Last attempts before the box closes." },
  CLOSED: { headline: "Season ended", note: "No more spins. Prizes are being verified." },
  PAYOUT: { headline: "Prize distribution in progress", note: "Withdrawals are open for this season." },
  ARCHIVED: { headline: "Season archived", note: "This season lives in your history now." },
};

export function seasonUi(snapshot: SessionSnapshot): SeasonUi {
  const state = snapshot.season.state;
  const live = state === "ACTIVE" || state === "ENDING";
  const subscribed = snapshot.user.isSubscribed;
  const meta = headlines[state];

  return {
    canSpin: live && subscribed,
    canClaimGift: live && subscribed && snapshot.user.isParticipant,
    canWithdraw: state === "PAYOUT" || state === "CLOSED",
    headline: meta.headline,
    note: meta.note,
    ctaLabel: live ? "Spin" : state === "SCHEDULED" || state === "DRAFT" ? "Not started" : "Closed",
  };
}

export function errorCopy(code: string): string {
  switch (code) {
    case "NO_ATTEMPTS":
      return "Your free spin is used. Buy an extra spin with internal Stars.";
    case "INSUFFICIENT_STARS":
      return "Not enough internal Stars for this action.";
    case "STARS_FULL":
      return "Your Stars balance is full. Spend Stars to free up capacity.";
    case "SEASON_CLOSED":
      return "The season is closed.";
    case "SEASON_NOT_STARTED":
      return "The season has not started yet.";
    case "NOT_SUBSCRIBED":
      return "Subscribe to the channel to take part.";
    case "GIFT_UNAVAILABLE":
      return "Your daily gift is not available right now.";
    case "BELOW_MINIMUM":
      return "Amount is below the minimum withdrawal.";
    default:
      return "Something went wrong. Please try again.";
  }
}
