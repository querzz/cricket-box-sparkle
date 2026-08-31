import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { query } from "@/server/db";

type Row = {
  id: string;
  created_at: string;
  telegram_id: string;
  username: string | null;
  type: "FREE" | "PAID" | "OWNER_GIFT" | "ACTIVITY_BONUS" | "VETERAN_BONUS";
  price_stars: number;
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
  prize_title: string | null;
  prize_subtitle: string | null;
};

export const Route = createFileRoute("/api/admin/spins")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const initData = (url.searchParams.get("initData") ?? "").trim();
          const search = (url.searchParams.get("search") ?? "").trim();
          const type = url.searchParams.get("type") ?? "";
          const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
          if (!initData) return Response.json({ ok: false, code: "INIT_DATA_MISSING" }, { status: 400 });

          const validated = await validateTelegramInitData(initData, requireBotToken());
          const admin = await query<{ role: "OWNER" | "ADMIN" }>(
            `SELECT role FROM admins WHERE telegram_id = $1 AND is_active = TRUE LIMIT 1`,
            [validated.user?.id ?? 0],
          );
          if (!admin.rows[0]) return Response.json({ ok: false, code: "ADMIN_REQUIRED" }, { status: 403 });

          const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
          const result = await query<Row>(
            `SELECT s.id::text, s.created_at::text, u.telegram_id::text, u.username,
                    s.type, s.price_stars, s.status, p.title AS prize_title, p.subtitle AS prize_subtitle
             FROM spins s
             JOIN users u ON u.id = s.user_id
             LEFT JOIN prizes p ON p.id = s.prize_id
             WHERE ($2 = '' OR s.id::text ILIKE $1 OR u.telegram_id::text ILIKE $1 OR COALESCE(u.username,'') ILIKE $1 OR COALESCE(p.title,'') ILIKE $1)
               AND ($3 = '' OR s.type = $3)
             ORDER BY s.created_at DESC
             LIMIT $4`,
            [pattern, search, type, limit],
          );

          return Response.json({
            ok: true,
            spins: result.rows.map((row) => ({
              id: row.id,
              time: row.created_at,
              username: row.username ? `@${row.username.replace(/^@/, "")}` : "—",
              telegramId: row.telegram_id,
              type: row.type === "FREE" ? "Бесплатная" : row.type === "PAID" ? "Платная" : row.type,
              price: row.price_stars,
              result: row.prize_title ? [row.prize_title, row.prize_subtitle].filter(Boolean).join(" · ") : "Пусто",
              status: row.status === "COMPLETED" ? "Успешно" : row.status === "FAILED" ? "Пусто" : row.status,
            })),
          });
        } catch (error) {
          console.error("Spins API failed:", error instanceof Error ? error.message : error);
          return Response.json({ ok: false, code: "SPINS_FAILED" }, { status: 500 });
        }
      },
    },
  },
});
