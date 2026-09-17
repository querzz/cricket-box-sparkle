import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { query } from "@/server/db";

export type PlannerPrizeRow = {
  id: string;
  kind: string;
  title: string;
  amount: string;
  unit_cost: string;
  currency: string | null;
  quantity_total: number;
  quantity_remaining: number;
  is_active: boolean;
};

export const Route = createFileRoute("/api/admin/economic-planner")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          await authenticateAdmin(url.searchParams.get("initData") ?? "");

          const requestedSeasonId = (url.searchParams.get("seasonId") ?? "").trim();
          const season = requestedSeasonId
            ? await query<{
                id: string;
                code: string;
                name: string;
                state: string;
                starts_at: string | null;
                ends_at: string | null;
                paid_spin_price: number;
                paid_spin_enabled: boolean;
                daily_free_spin: boolean;
              }>(
                `SELECT id::text,code,name,state,starts_at::text,ends_at::text,paid_spin_price,paid_spin_enabled,daily_free_spin
                   FROM seasons WHERE id=$1::uuid LIMIT 1`,
                [requestedSeasonId],
              )
            : await query<{
                id: string;
                code: string;
                name: string;
                state: string;
                starts_at: string | null;
                ends_at: string | null;
                paid_spin_price: number;
                paid_spin_enabled: boolean;
                daily_free_spin: boolean;
              }>(
                `SELECT id::text,code,name,state,starts_at::text,ends_at::text,paid_spin_price,paid_spin_enabled,daily_free_spin
                   FROM seasons
                  ORDER BY CASE WHEN state='ACTIVE' THEN 0 WHEN state='ENDING' THEN 1 WHEN state='SCHEDULED' THEN 2 ELSE 3 END,created_at DESC
                  LIMIT 1`,
              );

          const current = season.rows[0];
          if (!current) return Response.json({ ok: false, code: "SEASON_NOT_FOUND" }, { status: 404 });

          const prizes = await query<PlannerPrizeRow>(
            `SELECT id::text,kind,title,amount::text,unit_cost::text,currency,quantity_total,quantity_remaining,is_active
               FROM prizes
              WHERE season_id=$1::uuid
              ORDER BY created_at ASC`,
            [current.id],
          );
          const spins = await query<{ completed: string; paid: string; free: string }>(
            `SELECT COUNT(*) FILTER (WHERE status='COMPLETED')::text AS completed,
                    COUNT(*) FILTER (WHERE status='COMPLETED' AND type='PAID')::text AS paid,
                    COUNT(*) FILTER (WHERE status='COMPLETED' AND type='FREE')::text AS free
               FROM spins WHERE season_id=$1::uuid`,
            [current.id],
          );

          return Response.json({
            ok: true,
            season: current,
            prizes: prizes.rows,
            currentSpins: {
              completed: Number(spins.rows[0]?.completed ?? 0),
              paid: Number(spins.rows[0]?.paid ?? 0),
              free: Number(spins.rows[0]?.free ?? 0),
            },
          });
        } catch (error) {
          const code = error instanceof Error ? error.message : "ECONOMIC_PLANNER_FAILED";
          return Response.json({ ok: false, code }, { status: code === "ADMIN_ACCESS_DENIED" ? 401 : 400 });
        }
      },
    },
  },
});
