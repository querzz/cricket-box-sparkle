import mascot from "@/assets/mascot.jpg";
import cricketBox from "@/assets/cricket-box.png";
import gift from "@/assets/gift.png";
import star from "@/assets/star.png";
import money from "@/assets/money.png";
import premium from "@/assets/premium.png";
import nft from "@/assets/nft.png";

import type { RewardKind } from "@/lib/types";

export const assets = { mascot, cricketBox, gift, star, money, premium, nft };

/** Reusable asset slots — swapping production art means changing this map only. */
export const rewardArt: Record<RewardKind, string> = {
  STARS: star,
  PREMIUM: premium,
  NFT: nft,
  MONEY: money,
  EMPTY: gift,
};
