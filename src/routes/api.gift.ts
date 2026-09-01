import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";

const GIFT_AMOUNT = 15;
const MAX_STARS = 500;
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

        const result = await withTransaction(async (client) => {
          const user = await client.query<{ id: string }>(
            `SELECT id::text FROM users WHERE telegram_id = $1 FOR UPDATE`,
            [telegramId],
          );
          if (!user.rows[0]) throw new Error("USER_NOT_FOUND");

          await client.query(`INSERT INTO user_state (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING`, [user.rows[0].id]);
          const state = await client.query<{
            is_participant: boolean;
            is_subscribed: boolean;
            daily_gift_claimed_at: string | null;
            stars_balance: number;
          }>(`SELECT is_participant, is_subscribed, daily_gift_claimed_at::text, stars_balance FROM user_state WHERE user_id = $1::uuid FOR UPDATE`, [user.rows[0].id]);
          const current = state.rows[0];
          if (!current?.is_participant || !current.is_subscribed) throw new Error("GIFT_UNAVAILABLE");

          const season = await client.query<{ id: string; state: string }>(
            `SELECT id::text, state FROM seasons WHERE state IN ('ACTIVE','ENDING') ORDER BY CASE WHEN state = 'ACTIVE' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
          );
          const currentSeason = season.rows[0];
          if (!currentSeason) throw new Error("GIFT_UNAVAILABLE");

          if (current.daily_gift_claimed_at) {
            const claimedAt = new Date(current.daily_gift_claimed_at).getTime();
            if (Number.isFinite(claimedAt) && Date.now() - claimedAt < GIFT_COOLDOWN_MS) throw new Error("GIFT_COOLDOWN");
          }

          const balance = Number(current.stars_balance ?? 0);
          if (balance >= MAX_STARS) throw new Error("GIFT_BALANCE_FULL");
          const credited = Math.min(GIFT_AMOUNT, MAX_STARS - balance);

          const payout = await client.query<{ id: string; created_at: string }>(
            `INSERT INTO payouts (user_id, kind, amount, currency, status, note) VALUES ($1::uuid, 'STARS', $2, 'XTR', 'PAID', $3) RETURNING id::text, created_at::text`,
            [user.rows[0].id, credited, `DAILY_GIFT_CREDITED:${credited}`],
          );

          await client.query(
            `UPDATE user_state SET stars_balance = stars_balance + $2, daily_gift_claimed_at = now(), updated_at = now() WHERE user_id = $1::uuid`,
            [user.rows[0].id, credited],
          );

          await client.query(
            `INSERT INTO audit_logs (action, entity_type, entity_id, after_data) VALUES ('DAILY_GIFT_CLAIMED', 'user', $1, $2::jsonb)`,
            [user.rows[0].id, JSON.stringify({ credited, requested: GIFT_AMOUNT, seasonId: currentSeason.id, seasonState: currentSeason.state, payoutId: payout.rows[0].id })],
          );

          return { credited, payoutId: payout.rows[0].id, claimedAt: payout.rows[0].created_at };
        });

        return Response.json({ ok: true, reward: {
          id: result.payoutId,
          kind: "STARS",
          title: `${result.credited} Stars`,
          amount: result.credited,
          wonAt: result.claimedAt,
          status: "RECEIVED",
          creditedAmount: result.credited,
          uncreditedAmount: Math.max(0, GIFT_AMOUNT - result.credited),
          payoutNote: result.credited < GIFT_AMOUNT ? `Лимит баланса: зачислено ${result.credited} из ${GIFT_AMOUNT} Stars.` : "Ежедневный подарок зачислен на баланс CRICKET BOX.",
        }});
      } catch (error) {
        const code = error instanceof Error ? error.message : "GIFT_FAILED";
        const status = code === "GIFT_UNAVAILABLE" || code === "GIFT_COOLDOWN" || code === "GIFT_BALANCE_FULL" ? 409 : code === "USER_NOT_FOUND" ? 404 : 400;
        console.error("[CRICKET BOX] gift failed", { code });
        return Response.json({ ok: false, code, detail: code }, { status });
      }
    },
  }}
});
