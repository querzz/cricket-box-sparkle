import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";

const MINIMUM = 50;

export const Route = createFileRoute("/api/withdraw")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: unknown; amount?: unknown };
        const initData = typeof body.initData === "string" ? body.initData.trim() : "";
        const amount = Math.floor(Number(body.amount));
        if (!initData) return Response.json({ ok: false, code: "INIT_DATA_MISSING" }, { status: 400 });
        if (!Number.isFinite(amount) || amount < MINIMUM) return Response.json({ ok: false, code: "BELOW_MINIMUM", minimum: MINIMUM }, { status: 400 });
        const validated = await validateTelegramInitData(initData, requireBotToken());
        const telegramId = validated.user?.id;
        if (!telegramId) return Response.json({ ok: false, code: "TELEGRAM_USER_MISSING" }, { status: 400 });

        const withdrawal = await withTransaction(async (client) => {
          const user = await client.query<{ id: string }>(`SELECT id::text FROM users WHERE telegram_id = $1 FOR UPDATE`, [telegramId]);
          if (!user.rows[0]) throw new Error("USER_NOT_FOUND");
          await client.query(`INSERT INTO user_state (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING`, [user.rows[0].id]);
          const state = await client.query<{ stars_balance: number }>(`SELECT stars_balance FROM user_state WHERE user_id = $1::uuid FOR UPDATE`, [user.rows[0].id]);
          const balance = Number(state.rows[0]?.stars_balance ?? 0);
          if (amount > balance) throw new Error("INSUFFICIENT_STARS");

          const payout = await client.query<{ id: string; created_at: string }>(
            `INSERT INTO payouts (user_id, kind, amount, currency, status, note)
             VALUES ($1::uuid, 'STARS', $2, 'XTR', 'PENDING', 'WITHDRAWAL_REQUEST')
             RETURNING id::text, created_at::text`,
            [user.rows[0].id, amount],
          );
          await client.query(`UPDATE user_state SET stars_balance = stars_balance - $2, updated_at = now() WHERE user_id = $1::uuid`, [user.rows[0].id, amount]);
          return payout.rows[0];
        });

        return Response.json({ ok: true, withdrawal: { id: withdrawal.id, amount, requestedAt: withdrawal.created_at, status: "PENDING" } });
      } catch (error) {
        const code = error instanceof Error ? error.message : "WITHDRAW_FAILED";
        const status = code === "INSUFFICIENT_STARS" ? 409 : 400;
        return Response.json({ ok: false, code }, { status });
      }
    },
  }}
});
