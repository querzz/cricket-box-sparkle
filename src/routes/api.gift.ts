import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";
import { secureRandomUnit } from "@/server/secure-random";
import { getTelegramChannelMembership } from "@/server/telegram-channel";
import { appendStarsLedger } from "@/server/stars-ledger";
import { enforceRateLimit, RateLimitError } from "@/server/rate-limit";

import { getDailyGiftConfig, getDailyGiftTier, pickDailyGift } from "@/server/daily-gift";

const MAX_STARS = 500;
const MAX_BONUS_SPINS = 1000;
const GIFT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const Route = createFileRoute("/api/gift")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: unknown };
        const initData = typeof body.initData === "string" ? body.initData.trim() : "";
        if (!initData) return Response.json({ ok: false, code: "INIT_DATA_MISSING" }, { status: 400 });
        const validated = await validateTelegramInitData(initData, requireBotToken());
        const telegramId = validated.user?.id;
        if (!telegramId) return Response.json({ ok: false, code: "TELEGRAM_USER_MISSING" }, { status: 400 });
        await enforceRateLimit(`gift:${telegramId}`, 6);
        const membership = await getTelegramChannelMembership(telegramId);

        const result = await withTransaction(async (client) => {
          const user = await client.query<{ id: string; xp: number; level: number; veteran_tier_override: "ROOKIE" | "VETERAN" | "ELITE" | null }>(`SELECT id::text, xp, level, veteran_tier_override FROM users WHERE telegram_id = $1 FOR UPDATE`, [telegramId]);
          if (!user.rows[0]) throw new Error("USER_NOT_FOUND");
          await client.query(`INSERT INTO user_state (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING`, [user.rows[0].id]);
          const state = await client.query<{ is_participant:boolean; is_subscribed:boolean; daily_gift_claimed_at:string|null; stars_balance:number; bonus_free_spins:number }>(`SELECT is_participant,is_subscribed,daily_gift_claimed_at::text,stars_balance,bonus_free_spins FROM user_state WHERE user_id=$1::uuid FOR UPDATE`, [user.rows[0].id]);
          const current = state.rows[0];
          const subscribed = membership ?? current?.is_subscribed ?? false;
          if (membership !== null && membership !== current?.is_subscribed) await client.query(`UPDATE user_state SET is_subscribed=$2,updated_at=now() WHERE user_id=$1::uuid`, [user.rows[0].id, membership]);
          if (!current?.is_participant || !subscribed) throw new Error("GIFT_UNAVAILABLE");

          const season = await client.query<{ id:string; state:string }>(`SELECT id::text,state FROM seasons WHERE state IN ('ACTIVE','ENDING') ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END,created_at DESC LIMIT 1 FOR UPDATE`);
          const currentSeason = season.rows[0];
          if (!currentSeason) throw new Error("GIFT_UNAVAILABLE");
          if (current.daily_gift_claimed_at) {
            const claimedAt = new Date(current.daily_gift_claimed_at).getTime();
            if (Number.isFinite(claimedAt) && Date.now() - claimedAt < GIFT_COOLDOWN_MS) throw new Error("GIFT_COOLDOWN");
          }

          const balance = Number(current.stars_balance ?? 0);
          const config = await getDailyGiftConfig(client);
          const tierInfo = await getDailyGiftTier(client, user.rows[0].id, user.rows[0].veteran_tier_override);
          const reward = pickDailyGift(tierInfo.tier, config, secureRandomUnit, balance);
          const starsCredited = reward.kind === "STARS" ? Math.min(reward.amount, Math.max(0, MAX_STARS - balance)) : 0;
          const overflow = reward.kind === "STARS" ? Math.max(0, reward.amount - starsCredited) : 0;
          const bonusSpinGranted = reward.kind === "FREE_SPIN" ? Math.min(reward.amount, Math.max(0, MAX_BONUS_SPINS - Number(current.bonus_free_spins ?? 0))) : 0;
          const xpGranted = reward.kind === "XP" ? reward.amount : 0;
          const effectiveKind: GiftReward["kind"] = reward.kind === "STARS" && starsCredited === 0 || reward.kind === "FREE_SPIN" && bonusSpinGranted === 0 ? "NOTHING" : reward.kind;
          const title = effectiveKind === "NOTHING" && reward.kind !== "NOTHING" ? "Ничего" : reward.title;
          const subtitle = reward.kind === "STARS" && overflow > 0
            ? `Лимит баланса: из ${reward.amount} Stars поместилось только ${starsCredited}.`
            : reward.kind === "FREE_SPIN" && bonusSpinGranted === 0
              ? "Лимит бонусных прокруток уже достигнут."
              : reward.subtitle;

          await client.query(`UPDATE user_state SET daily_gift_claimed_at=now(),updated_at=now() WHERE user_id=$1::uuid`, [user.rows[0].id]);
          if (bonusSpinGranted > 0) await client.query(`UPDATE user_state SET bonus_free_spins=LEAST($2,bonus_free_spins+$3),updated_at=now() WHERE user_id=$1::uuid`, [user.rows[0].id, MAX_BONUS_SPINS, bonusSpinGranted]);
          if (xpGranted > 0) {
            const nextXp = Number(user.rows[0].xp ?? 0) + xpGranted;
            await client.query(`UPDATE users SET xp=$2,level=$3,last_seen_at=now() WHERE id=$1::uuid`, [user.rows[0].id, nextXp, Math.max(1, Math.floor(nextXp / 100) + 1)]);
          }

          const claim = await client.query<{ id:string; created_at:string }>(
            `INSERT INTO daily_gift_claims (user_id,season_id,kind,amount,title,metadata) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb) RETURNING id::text,created_at::text`,
            [user.rows[0].id,currentSeason.id,effectiveKind,effectiveKind === "STARS" ? starsCredited : effectiveKind === "FREE_SPIN" ? bonusSpinGranted : effectiveKind === "XP" ? xpGranted : 0,title,JSON.stringify({ tier:tierInfo.tier, tierSource:tierInfo.source, configuredRewardChance:config.rewardChanceByTier[tierInfo.tier], requestedKind:reward.kind, requestedAmount:reward.amount, weight:reward.weight, starsCredited, bonusSpinGranted, xpGranted, overflowStars:overflow })],
          );

          if (starsCredited > 0) await appendStarsLedger(client, { userId:user.rows[0].id, seasonId:currentSeason.id, type:"DAILY_GIFT", amount:reward.amount, balanceDelta:starsCredited, referenceId:claim.rows[0].id, idempotencyKey:`daily-gift:${claim.rows[0].id}:reward`, metadata:{ requestedAmount:reward.amount, creditedAmount:starsCredited, overflowAmount:overflow } });
          if (overflow > 0) await appendStarsLedger(client, { userId:user.rows[0].id, seasonId:currentSeason.id, type:"CAPPED_OVERFLOW_BURNED", amount:-overflow, balanceDelta:0, referenceId:claim.rows[0].id, idempotencyKey:`daily-gift:${claim.rows[0].id}:overflow`, metadata:{ requestedAmount:reward.amount, creditedAmount:starsCredited, overflowAmount:overflow } });
          await client.query(`INSERT INTO audit_logs (action,entity_type,entity_id,after_data) VALUES ('DAILY_GIFT_CLAIMED','daily_gift',$1,$2::jsonb)`, [claim.rows[0].id, JSON.stringify({ userId:user.rows[0].id, seasonId:currentSeason.id, tier:tierInfo.tier, tierSource:tierInfo.source, configuredRewardChance:config.rewardChanceByTier[tierInfo.tier], kind:effectiveKind, requestedKind:reward.kind, amount:reward.amount, starsCredited, overflowStars:overflow, bonusSpinGranted, xpGranted })]);
          return { claimId:claim.rows[0].id, claimedAt:claim.rows[0].created_at, reward, effectiveKind, title, subtitle, starsCredited, bonusSpinGranted, xpGranted, overflow };
        });

        return Response.json({ ok:true, reward:{ id:result.claimId, kind:result.effectiveKind, title:result.title, amount:result.starsCredited || result.bonusSpinGranted || result.xpGranted || undefined, wonAt:result.claimedAt, status:"RECEIVED", subtitle:result.subtitle, payoutNote:result.effectiveKind === "STARS" && result.starsCredited > 0 ? `${result.starsCredited} Stars зачислены на баланс CRICKET BOX.` : result.effectiveKind === "FREE_SPIN" && result.bonusSpinGranted > 0 ? `Бонусных прокруток добавлено: ${result.bonusSpinGranted}.` : result.effectiveKind === "XP" && result.xpGranted > 0 ? `Опыт увеличен на ${result.xpGranted} XP.` : "Сегодня без полезного дропа. Попробуй завтра.", creditedAmount:result.starsCredited || undefined, uncreditedAmount:result.overflow }});
      } catch (error) {
        if (error instanceof RateLimitError) return Response.json({ ok:false, code:"RATE_LIMITED" }, { status:429, headers:{ "Retry-After":String(error.retryAfterSeconds) } });
        const code = error instanceof Error ? error.message : "GIFT_FAILED";
        const status = code === "GIFT_UNAVAILABLE" || code === "GIFT_COOLDOWN" ? 409 : code === "USER_NOT_FOUND" ? 404 : 400;
        console.error("[CRICKET BOX] gift failed", { code });
        return Response.json({ ok:false, code, detail:code }, { status });
      }
    },
  }}
});