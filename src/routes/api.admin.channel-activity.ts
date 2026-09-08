import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";

const CHANNEL_ID = process.env["TELEGRAM_CHANNEL_ID"];
const ACTIVITY_POINTS_PER_SPIN = 10;
const MAX_ACTIVITY_BONUS_SPINS = 20;
const MAX_BONUS_SPINS = 1000;

type ActivityStatus = "Низкая" | "Активный" | "Очень активный" | "Максимальная";

function levelFromScore(score: number): ActivityStatus {
  if (score >= 16) return "Максимальная";
  if (score >= 8) return "Очень активный";
  if (score >= 3) return "Активный";
  return "Низкая";
}

export const Route = createFileRoute("/api/admin/channel-activity")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const url = new URL(request.url);
        await authenticateAdmin(url.searchParams.get("initData") ?? "");
        if (!CHANNEL_ID) return Response.json({ ok: false, code: "CHANNEL_NOT_CONFIGURED" }, { status: 409 });

        const season = await query<{ id:string; code:string; name:string; starts_at:string|null; ends_at:string|null }>(
          `SELECT id::text,code,name,starts_at::text,ends_at::text
             FROM seasons
            WHERE state IN ('ACTIVE','ENDING')
            ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END,created_at DESC LIMIT 1`,
        );
        const current = season.rows[0];
        if (!current) return Response.json({ ok:true, season:null, stats:{activeUsers:0,totalPoints:0,totalActions:0,bonusReady:0}, users:[] });

        const result = await query<{
          user_id:string|null; telegram_id:string; name:string; username:string|null; active_days:string; reactions:string; comments:string; joins:string; score:string; bonus_spins:string; activity_bonus_issued:string; activity_bonus_used:string;
        }>(
          `SELECT u.id::text AS user_id,
                  ca.telegram_user_id::text AS telegram_id,
                  COALESCE(NULLIF(trim(concat_ws(' ',u.first_name,u.last_name)),''),'Telegram user') AS name,
                  u.username,
                  COUNT(DISTINCT ca.occurred_at::date)::text AS active_days,
                  COUNT(*) FILTER (WHERE ca.event_type='REACTION')::text AS reactions,
                  COUNT(*) FILTER (WHERE ca.event_type='COMMENT')::text AS comments,
                  COUNT(*) FILTER (WHERE ca.event_type='JOIN')::text AS joins,
                  COALESCE(SUM(ca.activity_points),0)::text AS score,
                  COALESCE(us.bonus_free_spins,0)::text AS bonus_spins,
                  COALESCE(us.activity_bonus_spins_issued,0)::text AS activity_bonus_issued,
                  COALESCE((SELECT COUNT(*) FROM spins s WHERE s.user_id=u.id AND s.season_id=$2::uuid AND s.type='ACTIVITY_BONUS' AND s.status='COMPLETED'),0)::text AS activity_bonus_used
             FROM channel_activity ca
             LEFT JOIN users u ON u.telegram_id=ca.telegram_user_id
             LEFT JOIN user_state us ON us.user_id=u.id
            WHERE ca.channel_id=$1::bigint
              AND ($3::timestamptz IS NULL OR ca.occurred_at >= $3::timestamptz)
              AND ($4::timestamptz IS NULL OR ca.occurred_at <= $4::timestamptz)
              AND ca.telegram_user_id > 0
            GROUP BY u.id,u.first_name,u.last_name,u.username,us.bonus_free_spins,us.activity_bonus_spins_issued,ca.telegram_user_id
            ORDER BY SUM(ca.activity_points) DESC, MAX(ca.occurred_at) DESC`,
          [CHANNEL_ID, current.id, current.starts_at, current.ends_at],
        );

        const users = result.rows.map((row) => {
          const score = Math.max(0, Number(row.score));
          const activityIssued = Math.min(MAX_ACTIVITY_BONUS_SPINS, Math.max(0, Number(row.activity_bonus_issued)));
          const activityUsed = Math.max(0, Number(row.activity_bonus_used));
          const bonusRemaining = Math.max(0, activityIssued - activityUsed);
          return {
            id: row.user_id ?? `tg_${row.telegram_id}`,
            telegramId: row.telegram_id,
            name: row.name,
            username: row.username ? `@${row.username.replace(/^@/, "")}` : "—",
            activeDays: Number(row.active_days),
            reactions: Number(row.reactions),
            comments: Number(row.comments),
            joins: Number(row.joins),
            score,
            level: levelFromScore(score),
            bonus: bonusRemaining > 0,
            bonusSpins: Number(row.bonus_spins),
            activityBonusRemaining: bonusRemaining,
          };
        });
        const totalPoints = users.reduce((sum, row) => sum + row.score, 0);
        const totalActions = users.reduce((sum, row) => sum + row.score, 0);
        const bonusReady = users.filter((row) => row.activityBonusRemaining > 0).length;
        return Response.json({ ok:true, season:{ id:current.id, code:current.code, name:current.name, startsAt:current.starts_at, endsAt:current.ends_at }, stats:{ activeUsers:users.length,totalPoints,totalActions,bonusReady }, users });
      } catch (error) {
        console.error("Channel activity admin API failed:", error instanceof Error ? error.message : error);
        return Response.json({ ok:false, code:"CHANNEL_ACTIVITY_FAILED" }, { status:401 });
      }
    },
    POST: async ({ request }) => {
      try {
        const body = await request.json() as { initData?:unknown; telegramId?:unknown };
        const admin = await authenticateAdmin(typeof body.initData === "string" ? body.initData : "");
        const telegramId = typeof body.telegramId === "string" ? body.telegramId.trim() : "";
        if (!/^\d+$/.test(telegramId)) return Response.json({ ok:false, code:"INVALID_USER" }, { status:400 });
        const result = await withTransaction(async (client) => {
          const user = await client.query<{ id:string }>(`SELECT id::text FROM users WHERE telegram_id=$1::bigint FOR UPDATE`, [telegramId]);
          if (!user.rows[0]) throw new Error("USER_NOT_FOUND");
          const state = await client.query<{ bonus_free_spins:number }>(`SELECT bonus_free_spins FROM user_state WHERE user_id=$1::uuid FOR UPDATE`, [user.rows[0].id]);
          const current = Number(state.rows[0]?.bonus_free_spins ?? 0);
          if (current >= MAX_BONUS_SPINS) throw new Error("BONUS_CAP_REACHED");
          await client.query(`UPDATE user_state SET bonus_free_spins=LEAST($2,bonus_free_spins+1),updated_at=now() WHERE user_id=$1::uuid`, [user.rows[0].id, MAX_BONUS_SPINS]);
          await client.query(`INSERT INTO audit_logs (admin_id,action,entity_type,entity_id,after_data) VALUES ($1::uuid,'ACTIVITY_BONUS_GRANTED','user',$2,$3::jsonb)`, [admin.id,user.rows[0].id,JSON.stringify({ telegramId, source:"ADMIN", amount:1 })]);
          return current + 1;
        });
        return Response.json({ ok:true, bonusFreeSpins:result });
      } catch (error) {
        const code = error instanceof Error ? error.message : "CHANNEL_ACTIVITY_GRANT_FAILED";
        const status = code === "USER_NOT_FOUND" ? 404 : code === "BONUS_CAP_REACHED" ? 409 : 400;
        return Response.json({ ok:false, code }, { status });
      }
    },
  }},
});
