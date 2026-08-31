import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { query } from "@/server/db";

type UserRow = {
  id: string;
  telegram_id: string;
  username: string | null;
  first_name: string;
  last_name: string | null;
  created_at: string;
  last_seen_at: string;
  is_premium: boolean;
  xp: number;
  level: number;
  spins: number;
  rewards: number;
  referrals: number;
};

export const Route = createFileRoute("/api/admin/participants")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const initData = (url.searchParams.get("initData") ?? "").trim();
          const search = (url.searchParams.get("search") ?? "").trim();
          const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
          if (!initData) return Response.json({ ok: false, code: "INIT_DATA_MISSING" }, { status: 400 });

          const validated = await validateTelegramInitData(initData, requireBotToken());
          const admin = await query<{ role: "OWNER" | "ADMIN" }>(
            `SELECT role FROM admins WHERE telegram_id = $1 AND is_active = TRUE LIMIT 1`,
            [validated.user?.id ?? 0],
          );
          if (!admin.rows[0]) return Response.json({ ok: false, code: "ADMIN_REQUIRED" }, { status: 403 });

          const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
          const result = await query<UserRow>(
            `SELECT
               u.id,
               u.telegram_id::text,
               u.username,
               u.first_name,
               u.last_name,
               u.created_at::text,
               u.last_seen_at::text,
               u.is_premium,
               u.xp,
               u.level,
               COUNT(s.id)::int AS spins,
               COUNT(p.id)::int AS rewards,
               0::int AS referrals
             FROM users u
             LEFT JOIN spins s ON s.user_id = u.id AND s.status = 'COMPLETED'
             LEFT JOIN payouts p ON p.user_id = u.id AND p.status IN ('PENDING','REVIEW','PAID')
             WHERE ($2 = '' OR u.telegram_id::text ILIKE $1 OR COALESCE(u.username, '') ILIKE $1 OR u.first_name ILIKE $1 OR COALESCE(u.last_name, '') ILIKE $1)
             GROUP BY u.id
             ORDER BY u.last_seen_at DESC
             LIMIT $3`,
            [pattern, search, limit],
          );

          return Response.json({
            ok: true,
            participants: result.rows.map((row) => ({
              id: row.id,
              telegramId: row.telegram_id,
              username: row.username ? `@${row.username.replace(/^@/, "")}` : "—",
              name: [row.first_name, row.last_name].filter(Boolean).join(" "),
              joined: row.created_at,
              lastSeen: row.last_seen_at,
              spins: row.spins,
              freeSpins: 0,
              paidSpins: 0,
              stars: 0,
              rewards: row.rewards,
              referrals: row.referrals,
              status: "Активен" as const,
              isPremium: row.is_premium,
              xp: row.xp,
              level: row.level,
            })),
          });
        } catch (error) {
          console.error("Participants API failed:", error instanceof Error ? error.message : error);
          return Response.json({ ok: false, code: "PARTICIPANTS_FAILED" }, { status: 500 });
        }
      },
    },
  },
});
