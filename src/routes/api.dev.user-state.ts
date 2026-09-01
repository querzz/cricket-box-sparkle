import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { withTransaction } from "@/server/db";

const MAX_STARS = 500;

type Action = "SET_STARS" | "SET_SUBSCRIBED" | "RESET_FREE_SPIN";

type Body = {
  initData?: unknown;
  action?: unknown;
  value?: unknown;
};

export const Route = createFileRoute("/api/dev/user-state")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Body;
          const initData = typeof body.initData === "string" ? body.initData.trim() : "";
          const action = typeof body.action === "string" ? body.action as Action : null;
          if (!initData || !action || !["SET_STARS", "SET_SUBSCRIBED", "RESET_FREE_SPIN"].includes(action)) {
            return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
          }

          const admin = await authenticateAdmin(initData);

          const result = await withTransaction(async (client) => {
            const user = await client.query<{ id: string }>(
              `SELECT id::text FROM users WHERE telegram_id = $1 FOR UPDATE`,
              [admin.telegramId],
            );
            if (!user.rows[0]) throw new Error("USER_NOT_FOUND");

            await client.query(
              `INSERT INTO user_state (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING`,
              [user.rows[0].id],
            );

            if (action === "SET_STARS") {
              const amount = Math.round(Number(body.value));
              if (!Number.isFinite(amount) || amount < 0 || amount > MAX_STARS) throw new Error("INVALID_STARS");
              await client.query(
                `UPDATE user_state SET stars_balance = $2, updated_at = now() WHERE user_id = $1::uuid`,
                [user.rows[0].id, amount],
              );
            } else if (action === "SET_SUBSCRIBED") {
              if (typeof body.value !== "boolean") throw new Error("INVALID_SUBSCRIPTION");
              await client.query(
                `UPDATE user_state SET is_subscribed = $2, updated_at = now() WHERE user_id = $1::uuid`,
                [user.rows[0].id, body.value],
              );
            } else {
              await client.query(
                `UPDATE user_state SET updated_at = now() WHERE user_id = $1::uuid`,
                [user.rows[0].id],
              );
              await client.query(
                `DELETE FROM spins
                  WHERE user_id = $1::uuid
                    AND type = 'FREE'
                    AND created_at >= date_trunc('day', now())`,
                [user.rows[0].id],
              );
            }

            const state = await client.query<{
              stars_balance: number;
              is_subscribed: boolean;
            }>(
              `SELECT stars_balance, is_subscribed FROM user_state WHERE user_id = $1::uuid`,
              [user.rows[0].id],
            );
            return state.rows[0];
          });

          return Response.json({ ok: true, state: result });
        } catch (error) {
          const code = error instanceof Error ? error.message : "DEV_STATE_FAILED";
          const status = code === "ADMIN_ACCESS_DENIED" ? 403 : code === "USER_NOT_FOUND" ? 404 : 400;
          return Response.json({ ok: false, code }, { status });
        }
      },
    },
  },
});
