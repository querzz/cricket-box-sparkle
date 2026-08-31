import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";

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
          const user = await client.query<{ id: string }>(`SELECT id::text FROM users WHERE telegram_id = $1 FOR UPDATE`, [telegramId]);
          if (!user.rows[0]) throw new Error("USER_NOT_FOUND");
          await client.query(`INSERT INTO user_state (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING`, [user.rows[0].id]);
          const state = await client.query<{ is_participant: boolean; is_subscribed: boolean; daily_gift_claimed_at: string | null; stars_balance: number }>(
            `SELECT is_participant, is_subscribed, daily_gift_claimed_at::text, stars_balance FROM user_state WHERE user_id = $1::uuid FOR UPDATE`,
            [user.rows[0].id],
          );
          const current = state.rows[0];
          if (!current?.is_participant || !current.is_subscribed) throw new Error("GIFT_UNAVAILABLE");

          const season = await client.query<{ id: string; state: string }>(`SELECT id::text, state FROM seasons ORDER BY CASE WHEN state = 'ACTIVE' THEN 0 WHEN state = 'ENDING' THEN 1 ELSE 2 END, created_at DESC LIMIT 1`);
          if (!season.rows[0] || !["ACTIVE", "ENDING"].includes(season.rows[0].state)) throw new Error("GIFT_UNAVAILABLE");
          if (current.daily_gift_claimed_at && new Date(current.daily_gift_claimed_at).getTime() >= new Date(new Date().setHours(0, 0, 0, 0)).getTime()) throw new Error("GIFT_UNAVAILABLE");

          const credited = Math.min(15, Math.max(0, 500 - Number(current.stars_balance)));
          await client.query(`UPDATE user_state SET stars_balance = stars_balance + $2, daily_gift_claimed_at = now(), updated_at = now() WHERE user_id = $1::uuid`, [user.rows[0].id, credited]);
          await client.query(
            `INSERT INTO payouts (user_id, kind, amount, currency, status, note)
             VALUES ($1::uuid, 'STARS', $2, 'XTR', 'PAID', $3)`,
            [user.rows[0].id, 15, `DAILY_GIFT_CREDITED:${credited}`],
          );
          await client.query(
            `INSERT INTO audit_logs (action, entity_type, entity_id, after_data)
             VALUES ('DAILY_GIFT_CLAIMED', 'user', $1, $2::jsonb)`,
            [user.rows[0].id, JSON.stringify({ credited, requested: 15 })],
          );
          return { credited };
        });

        return Response.json({
          ok: true,
          reward: { id: `gift_${Date.now()}`, kind: "STARS", title: "15 Stars", amount: result.credited, wonAt: new Date().toISOString(), status: "RECEIVED", payoutNote: result.credited < 15 ? `Лимит баланса: зачислено ${result.credited} из 15 Stars.` : "Ежедневный подарок зачислен на баланс Stars." },
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "GIFT_FAILED";
        return Response.json({ ok: false, code }, { status: code === "GIFT_UNAVAILABLE" ? 409 : 400 });
      }
    },
  }}
});
