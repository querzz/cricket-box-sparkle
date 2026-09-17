import { createFileRoute } from "@tanstack/react-router";
import { query } from "@/server/db";
import { authenticateAdmin } from "@/server/auth/access";
import { secureRandomUnit } from "@/server/secure-random";
import { pickDynamicPrize } from "@/server/dynamic-prize-selection";

type PrizeRow = {
  id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  amount: string;
  currency: string | null;
  quantity_remaining: number;
  quantity_total: number;
  metadata: Record<string, unknown> | null;
};

export const Route = createFileRoute("/api/dev/paid-spin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as { initData?: unknown };
          const initData = typeof body.initData === "string" ? body.initData.trim() : "";
          await authenticateAdmin(initData);

          const season = await query<{ id: string; code: string; state: string }>(
            `SELECT id::text,code,state
               FROM seasons
              WHERE state IN ('ACTIVE','ENDING')
              ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END,created_at DESC
              LIMIT 1`,
          );
          const current = season.rows[0];
          if (!current) throw new Error("SEASON_NOT_ACTIVE");

          const prizes = await query<PrizeRow>(
            `SELECT id::text,kind,title,subtitle,amount::text,currency,quantity_remaining,quantity_total,metadata
               FROM prizes
              WHERE season_id=$1::uuid
                AND quantity_remaining>0
                AND is_active=TRUE
              ORDER BY created_at ASC`,
            [current.id],
          );
          if (!prizes.rows.length) throw new Error("NO_PRIZES");

          const selection = pickDynamicPrize(prizes.rows, secureRandomUnit, {});
          const picked = selection.prize;

          return Response.json({
            ok: true,
            test: true,
            season: { id: current.id, code: current.code, state: current.state },
            reward: {
              id: picked.id,
              kind: picked.kind,
              title: picked.title,
              subtitle: picked.subtitle,
              amount: Number(picked.amount) || undefined,
              wonAt: new Date().toISOString(),
              status: picked.kind === "EMPTY" ? "RECEIVED" : "PENDING",
            },
            diagnostics: selection.diagnostics[picked.id],
          });
        } catch (error) {
          const code = error instanceof Error ? error.message : "DEV_PAID_SPIN_FAILED";
          return Response.json({ ok: false, code }, { status: code === "NO_PRIZES" ? 409 : 400 });
        }
      },
    },
  },
});
