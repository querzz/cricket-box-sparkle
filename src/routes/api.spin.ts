import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";

type Body = { initData?: unknown; paid?: unknown };
type PrizeRow = {
  id: string;
  kind: "STARS" | "PREMIUM" | "MONEY" | "NFT" | "PHYSICAL" | "CUSTOM" | "FREE_SPIN";
  title: string;
  subtitle: string | null;
  amount: string;
  unit_cost: string;
  currency: string | null;
  quantity_remaining: number;
  metadata: Record<string, unknown> | null;
};

export const Route = createFileRoute("/api/spin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Body;
          const initData = typeof body.initData === "string" ? body.initData.trim() : "";
          const paid = body.paid === true;
          if (!initData) return Response.json({ ok: false, code: "INIT_DATA_MISSING" }, { status: 400 });
          if (paid) return Response.json({ ok: false, code: "PAYMENT_REQUIRED" }, { status: 402 });

          const validated = await validateTelegramInitData(initData, requireBotToken());
          const telegramId = validated.user?.id;
          if (!telegramId) return Response.json({ ok: false, code: "TELEGRAM_USER_MISSING" }, { status: 400 });

          const result = await withTransaction(async (client) => {
            const user = await client.query<{ id: string; xp: number }>(
              `SELECT id::text, xp FROM users WHERE telegram_id = $1 LIMIT 1 FOR UPDATE`,
              [telegramId],
            );
            if (!user.rows[0]) throw new Error("USER_NOT_FOUND");

            await client.query(
              `INSERT INTO user_state (user_id, stars_balance, is_subscribed, is_participant)
               VALUES ($1::uuid, 125, TRUE, TRUE)
               ON CONFLICT (user_id) DO NOTHING`,
              [user.rows[0].id],
            );

            const userState = await client.query<{ is_subscribed: boolean }>(
              `SELECT is_subscribed FROM user_state WHERE user_id = $1::uuid FOR UPDATE`,
              [user.rows[0].id],
            );
            if (!userState.rows[0]?.is_subscribed) throw new Error("NOT_SUBSCRIBED");

            const season = await client.query<{
              id: string;
              code: string;
              state: string;
              paid_spin_price: number;
              daily_free_spin: boolean;
            }>(
              `SELECT id::text, code, state, paid_spin_price, daily_free_spin
                 FROM seasons
                WHERE state IN ('ACTIVE', 'ENDING')
                ORDER BY CASE WHEN state = 'ACTIVE' THEN 0 ELSE 1 END, created_at DESC
                LIMIT 1
                FOR UPDATE`,
            );
            const currentSeason = season.rows[0];
            if (!currentSeason) throw new Error("SEASON_NOT_ACTIVE");
            if (!currentSeason.daily_free_spin) throw new Error("NO_ATTEMPTS");

            const alreadyFree = await client.query<{ exists: boolean }>(
              `SELECT EXISTS(
                 SELECT 1 FROM spins
                  WHERE user_id = $1::uuid
                    AND season_id = $2::uuid
                    AND type = 'FREE'
                    AND status = 'COMPLETED'
                    AND created_at >= date_trunc('day', now())
               ) AS exists`,
              [user.rows[0].id, currentSeason.id],
            );
            if (alreadyFree.rows[0]?.exists) throw new Error("NO_ATTEMPTS");

            const prizes = await client.query<PrizeRow>(
              `SELECT id::text, kind, title, subtitle, amount::text, unit_cost::text, currency,
                      quantity_remaining, metadata
                 FROM prizes
                WHERE season_id = $1::uuid
                  AND quantity_remaining > 0
                ORDER BY created_at ASC
                FOR UPDATE`,
              [currentSeason.id],
            );
            if (prizes.rows.length === 0) throw new Error("NO_PRIZES");

            const total = prizes.rows.reduce((sum, prize) => sum + prize.quantity_remaining, 0);
            let cursor = Math.floor(Math.random() * total);
            let picked = prizes.rows[prizes.rows.length - 1]!;
            for (const prize of prizes.rows) {
              cursor -= prize.quantity_remaining;
              if (cursor < 0) {
                picked = prize;
                break;
              }
            }

            await client.query(
              `UPDATE prizes SET quantity_remaining = quantity_remaining - 1, updated_at = now() WHERE id = $1::uuid`,
              [picked.id],
            );

            const spin = await client.query<{ id: string; created_at: string }>(
              `INSERT INTO spins (user_id, season_id, type, price_stars, prize_id, status, completed_at)
               VALUES ($1::uuid, $2::uuid, 'FREE', 0, $3::uuid, 'COMPLETED', now())
               RETURNING id::text, created_at::text`,
              [user.rows[0].id, currentSeason.id, picked.id],
            );

            const nextXp = Number(user.rows[0].xp ?? 0) + 10;
            const nextLevel = Math.max(1, Math.floor(nextXp / 100) + 1);
            await client.query(
              `UPDATE users SET xp = $2, level = $3, last_seen_at = now() WHERE id = $1::uuid`,
              [user.rows[0].id, nextXp, nextLevel],
            );

            const payout = await client.query<{ id: string }>(
              `INSERT INTO payouts (spin_id, user_id, prize_id, kind, amount, currency, status, note)
               VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::numeric, $6, 'PENDING', $7)
               RETURNING id::text`,
              [
                spin.rows[0].id,
                user.rows[0].id,
                picked.id,
                picked.kind,
                picked.amount,
                picked.currency,
                picked.kind === "STARS" ? "Stars ожидают финальной выдачи через Telegram." : "Приз ожидает выдачи администратором.",
              ],
            );

            await client.query(
              `INSERT INTO audit_logs (action, entity_type, entity_id, after_data)
               VALUES ('SPIN_COMPLETED', 'spin', $1, $2::jsonb)`,
              [spin.rows[0].id, JSON.stringify({ userId: user.rows[0].id, seasonId: currentSeason.id, prizeId: picked.id, type: "FREE" })],
            );

            return {
              spinId: spin.rows[0].id,
              payoutId: payout.rows[0].id,
              createdAt: spin.rows[0].created_at,
              season: currentSeason,
              prize: picked,
            };
          });

          const prize = result.prize;
          return Response.json({
            ok: true,
            spin: {
              id: result.spinId,
              type: "FREE",
              priceStars: 0,
              status: "COMPLETED",
              createdAt: result.createdAt,
            },
            reward: {
              id: result.payoutId,
              kind: prize.kind === "FREE_SPIN" ? "STARS" : prize.kind,
              title: prize.title,
              subtitle: prize.subtitle,
              amount: Number(prize.amount) || undefined,
              wonAt: result.createdAt,
              status: "PENDING",
              payoutNote: prize.kind === "STARS" ? "Награда записана. Финальная выдача Stars выполняется сервером." : "Награда записана и ожидает выдачи.",
            },
          });
        } catch (error) {
          const code = error instanceof Error ? error.message : "SPIN_FAILED";
          console.error("[CRICKET BOX] spin failed", { code });
          const status = code === "NO_ATTEMPTS" || code === "NO_PRIZES" ? 409 : code === "USER_NOT_FOUND" || code === "NOT_SUBSCRIBED" ? 403 : code === "SEASON_NOT_ACTIVE" ? 409 : code === "PAYMENT_REQUIRED" ? 402 : 400;
          return Response.json({ ok: false, code, detail: code }, { status });
        }
      },
    },
  },
});