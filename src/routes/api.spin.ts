import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";
import { appendStarsLedger } from "@/server/stars-ledger";

const MAX_STARS = 500;
const MAX_BONUS_SPINS = 1000;

type Body = { initData?: unknown; paid?: unknown };
type PrizeRow = {
  id: string;
  kind: "STARS" | "PREMIUM" | "MONEY" | "NFT" | "PHYSICAL" | "CUSTOM" | "FREE_SPIN" | "EMPTY";
  title: string;
  subtitle: string | null;
  amount: string;
  unit_cost: string;
  currency: string | null;
  quantity_remaining: number;
  metadata: Record<string, unknown> | null;
};

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

export const Route = createFileRoute("/api/spin")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const body = await request.json() as Body;
        const initData = typeof body.initData === "string" ? body.initData.trim() : "";
        const paid = body.paid === true;
        if (!initData) return Response.json({ ok: false, code: "INIT_DATA_MISSING" }, { status: 400 });
        if (paid) return Response.json({ ok: false, code: "PAYMENT_REQUIRED" }, { status: 402 });

        const validated = await validateTelegramInitData(initData, requireBotToken());
        const telegramId = validated.user?.id;
        if (!telegramId) return Response.json({ ok: false, code: "TELEGRAM_USER_MISSING" }, { status: 400 });

        const result = await withTransaction(async (client) => {
          const user = await client.query<{ id: string; xp: number }>(`SELECT id::text, xp FROM users WHERE telegram_id = $1 LIMIT 1 FOR UPDATE`, [telegramId]);
          if (!user.rows[0]) throw new Error("USER_NOT_FOUND");

          await client.query(`INSERT INTO user_state (user_id, stars_balance, is_subscribed, is_participant, bonus_free_spins) VALUES ($1::uuid, 125, TRUE, TRUE, 0) ON CONFLICT (user_id) DO NOTHING`, [user.rows[0].id]);
          const userState = await client.query<{ is_subscribed: boolean; is_participant: boolean; stars_balance: number; bonus_free_spins: number }>(`SELECT is_subscribed, is_participant, stars_balance, bonus_free_spins FROM user_state WHERE user_id = $1::uuid FOR UPDATE`, [user.rows[0].id]);
          const state = userState.rows[0];
          if (!state?.is_subscribed) throw new Error("NOT_SUBSCRIBED");
          if (!state.is_participant) throw new Error("NOT_PARTICIPANT");

          const season = await client.query<{ id: string; code: string; state: string; paid_spin_price: number; daily_free_spin: boolean }>(`SELECT id::text, code, state, paid_spin_price, daily_free_spin FROM seasons WHERE state IN ('ACTIVE', 'ENDING') ORDER BY CASE WHEN state = 'ACTIVE' THEN 0 ELSE 1 END, created_at DESC LIMIT 1 FOR UPDATE`);
          const currentSeason = season.rows[0];
          if (!currentSeason) throw new Error("SEASON_NOT_ACTIVE");

          const alreadyFree = await client.query<{ exists: boolean }>(`SELECT EXISTS(SELECT 1 FROM spins WHERE user_id = $1::uuid AND season_id = $2::uuid AND type = 'FREE' AND status = 'COMPLETED' AND created_at >= date_trunc('day', now())) AS exists`, [user.rows[0].id, currentSeason.id]);
          const useDaily = Boolean(currentSeason.daily_free_spin && !alreadyFree.rows[0]?.exists);
          const useBonus = !useDaily && Number(state.bonus_free_spins ?? 0) > 0;
          if (!useDaily && !useBonus) throw new Error("NO_ATTEMPTS");

          const prizes = await client.query<PrizeRow>(
            `SELECT id::text, kind, title, subtitle, amount::text, unit_cost::text, currency, quantity_remaining, metadata
               FROM prizes
              WHERE season_id = $1::uuid AND quantity_remaining > 0 AND is_active = TRUE
                AND (kind <> 'STARS' OR $2::integer < $3::integer)
              ORDER BY created_at ASC FOR UPDATE`,
            [currentSeason.id, Number(state.stars_balance ?? 0), MAX_STARS],
          );
          if (!prizes.rows.length) throw new Error("NO_PRIZES");

          const picked = pickWeighted(prizes.rows);
          const inventoryUpdate = await client.query(`UPDATE prizes SET quantity_remaining = quantity_remaining - 1, updated_at = now() WHERE id = $1::uuid AND quantity_remaining > 0 RETURNING id`, [picked.id]);
          if (!inventoryUpdate.rows[0]) throw new Error("NO_PRIZES");

          const spin = await client.query<{ id: string; created_at: string }>(`INSERT INTO spins (user_id, season_id, type, price_stars, prize_id, status, completed_at) VALUES ($1::uuid, $2::uuid, 'FREE', 0, $3::uuid, 'COMPLETED', now()) RETURNING id::text, created_at::text`, [user.rows[0].id, currentSeason.id, picked.id]);

          if (useBonus) await client.query(`UPDATE user_state SET bonus_free_spins = GREATEST(0, bonus_free_spins - 1), updated_at = now() WHERE user_id = $1::uuid`, [user.rows[0].id]);

          const nextXp = Number(user.rows[0].xp ?? 0) + 10;
          await client.query(`UPDATE users SET xp = $2, level = $3, last_seen_at = now() WHERE id = $1::uuid`, [user.rows[0].id, nextXp, Math.max(1, Math.floor(nextXp / 100) + 1)]);

          const rewardStars = picked.kind === "STARS" ? Math.max(0, Math.floor(Number(picked.amount) || 0)) : 0;
          const credited = rewardStars > 0 ? Math.min(rewardStars, Math.max(0, MAX_STARS - Number(state.stars_balance ?? 0))) : 0;
          const overflow = Math.max(0, rewardStars - credited);
          if (rewardStars > 0) {
            await appendStarsLedger(client, {
              userId: user.rows[0].id,
              seasonId: currentSeason.id,
              spinId: spin.rows[0].id,
              type: "REWARD",
              amount: rewardStars,
              balanceDelta: credited,
              referenceId: picked.id,
              idempotencyKey: `spin:${spin.rows[0].id}:reward`,
              metadata: { requestedAmount: rewardStars, creditedAmount: credited, overflowAmount: overflow, source: "FREE_SPIN" },
            });
            if (overflow > 0) {
              await appendStarsLedger(client, {
                userId: user.rows[0].id,
                seasonId: currentSeason.id,
                spinId: spin.rows[0].id,
                type: "CAPPED_OVERFLOW_BURNED",
                amount: -overflow,
                balanceDelta: 0,
                referenceId: picked.id,
                idempotencyKey: `spin:${spin.rows[0].id}:overflow`,
                metadata: { requestedAmount: rewardStars, creditedAmount: credited, overflowAmount: overflow, source: "FREE_SPIN" },
              });
            }
          }

          let payoutId: string | null = null;
          if (picked.kind !== "EMPTY") {
            const payoutStatus = rewardStars > 0 ? "PAID" : "PENDING";
            const payoutNote = rewardStars > 0
              ? (credited < rewardStars ? `Лимит 500 Stars: зачислено ${credited} из ${rewardStars}.` : "Stars зачислены на баланс.")
              : "Приз ожидает выдачи администратором.";
            const payout = await client.query<{ id: string }>(`INSERT INTO payouts (spin_id, user_id, prize_id, kind, amount, currency, status, note, paid_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::numeric, $6, $7, $8, CASE WHEN $7='PAID' THEN now() ELSE NULL END) RETURNING id::text`, [spin.rows[0].id, user.rows[0].id, picked.id, picked.kind, picked.amount, picked.currency, payoutStatus, payoutNote]);
            payoutId = payout.rows[0].id;
          }

          await client.query(`INSERT INTO audit_logs (action, entity_type, entity_id, after_data) VALUES ('SPIN_COMPLETED', 'spin', $1, $2::jsonb)`, [spin.rows[0].id, JSON.stringify({ userId: user.rows[0].id, seasonId: currentSeason.id, prizeId: picked.id, type: "FREE", usedDaily: useDaily, usedBonus: useBonus, rewardKind: picked.kind, creditedStars: credited, overflowStars: overflow })]);

          return { spinId: spin.rows[0].id, payoutId, createdAt: spin.rows[0].created_at, prize: picked, credited, rewardStars };
        });

        const prize = result.prize;
        return Response.json({
          ok: true,
          spin: { id: result.spinId, type: "FREE", priceStars: 0, status: "COMPLETED", createdAt: result.createdAt },
          reward: {
            id: result.payoutId ?? result.spinId,
            kind: prize.kind,
            title: prize.title,
            subtitle: prize.subtitle,
            amount: Number(prize.amount) || undefined,
            wonAt: result.createdAt,
            status: prize.kind === "EMPTY" ? "RECEIVED" : prize.kind === "STARS" ? "RECEIVED" : "PENDING",
            payoutNote: prize.kind === "EMPTY" ? "В этот раз без награды." : prize.kind === "STARS" ? (result.credited < result.rewardStars ? `Лимит 500 Stars: зачислено ${result.credited} из ${result.rewardStars}.` : "Stars зачислены на баланс.") : "Награда записана и ожидает выдачи.",
            creditedAmount: prize.kind === "STARS" ? result.credited : undefined,
            uncreditedAmount: prize.kind === "STARS" ? Math.max(0, result.rewardStars - result.credited) : 0,
          },
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "SPIN_FAILED";
        const status = code === "NO_ATTEMPTS" || code === "NO_PRIZES" ? 409 : code === "USER_NOT_FOUND" || code === "NOT_SUBSCRIBED" || code === "NOT_PARTICIPANT" ? 403 : code === "SEASON_NOT_ACTIVE" ? 409 : code === "PAYMENT_REQUIRED" ? 402 : 400;
        console.error("[CRICKET BOX] spin failed", { code });
        return Response.json({ ok: false, code, detail: code }, { status });
      }
    },
  },
});
