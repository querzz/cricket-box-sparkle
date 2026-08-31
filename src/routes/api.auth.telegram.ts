import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { query } from "@/server/db";
import { requireBotToken } from "@/server/config";

type AuthBody = { initData?: unknown };

type AdminRow = { role: "OWNER" | "ADMIN" };

export const Route = createFileRoute("/api/auth/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as AuthBody;
          const initData = typeof body.initData === "string" ? body.initData.trim() : "";
          if (!initData) return Response.json({ ok: false, code: "INIT_DATA_MISSING" }, { status: 400 });

          const validated = await validateTelegramInitData(initData, requireBotToken());
          const user = validated.user;
          if (!user?.id || !user.first_name) {
            return Response.json({ ok: false, code: "TELEGRAM_USER_MISSING" }, { status: 400 });
          }

          await query(
            `INSERT INTO users (telegram_id, username, first_name, last_name, language_code, is_premium, last_seen_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (telegram_id) DO UPDATE SET
               username = EXCLUDED.username,
               first_name = EXCLUDED.first_name,
               last_name = EXCLUDED.last_name,
               language_code = EXCLUDED.language_code,
               is_premium = EXCLUDED.is_premium,
               last_seen_at = now()`,
            [user.id, user.username ?? null, user.first_name, user.last_name ?? null, user.language_code ?? null, Boolean(user.is_premium)],
          );

          const adminResult = await query<AdminRow>(
            `SELECT role FROM admins WHERE telegram_id = $1 AND is_active = TRUE LIMIT 1`,
            [user.id],
          );
          const role = adminResult.rows[0]?.role ?? "USER";

          return Response.json({
            ok: true,
            user: {
              telegramId: user.id,
              username: user.username ?? null,
              firstName: user.first_name,
              lastName: user.last_name ?? null,
              isPremium: Boolean(user.is_premium),
            },
            access: role === "USER" ? "USER" : role,
          });
        } catch (error) {
          console.error("Telegram auth failed:", error instanceof Error ? error.message : error);
          return Response.json({ ok: false, code: "AUTH_FAILED" }, { status: 401 });
        }
      },
    },
  },
});
