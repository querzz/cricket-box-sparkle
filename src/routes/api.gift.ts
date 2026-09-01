import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";

type GiftReward = {
  kind: "NOTHING" | "STARS" | "FREE_SPIN" | "XP";
  amount: number;
  title: string;
  subtitle: string;
  weight: number;
};

const MAX_STARS = 500;
const MAX_BONUS_SPINS = 1000;
const GIFT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// 100 total weight. Common consolation rewards are frequent; the 100 Stars reward is intentionally rare.
const GIFT_POOL: GiftReward[] = [
  { kind: "NOTHING", amount: 0, title: "Ничего", subtitle: "Сегодня коробка решила пошутить 😈", weight: 40 },
  { kind: "STARS", amount: 10, title: "10 Stars", subtitle: "Stars зачислены на баланс.", weight: 20 },
  { kind: "STARS", amount: 15, title: "15 Stars", subtitle: "Stars зачислены на баланс.", weight: 15 },
  { kind: "STARS", amount: 25, title: "25 Stars", subtitle: "Неплохо! Stars зачислены на баланс.", weight: 10 },
  { kind: "STARS", amount: 50, title: "50 Stars", subtitle: "Редкая находка!", weight: 3 },
  { kind: "STARS", amount: 100, title: "100 Stars", subtitle: "Очень редкий приз! 🔥", weight: 1 },
  { kind: "FREE_SPIN", amount: 1, title: "Бесплатная прокрутка", subtitle: "Дополнительная прокрутка сохранена.", weight: 6 },
  { kind: "XP", amount: 25, title: "+25 XP", subtitle: "Опыт добавлен. Продолжай прокачиваться.", weight: 4 },
  { kind: "XP", amount: 50, title: "+50 XP", subtitle: "Большой буст опыта!", weight: 1 },
];

function pickReward(pool: GiftReward[]) {
  const total = pool.reduce((sum, reward) => sum + reward.weight, 0);
  let cursor = Math.random() * total;
  for (const reward of pool) {
    cursor -= reward.weight;
    if (cursor < 0) return reward;
  }
  return pool[pool.length - 1]!;
}

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

        const result = await withTransaction(async (client) => {
          const user = await client.query<{ id: string; xp: number; level: number }>(
            `SELECT id::text, xp, level FROM users WHERE telegram_id = $1 FOR UPDATE`,
            [telegramId],
          );
          if (!user.rows[0]) throw new Error("USER_NOT_FOUND");

          await client.query(`INSERT INTO user_state (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING`, [user.rows[0].id]);
          const state = await client.query<{
            is_participant: boolean;
            is_subscribed: boolean;
            daily_gift_claimed_at: string | null;
            stars_balance: number;
            bonus_free_spins: number;
          }>(
            `SELECT is_participant, is_subscribed, daily_gift_claimed_at::text, stars_balance, bonus_free_spins
               FROM user_state WHERE user_id = $1::uuid FOR UPDATE`,
            [user.rows[0].id],
          );
          const current = state.rows[0];
          if (!current?.is_participant || !current.is_subscribed) throw new Error("GIFT_UNAVAILABLE");

          const season = await client.query<{ id: string; state: string }>(
            `SELECT id::text, state FROM seasons
              WHERE state IN ('ACTIVE','ENDING')
              ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END, created_at DESC
              LIMIT 1`,
          );
          const currentSeason = season.rows[0];
          if (!currentSeason) throw new Error("GIFT_UNAVAILABLE");

          if (current.daily_gift_claimed_at) {
            const claimedAt = new Date(current.daily_gift_claimed_at).getTime();
            if (Number.isFinite(claimedAt) && Date.now() - claimedAt < GIFT_COOLDOWN_MS) throw new Error("GIFT_COOLDOWN");
          }

          const balance = Number(current.stars_balance ?? 0);
          const pool = balance >= MAX_STARS ? GIFT_POOL.filter((reward) => reward.kind !== "STARS") : GIFT_POOL;
          const reward = pickReward(pool);

          let starsCredited = 0;
          let xpGranted = 0;
          let bonusSpinGranted = 0;
          let title = reward.title;
          let subtitle = reward.subtitle;

          if (reward.kind === "STARS") {
            starsCredited = Math.min(reward.amount, Math.max(0, MAX_STARS - balance));
            if (starsCredited <= 0) {
              // The balance-full filter should normally prevent this, but never discard the claim without a result.
              title = "Ничего";
              subtitle = "Баланс Stars заполнен — в этот раз без награды.";
            } else if (starsCredited < reward.amount) {
              title = `${starsCredited} Stars`;
              subtitle = `Лимит баланса: из ${reward.amount} Stars поместилось только ${starsCredited}.`;
            }
          } else if (reward.kind === "FREE_SPIN") {
            bonusSpinGranted = Math.min(reward.amount, Math.max(0, MAX_BONUS_SPINS - Number(current.bonus_free_spins ?? 0)));
            if (bonusSpinGranted <= 0) {
              title = "Ничего";
              subtitle = "Лимит бонусных прокруток уже достигнут.";
            }
          } else if (reward.kind === "XP") {
            xpGranted = reward.amount;
          }

          if (starsCredited > 0) {
            await client.query(
              `UPDATE user_state SET stars_balance = stars_balance + $2, daily_gift_claimed_at = now(), updated_at = now() WHERE user_id = $1::uuid`,
              [user.rows[0].id, starsCredited],
            );
          } else if (bonusSpinGranted > 0) {
            await client.query(
              `UPDATE user_state SET bonus_free_spins = LEAST($2, bonus_free_spins + $3), daily_gift_claimed_at = now(), updated_at = now() WHERE user_id = $1::uuid`,
              [user.rows[0].id, MAX_BONUS_SPINS, bonusSpinGranted],
            );
          } else if (xpGranted > 0) {
            const nextXp = Number(user.rows[0].xp ?? 0) + xpGranted;
            const nextLevel = Math.max(1, Math.floor(nextXp / 100) + 1);
            await client.query(
              `UPDATE users SET xp = $2, level = $3, last_seen_at = now() WHERE id = $1::uuid`,
              [user.rows[0].id, nextXp, nextLevel],
            );
            await client.query(
              `UPDATE user_state SET daily_gift_claimed_at = now(), updated_at = now() WHERE user_id = $1::uuid`,
              [user.rows[0].id],
            );
          } else {
            await client.query(
              `UPDATE user_state SET daily_gift_claimed_at = now(), updated_at = now() WHERE user_id = $1::uuid`,
              [user.rows[0].id],
            );
          }

          const claim = await client.query<{ id: string; created_at: string }>(
            `INSERT INTO daily_gift_claims (user_id, season_id, kind, amount, title, metadata)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)
             RETURNING id::text, created_at::text`,
            [
              user.rows[0].id,
              currentSeason.id,
              reward.kind === "NOTHING" || (starsCredited === 0 && bonusSpinGranted === 0 && xpGranted === 0) ? "NOTHING" : reward.kind,
              starsCredited || bonusSpinGranted || xpGranted,
              title,
              JSON.stringify({ requestedAmount: reward.amount, weight: reward.weight, starsCredited, bonusSpinGranted, xpGranted }),
            ],
          );

          await client.query(
            `INSERT INTO audit_logs (action, entity_type, entity_id, after_data)
             VALUES ('DAILY_GIFT_CLAIMED', 'daily_gift', $1, $2::jsonb)`,
            [claim.rows[0].id, JSON.stringify({ userId: user.rows[0].id, seasonId: currentSeason.id, kind: reward.kind, amount: reward.amount, starsCredited, bonusSpinGranted, xpGranted })],
          );

          return { claimId: claim.rows[0].id, claimedAt: claim.rows[0].created_at, reward, title, subtitle, starsCredited, bonusSpinGranted, xpGranted };
        });

        return Response.json({
          ok: true,
          reward: {
            id: result.claimId,
            kind: result.reward.kind,
            title: result.title,
            amount: result.starsCredited || result.bonusSpinGranted || result.xpGranted || undefined,
            wonAt: result.claimedAt,
            status: "RECEIVED",
            subtitle: result.subtitle,
            payoutNote: result.reward.kind === "STARS" && result.starsCredited > 0
              ? `${result.starsCredited} Stars зачислены на баланс CRICKET BOX.`
              : result.reward.kind === "FREE_SPIN" && result.bonusSpinGranted > 0
                ? `Бонусных прокруток добавлено: ${result.bonusSpinGranted}.`
                : result.reward.kind === "XP" && result.xpGranted > 0
                  ? `Опыт увеличен на ${result.xpGranted} XP.`
                  : "Сегодня без полезного дропа. Попробуй завтра.",
            creditedAmount: result.starsCredited || undefined,
            uncreditedAmount: result.reward.kind === "STARS" ? Math.max(0, result.reward.amount - result.starsCredited) : 0,
          },
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "GIFT_FAILED";
        const status = code === "GIFT_UNAVAILABLE" || code === "GIFT_COOLDOWN" ? 409 : code === "USER_NOT_FOUND" ? 404 : 400;
        console.error("[CRICKET BOX] gift failed", { code });
        return Response.json({ ok: false, code, detail: code }, { status });
      }
    },
  }}
});
