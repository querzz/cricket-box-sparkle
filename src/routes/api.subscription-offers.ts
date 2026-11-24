import { createFileRoute } from "@tanstack/react-router";
import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { query, withTransaction } from "@/server/db";
import { getTelegramChannelMembership, getTelegramChatMembership } from "@/server/telegram-channel";
import { enforceRateLimit, RateLimitError } from "@/server/rate-limit";

type OfferRow = {
  id: string;
  title: string;
  description: string;
  channel_username: string;
  channel_url: string;
  reward_spins: number;
  ends_at: string | null;
};

export const Route = createFileRoute("/api/subscription-offers")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const initData = new URL(request.url).searchParams.get("initData") ?? "";
        if (!initData) return Response.json({ ok: false, code: "INIT_DATA_MISSING" }, { status: 400 });
        const validated = await validateTelegramInitData(initData, requireBotToken());
        const telegramId = validated.user?.id;
        if (!telegramId) return Response.json({ ok: false, code: "TELEGRAM_USER_MISSING" }, { status: 400 });

        const userResult = await query<{ id: string; is_test: boolean }>(
          "SELECT id::text,is_test FROM users WHERE telegram_id=$1 LIMIT 1",
          [telegramId],
        );
        const user = userResult.rows[0];
        if (!user || user.is_test) return Response.json({ ok: true, offers: [] });

        const liveSeason = await query(
          "SELECT id FROM seasons WHERE state IN ('ACTIVE','ENDING') AND is_paused=FALSE ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END,created_at DESC LIMIT 1",
        );
        if (!liveSeason.rows[0]) return Response.json({ ok: true, offers: [] });

        const result = await query(
          `SELECT o.id::text,o.title,o.description,o.channel_username,o.channel_url,o.reward_spins,o.ends_at::text,
                  EXISTS(SELECT 1 FROM subscription_spin_offer_claims c WHERE c.offer_id=o.id AND c.user_id=$1::uuid) AS claimed
             FROM subscription_spin_offers o
            WHERE o.enabled=TRUE AND o.starts_at<=now() AND (o.ends_at IS NULL OR o.ends_at>now())
            ORDER BY o.created_at ASC`,
          [user.id],
        );
        return Response.json({ ok: true, offers: result.rows }, { headers: { "cache-control": "no-store" } });
      } catch (error) {
        const code = error instanceof Error ? error.message : "OFFERS_FAILED";
        return Response.json({ ok: false, code: code === "AUTH_FAILED" ? code : "OFFERS_FAILED" }, { status: 400 });
      }
    },
    POST: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: unknown; offerId?: unknown };
        const initData = typeof body.initData === "string" ? body.initData.trim() : "";
        const offerId = String(body.offerId ?? "").trim();
        if (!initData || !offerId) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
        const validated = await validateTelegramInitData(initData, requireBotToken());
        const telegramId = validated.user?.id;
        if (!telegramId) throw new Error("TELEGRAM_USER_MISSING");
        await enforceRateLimit("subscription-offer:" + telegramId, 8);

        const userResult = await query<{ id: string; is_test: boolean }>(
          "SELECT id::text,is_test FROM users WHERE telegram_id=$1 LIMIT 1",
          [telegramId],
        );
        const user = userResult.rows[0];
        if (!user || user.is_test) throw new Error("USER_NOT_FOUND");

        const offerResult = await query<OfferRow>(
          `SELECT id::text,title,description,channel_username,channel_url,reward_spins,ends_at::text
             FROM subscription_spin_offers
            WHERE id=$1::uuid AND enabled=TRUE AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now())`,
          [offerId],
        );
        const offer = offerResult.rows[0];
        if (!offer) throw new Error("OFFER_NOT_AVAILABLE");

        const mainMembership = await getTelegramChannelMembership(telegramId);
        if (mainMembership === false) throw new Error("NOT_SUBSCRIBED");
        const offerMembership = await getTelegramChatMembership(telegramId, "@" + offer.channel_username);
        if (offerMembership !== true) throw new Error("NOT_SUBSCRIBED_TO_OFFER");

        const result = await withTransaction(async (client) => {
          const lockedUser = await client.query<{ id: string }>(
            "SELECT id::text FROM users WHERE id=$1::uuid AND is_test=FALSE FOR UPDATE",
            [user.id],
          );
          if (!lockedUser.rows[0]) throw new Error("USER_NOT_FOUND");

          const stateResult = await client.query<{ is_subscribed: boolean; is_participant: boolean; bonus_free_spins: number }>(
            "SELECT is_subscribed,is_participant,bonus_free_spins FROM user_state WHERE user_id=$1::uuid FOR UPDATE",
            [user.id],
          );
          const state = stateResult.rows[0];
          if (!state || !state.is_participant) throw new Error("NOT_PARTICIPANT");
          if (mainMembership === null && !state.is_subscribed) throw new Error("NOT_SUBSCRIBED");

          const season = await client.query<{ id: string; is_paused: boolean }>(
            "SELECT id::text,is_paused FROM seasons WHERE state IN ('ACTIVE','ENDING') ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END,created_at DESC LIMIT 1 FOR UPDATE",
          );
          if (!season.rows[0]) throw new Error("SEASON_NOT_ACTIVE");
          if (season.rows[0].is_paused) throw new Error("SEASON_PAUSED");

          const currentOffer = await client.query<{ reward_spins: number }>(
            "SELECT reward_spins FROM subscription_spin_offers WHERE id=$1::uuid AND enabled=TRUE AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) FOR UPDATE",
            [offerId],
          );
          if (!currentOffer.rows[0]) throw new Error("OFFER_NOT_AVAILABLE");

          const rewardSpins = Number(currentOffer.rows[0].reward_spins);
          const currentBalance = Math.max(0, Number(state.bonus_free_spins) || 0);
          if (currentBalance + rewardSpins > 1000) throw new Error("BONUS_SPIN_CAP_REACHED");

          const claim = await client.query<{ amount: number }>(
            "INSERT INTO subscription_spin_offer_claims(offer_id,user_id,amount) VALUES($1::uuid,$2::uuid,$3) ON CONFLICT(offer_id,user_id) DO NOTHING RETURNING amount",
            [offerId, user.id, rewardSpins],
          );
          if (!claim.rows[0]) {
            return { duplicate: true, addedSpins: 0, bonusSpins: currentBalance };
          }

          const updated = await client.query<{ bonus_free_spins: number }>(
            "UPDATE user_state SET bonus_free_spins=bonus_free_spins+$2,updated_at=now() WHERE user_id=$1::uuid RETURNING bonus_free_spins",
            [user.id, rewardSpins],
          );
          await client.query(
            "INSERT INTO audit_logs(action,entity_type,entity_id,after_data) VALUES('SUBSCRIPTION_OFFER_CLAIMED','subscription_spin_offer',$1,$2::jsonb)",
            [offerId, JSON.stringify({ userId: user.id, telegramId, channelUsername: offer.channel_username, addedSpins: rewardSpins })],
          );
          return { duplicate: false, addedSpins: rewardSpins, bonusSpins: Number(updated.rows[0]?.bonus_free_spins ?? currentBalance + rewardSpins) };
        });

        return Response.json({ ok: true, ...result });
      } catch (error) {
        const code = error instanceof Error ? error.message : "OFFER_CLAIM_FAILED";
        const status = error instanceof RateLimitError ? 429
          : ["NOT_SUBSCRIBED", "NOT_SUBSCRIBED_TO_OFFER", "NOT_PARTICIPANT"].includes(code) ? 403
          : ["OFFER_NOT_AVAILABLE", "SEASON_NOT_ACTIVE", "SEASON_PAUSED", "ALREADY_CLAIMED", "BONUS_SPIN_CAP_REACHED"].includes(code) ? 409
          : code === "USER_NOT_FOUND" ? 404
          : 400;
        const headers = error instanceof RateLimitError ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;
        return Response.json({ ok: false, code }, { status, headers });
      }
    },
  } },
});
