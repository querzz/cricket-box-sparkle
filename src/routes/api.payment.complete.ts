import { createFileRoute } from "@tanstack/react-router";

import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";

type Body = {
  token?: unknown;
  payload?: unknown;
  telegramId?: unknown;
  chargeId?: unknown;
  currency?: unknown;
  totalAmount?: unknown;
};

type PrizeRow = {
  id: string;
  kind: "STARS" | "PREMIUM" | "MONEY" | "NFT" | "PHYSICAL" | "CUSTOM" | "FREE_SPIN";
  title: string;
  subtitle: string | null;
  amount: string;
  currency: string | null;
  quantity_remaining: number;
  metadata: Record<string, unknown> | null;
};

const BOT_HEADER = "x-cricket-bot-token";
const MAX_STARS = 500;

function pickWeighted(prizes: PrizeRow[]) {
  const weighted = prizes.map((prize) => {
    const configuredWeight = Number(prize.metadata?.weight ?? 1);
    const weight = Number.isFinite(configuredWeight) && configuredWeight > 0 ? configuredWeight : 1;
    return { prize, weight: weight * prize.quantity_remaining };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor < 0) return item.prize;
  }
  return weighted[weighted.length - 1]!.prize;
}

export const Route = createFileRoute("/api/payment/complete")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const token = request.headers.get(BOT_HEADER) ?? "";
        if (!token || token !== requireBotToken()) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });

        const body = (await request.json()) as Body;
        const payload = typeof body.payload === "string" ? body.payload.trim() : "";
        const chargeId = typeof body.chargeId === "string" ? body.chargeId.trim() : "";
        const currency = typeof body.currency === "string" ? body.currency : "";
        const totalAmount = Number(body.totalAmount);
        const telegramId = Number(body.telegramId);
        if (!payload || !chargeId || currency !== "XTR" || !Number.isSafeInteger(totalAmount) || totalAmount <= 0 || !Number.isSafeInteger(telegramId)) {
          return Response.json({ ok: false, code: "INVALID_PAYMENT" }, { status: 400 });
        }

        if (!payload.startsWith("paidspin:v1:")) return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 });
        const [, , userId, seasonId] = payload.split(":");
        if (!userId || !seasonId) return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 });

        const result = await withTransaction(async (client) => {
          const existing = await client.query<{ id: string; status: string; spin_id: string | null; user_id: string | null; amount: string }>(
            `SELECT id::text, status, spin_id::text, user_id::text, amount::text
               FROM star_transactions
              WHERE telegram_charge_id = $1
              LIMIT 1
              FOR UPDATE`,
            [chargeId],
          );
          if (existing.rows[0]) {
            const row = existing.rows[0];
            if (row.user_id !== userId || Number(row.amount) !== totalAmount) throw new Error("PAYMENT_CHARGE_MISMATCH");
            if (row.status === "SUCCESS") {
              return { duplicate: true, spinId: row.spin_id, payoutId: null, reward: null };
            }
            if (row.status !== "PENDING") throw new Error("PAYMENT_NOT_PENDING");
          }

          const tx = await client.query<{ id: string; amount: number; status: string; user_id: string; payload: Record<string, unknown> }>(
            `SELECT id::text, amount, status, user_id::text, payload
               FROM star_transactions
              WHERE payload->>'payload' = $1
              ORDER BY created_at DESC, id DESC
              LIMIT 1
              FOR UPDATE`,
            [payload],
          );
          if (!tx.rows[0]) throw new Error("PAYMENT_NOT_FOUND");
          if (tx.rows[0].user_id !== userId) throw new Error("PAYMENT_USER_MISMATCH");
          if (Number(tx.rows[0].amount) !== totalAmount) throw new Error("PAYMENT_AMOUNT_MISMATCH");
          if (tx.rows[0].status !== "PENDING") throw new Error("PAYMENT_NOT_PENDING");

          const user = await client.query<{ id: string; xp: number }>(
            `SELECT id::text, xp FROM users WHERE id = $1::uuid AND telegram_id = $2 FOR UPDATE`,
            [userId, telegramId],
          );
          if (!user.rows[0]) throw new Error("USER_NOT_FOUND");

          await client.query(`INSERT INTO user_state (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING`, [userId]);
          const userState = await client.query<{ is_subscribed: boolean; is_participant: boolean; stars_balance: number }>(
            `SELECT is_subscribed, is_participant, stars_balance FROM user_state WHERE user_id = $1::uuid FOR UPDATE`,
            [userId],
          );
          const state = userState.rows[0];
          if (!state?.is_subscribed) throw new Error("NOT_SUBSCRIBED");
          if (!state.is_participant) throw new Error("NOT_PARTICIPANT");

          const season = await client.query<{ id: string; state: string; paid_spin_price: number }>(
            `SELECT id::text, state, paid_spin_price FROM seasons WHERE id = $1::uuid FOR UPDATE`,
            [seasonId],
          );
          const seasonRow = season.rows[0];
          if (!seasonRow || !["ACTIVE", "ENDING"].includes(seasonRow.state)) throw new Error("SEASON_NOT_ACTIVE");
          if (Number(seasonRow.paid_spin_price) !== totalAmount) throw new Error("PAYMENT_AMOUNT_MISMATCH");

          // A successful Telegram payment must never disappear because the prize pool
          // changed between pre-checkout and completion. Preserve the paid operation as
          // an auditable manual-resolution payout when no inventory remains.
          const prizes = await client.query<PrizeRow>(
            `SELECT id::text, kind, title, subtitle, amount::text, currency, quantity_remaining, metadata
               FROM prizes
              WHERE season_id = $1::uuid
                AND quantity_remaining > 0
                AND (kind <> 'STARS' OR $2::integer < $3::integer)
              ORDER BY created_at ASC
              FOR UPDATE`,
            [seasonId, Number(state.stars_balance ?? 0), MAX_STARS],
          );

          if (!prizes.rows.length) {
            const spin = await client.query<{ id: string; created_at: string }>(
              `INSERT INTO spins (user_id, season_id, type, price_stars, prize_id, status, telegram_payment_charge_id, completed_at)
               VALUES ($1::uuid, $2::uuid, 'PAID', $3, NULL, 'COMPLETED', $4, now())
               RETURNING id::text, created_at::text`,
              [userId, seasonId, totalAmount, chargeId],
            );
            const payout = await client.query<{ id: string }>(
              `INSERT INTO payouts (spin_id, user_id, prize_id, kind, amount, currency, status, note)
               VALUES ($1::uuid, $2::uuid, NULL, 'CUSTOM', 0, NULL, 'REVIEW', 'PAYMENT_SETTLED_NO_PRIZE_INVENTORY')
               RETURNING id::text`,
              [spin.rows[0].id, userId],
            );
            await client.query(
              `UPDATE star_transactions
                  SET status='SUCCESS', telegram_charge_id=$2, spin_id=$3::uuid, processed_at=now(),
                      payload=payload || $4::jsonb
                WHERE id=$1::uuid`,
              [tx.rows[0].id, chargeId, spin.rows[0].id, JSON.stringify({ telegramId, currency, totalAmount, manualResolution: true })],
            );
            await client.query(
              `INSERT INTO audit_logs (action, entity_type, entity_id, after_data)
               VALUES ('PAID_SPIN_REQUIRES_MANUAL_RESOLUTION', 'spin', $1, $2::jsonb)`,
              [spin.rows[0].id, JSON.stringify({ userId, seasonId, chargeId, totalAmount, payoutId: payout.rows[0].id })],
            );
            return {
              duplicate: false,
              spinId: spin.rows[0].id,
              payoutId: payout.rows[0].id,
              reward: {
                kind: "EMPTY",
                title: "Оплата получена",
                subtitle: "Призовой фонд закончился. Заявка передана администратору для решения.",
                amount: undefined,
                credited: 0,
                payoutStatus: "REVIEW",
              },
            };
          }

          const picked = pickWeighted(prizes.rows);
          await client.query(`UPDATE prizes SET quantity_remaining = quantity_remaining - 1, updated_at = now() WHERE id = $1::uuid AND quantity_remaining > 0`, [picked.id]);

          const spin = await client.query<{ id: string; created_at: string }>(
            `INSERT INTO spins (user_id, season_id, type, price_stars, prize_id, status, telegram_payment_charge_id, completed_at)
             VALUES ($1::uuid, $2::uuid, 'PAID', $3, $4::uuid, 'COMPLETED', $5, now())
             RETURNING id::text, created_at::text`,
            [userId, seasonId, totalAmount, picked.id, chargeId],
          );

          const rewardStars = picked.kind === "STARS" ? Math.max(0, Math.floor(Number(picked.amount) || 0)) : 0;
          const credited = rewardStars > 0 ? Math.min(rewardStars, Math.max(0, MAX_STARS - Number(state.stars_balance ?? 0))) : 0;
          const payoutStatus = rewardStars > 0 ? "PAID" : "PENDING";
          const payoutNote = rewardStars > 0
            ? (credited < rewardStars ? `Лимит 500 Stars: зачислено ${credited} из ${rewardStars}.` : "Stars зачислены на баланс.")
            : "Награда ожидает выдачи администратором.";

          if (credited > 0) {
            await client.query(`UPDATE user_state SET stars_balance = stars_balance + $2, updated_at = now() WHERE user_id = $1::uuid`, [userId, credited]);
          }

          const payout = await client.query<{ id: string }>(
            `INSERT INTO payouts (spin_id, user_id, prize_id, kind, amount, currency, status, note, paid_at)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::numeric, $6, $7, $8, CASE WHEN $7='PAID' THEN now() ELSE NULL END)
             RETURNING id::text`,
            [spin.rows[0].id, userId, picked.id, picked.kind, picked.amount, picked.currency, payoutStatus, payoutNote],
          );

          const nextXp = Number(user.rows[0].xp ?? 0) + 10;
          await client.query(`UPDATE users SET xp = $2, level = $3, last_seen_at = now() WHERE id = $1::uuid`, [userId, nextXp, Math.max(1, Math.floor(nextXp / 100) + 1)]);

          await client.query(
            `UPDATE star_transactions SET status='SUCCESS', telegram_charge_id=$2, spin_id=$3::uuid, processed_at=now(), payload=payload || $4::jsonb WHERE id=$1::uuid`,
            [tx.rows[0].id, chargeId, spin.rows[0].id, JSON.stringify({ telegramId, currency, totalAmount, creditedStars: credited })],
          );
          await client.query(
            `INSERT INTO audit_logs (action, entity_type, entity_id, after_data)
             VALUES ('PAID_SPIN_COMPLETED', 'spin', $1, $2::jsonb)`,
            [spin.rows[0].id, JSON.stringify({ userId, seasonId, prizeId: picked.id, chargeId, totalAmount, payoutId: payout.rows[0].id })],
          );

          return {
            duplicate: false,
            spinId: spin.rows[0].id,
            payoutId: payout.rows[0].id,
            reward: {
              kind: picked.kind === "FREE_SPIN" ? "FREE_SPIN" : picked.kind,
              title: picked.title,
              subtitle: picked.subtitle,
              amount: Number(picked.amount) || undefined,
              credited,
              payoutStatus,
            },
          };
        });

        return Response.json({ ok: true, ...result });
      } catch (error) {
        const code = error instanceof Error ? error.message : "PAYMENT_COMPLETE_FAILED";
        const status = ["PAYMENT_NOT_FOUND", "PAYMENT_USER_MISMATCH", "USER_NOT_FOUND"].includes(code) ? 404 : ["SEASON_NOT_ACTIVE", "NO_PRIZES", "PAYMENT_NOT_PENDING"].includes(code) ? 409 : 400;
        return Response.json({ ok: false, code }, { status });
      }
    },
  }},
});
