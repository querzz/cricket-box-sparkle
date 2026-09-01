import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";
import { appendStarsLedger } from "@/server/stars-ledger";

const MINIMUM = 50;
const LIVE_STATES = ["ACTIVE", "ENDING"] as const;
const WITHDRAWAL_OPEN_STATES = ["CLOSED", "PAYOUT", "ARCHIVED"] as const;

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
          const userRow = user.rows[0];
          if (!userRow) throw new Error("USER_NOT_FOUND");

          const season = await client.query<{ state: string }>(
            `SELECT state FROM seasons
             ORDER BY CASE
               WHEN state = 'ACTIVE' THEN 0 WHEN state = 'ENDING' THEN 1
               WHEN state = 'PAYOUT' THEN 2 WHEN state = 'CLOSED' THEN 3
               WHEN state = 'ARCHIVED' THEN 4 ELSE 5 END, created_at DESC
             LIMIT 1`,
          );
          const seasonState = season.rows[0]?.state;
          if (!seasonState || LIVE_STATES.includes(seasonState as typeof LIVE_STATES[number]) || !WITHDRAWAL_OPEN_STATES.includes(seasonState as typeof WITHDRAWAL_OPEN_STATES[number])) {
            throw new Error("WITHDRAW_NOT_OPEN");
          }

          await client.query(`INSERT INTO user_state (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING`, [userRow.id]);
          const state = await client.query<{ stars_balance: number }>(`SELECT stars_balance FROM user_state WHERE user_id = $1::uuid FOR UPDATE`, [userRow.id]);
          const balance = Number(state.rows[0]?.stars_balance ?? 0);

          const pending = await client.query<{ id: string; amount: string; created_at: string }>(
            `SELECT id::text, amount::text, created_at::text FROM payouts
              WHERE user_id = $1::uuid AND kind = 'STARS' AND note = 'WITHDRAWAL_REQUEST'
                AND status IN ('PENDING','REVIEW')
              ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
            [userRow.id],
          );
          const pendingRow = pending.rows[0];
          if (pendingRow) {
            if (Number(pendingRow.amount) === amount) return pendingRow;
            throw new Error("WITHDRAWAL_PENDING");
          }

          if (amount > balance) throw new Error("INSUFFICIENT_STARS");

          const payout = await client.query<{ id: string; created_at: string; amount: string }>(
            `INSERT INTO payouts (user_id, kind, amount, currency, status, note)
             VALUES ($1::uuid, 'STARS', $2, 'XTR', 'PENDING', 'WITHDRAWAL_REQUEST')
             RETURNING id::text, amount::text, created_at::text`,
            [userRow.id, amount],
          );
          const payoutRow = payout.rows[0];
          if (!payoutRow) throw new Error("WITHDRAW_FAILED");

          await appendStarsLedger(client, {
            userId: userRow.id,
            type: "WITHDRAWAL",
            amount: -amount,
            balanceDelta: -amount,
            referenceId: payoutRow.id,
            idempotencyKey: `withdrawal:${payoutRow.id}`,
            metadata: { amount, seasonState },
          });
          await client.query(
            `INSERT INTO audit_logs (action, entity_type, entity_id, after_data) VALUES ('WITHDRAWAL_REQUESTED','payout',$1,$2::jsonb)`,
            [payoutRow.id, JSON.stringify({ userId: userRow.id, amount, seasonState })],
          );
          return payoutRow;
        });

        return Response.json({ ok: true, withdrawal: { id: withdrawal.id, amount: Number(withdrawal.amount), requestedAt: withdrawal.created_at, status: "PENDING" }, reused: true });
      } catch (error) {
        const code = error instanceof Error ? error.message : "WITHDRAW_FAILED";
        const status = code === "INSUFFICIENT_STARS" || code === "WITHDRAWAL_PENDING" || code === "WITHDRAW_NOT_OPEN" ? 409 : code === "USER_NOT_FOUND" ? 404 : 400;
        return Response.json({ ok: false, code }, { status });
      }
    },
  }}
});
