import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";
import { authenticateAdmin } from "@/server/auth/access";

export const Route = createFileRoute("/api/dev/paid-spin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { initData?: unknown };
          const initData = typeof body.initData === "string" ? body.initData.trim() : "";
          const admin = await authenticateAdmin(initData);
          const validated = await validateTelegramInitData(initData, requireBotToken());
          const telegramId = validated.user?.id;
          if (!telegramId) return Response.json({ ok: false, code: "TELEGRAM_USER_MISSING" }, { status: 400 });

          const result = await withTransaction(async (client) => {
            const user = await client.query<{ id: string; xp: number }>(
              `SELECT id::text, xp FROM users WHERE telegram_id = $1 LIMIT 1 FOR UPDATE`,
              [telegramId],
            );
            if (!user.rows[0]) throw new Error("USER_NOT_FOUND");

            const season = await client.query<{ id: string; code: string; state: string; paid_spin_price: number }>(
              `SELECT id::text, code, state, paid_spin_price
                 FROM seasons
                WHERE state IN ('ACTIVE','ENDING')
                ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END, created_at DESC
                LIMIT 1 FOR UPDATE`,
            );
            const currentSeason = season.rows[0];
            if (!currentSeason) throw new Error("SEASON_NOT_ACTIVE");

            const prizes = await client.query<{
              id: string; kind: string; title: string; subtitle: string | null; amount: string; currency: string | null; quantity_remaining: number;
            }>(
              `SELECT id::text, kind, title, subtitle, amount::text, currency, quantity_remaining
                 FROM prizes
                WHERE season_id=$1::uuid AND quantity_remaining > 0
                ORDER BY created_at ASC
                FOR UPDATE`,
              [currentSeason.id],
            );
            if (!prizes.rows.length) throw new Error("NO_PRIZES");

            const total = prizes.rows.reduce((sum, prize) => sum + prize.quantity_remaining, 0);
            let cursor = Math.floor(Math.random() * total);
            let picked = prizes.rows[prizes.rows.length - 1]!;
            for (const prize of prizes.rows) {
              cursor -= prize.quantity_remaining;
              if (cursor < 0) { picked = prize; break; }
            }

            await client.query(`UPDATE prizes SET quantity_remaining=quantity_remaining-1, updated_at=now() WHERE id=$1::uuid`, [picked.id]);
            const spin = await client.query<{ id: string; created_at: string }>(
              `INSERT INTO spins (user_id, season_id, type, price_stars, prize_id, status, completed_at)
               VALUES ($1::uuid,$2::uuid,'PAID',0,$3::uuid,'COMPLETED',now())
               RETURNING id::text, created_at::text`,
              [user.rows[0].id, currentSeason.id, picked.id],
            );
            const nextXp = Number(user.rows[0].xp ?? 0) + 10;
            await client.query(`UPDATE users SET xp=$2, level=$3, last_seen_at=now() WHERE id=$1::uuid`, [user.rows[0].id, nextXp, Math.max(1, Math.floor(nextXp / 100) + 1)]);
            const payout = await client.query<{ id: string }>(
              `INSERT INTO payouts (spin_id,user_id,prize_id,kind,amount,currency,status,note)
               VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::numeric,$6,'PENDING','DEV_PAID_SPIN')
               RETURNING id::text`,
              [spin.rows[0].id, user.rows[0].id, picked.id, picked.kind, picked.amount, picked.currency],
            );
            await client.query(
              `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, after_data)
               VALUES ($1::uuid,'DEV_PAID_SPIN','spin',$2,$3::jsonb)`,
              [admin.id, spin.rows[0].id, JSON.stringify({ userId: user.rows[0].id, seasonId: currentSeason.id, prizeId: picked.id })],
            );
            return { spin: spin.rows[0], payoutId: payout.rows[0].id, season: currentSeason, prize: picked };
          });

          return Response.json({
            ok: true,
            test: true,
            spin: { id: result.spin.id, type: "PAID", priceStars: 0, status: "COMPLETED", createdAt: result.spin.created_at },
            reward: { id: result.payoutId, kind: result.prize.kind, title: result.prize.title, subtitle: result.prize.subtitle, amount: Number(result.prize.amount) || undefined, wonAt: result.spin.created_at, status: "PENDING" },
          });
        } catch (error) {
          const code = error instanceof Error ? error.message : "DEV_PAID_SPIN_FAILED";
          console.error("[CRICKET BOX] dev paid spin failed", { code });
          return Response.json({ ok: false, code }, { status: code === "NO_PRIZES" ? 409 : 400 });
        }
      },
    },
  },
});
