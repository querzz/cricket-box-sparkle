import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query } from "@/server/db";

export const Route = createFileRoute("/api/admin/participants")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const initData = (url.searchParams.get("initData") ?? "").trim();
          const search = (url.searchParams.get("search") ?? "").trim();
          const seasonId = (url.searchParams.get("seasonId") ?? "").trim();
          const allSeasons = url.searchParams.get("all") === "1";
          const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
          if (!initData) return Response.json({ ok: false, code: "INIT_DATA_MISSING" }, { status: 400 });
          await authenticateAdmin(initData);

          const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
          const params: unknown[] = [pattern, search, seasonId || null, limit, allSeasons];
          const result = await query<{
            id: string; telegram_id: string; username: string | null; first_name: string; last_name: string | null;
            created_at: string; last_seen_at: string; is_premium: boolean; xp: number; level: number;
            spins: number; free_spins: number; paid_spins: number; rewards: number; stars_balance: number; last_activity: string | null;
          }>(
            `WITH current_season AS (
               SELECT CASE WHEN $5 THEN NULL ELSE COALESCE($3::uuid, (
                 SELECT id FROM seasons
                  WHERE state IN ('ACTIVE','ENDING','CLOSED','PAYOUT','ARCHIVED')
                  ORDER BY CASE
                    WHEN state='ACTIVE' THEN 0
                    WHEN state='ENDING' THEN 1
                    WHEN state='PAYOUT' THEN 2
                    WHEN state='CLOSED' THEN 3
                    WHEN state='ARCHIVED' THEN 4
                    ELSE 5
                  END, created_at DESC
                  LIMIT 1
               )) END AS id
             ),
             spin_stats AS (
               SELECT user_id,
                      COUNT(*) FILTER (WHERE status='COMPLETED')::int AS spins,
                      COUNT(*) FILTER (WHERE status='COMPLETED' AND type='FREE')::int AS free_spins,
                      COUNT(*) FILTER (WHERE status='COMPLETED' AND type='PAID')::int AS paid_spins,
                      MAX(created_at) AS last_activity
                 FROM spins
                WHERE $5 OR season_id = (SELECT id FROM current_season)
                GROUP BY user_id
             ),
             reward_stats AS (
               SELECT py.user_id, COUNT(*) FILTER (WHERE py.prize_id IS NOT NULL AND py.kind <> 'EMPTY')::int AS rewards,
                      COALESCE(SUM(CASE WHEN py.kind='STARS' AND py.prize_id IS NOT NULL THEN py.amount ELSE 0 END),0)::int AS stars
                 FROM payouts py
                 JOIN spins s ON s.id=py.spin_id
                WHERE ($5 OR s.season_id=(SELECT id FROM current_season))
                  AND py.status IN ('PENDING','REVIEW','PAID')
                GROUP BY py.user_id
             )
             SELECT u.id::text, u.telegram_id::text, u.username, u.first_name, u.last_name,
                    u.created_at::text, u.last_seen_at::text, u.is_premium, u.xp, u.level,
                    COALESCE(ss.spins,0)::int AS spins, COALESCE(ss.free_spins,0)::int AS free_spins,
                    COALESCE(ss.paid_spins,0)::int AS paid_spins, COALESCE(rs.rewards,0)::int AS rewards,
                    COALESCE(us.stars_balance,0)::int AS stars_balance, ss.last_activity::text
               FROM users u
               LEFT JOIN user_state us ON us.user_id=u.id
               LEFT JOIN spin_stats ss ON ss.user_id=u.id
               LEFT JOIN reward_stats rs ON rs.user_id=u.id
              WHERE u.is_test=FALSE
                AND COALESCE(us.is_participant,TRUE)=TRUE
                AND ($2='' OR u.telegram_id::text ILIKE $1 OR COALESCE(u.username,'') ILIKE $1 OR u.first_name ILIKE $1 OR COALESCE(u.last_name,'') ILIKE $1)
              ORDER BY COALESCE(ss.last_activity, u.last_seen_at) DESC
              LIMIT $4`,
            params,
          );

          return Response.json({
            ok: true,
            seasonId: seasonId || null,
            participants: result.rows.map((row) => ({
              id: row.id,
              telegramId: row.telegram_id,
              username: row.username ? `@${row.username.replace(/^@/, "")}` : "—",
              name: [row.first_name, row.last_name].filter(Boolean).join(" "),
              joined: row.created_at,
              lastSeen: row.last_seen_at,
              spins: row.spins,
              freeSpins: row.free_spins,
              paidSpins: row.paid_spins,
              stars: Math.max(0, Number(row.stars_balance) || 0),
              rewards: row.rewards,
              referrals: 0,
              status: row.spins > 0 ? "Активен" as const : "Неактивен" as const,
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
