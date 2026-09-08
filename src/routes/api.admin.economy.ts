import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { query } from "@/server/db";
import { collectSeasonSpinMetrics } from "@/server/liveops";
import { getEconomyMultiplier, buildEconomyMetrics } from "@/server/season-economy";

export const Route = createFileRoute("/api/admin/economy")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
        const seasonId = new URL(request.url).searchParams.get("seasonId") ?? "";
        if (!seasonId) return Response.json({ ok: false, code: "INVALID_SEASON" }, { status: 400 });
        const season = await query<{ id:string; code:string; name:string; state:string; starts_at:string|null; ends_at:string|null; paid_spin_price:number; paid_spin_enabled:boolean; daily_free_spin:boolean }>(
          `SELECT id::text,code,name,state,starts_at::text,ends_at::text,paid_spin_price,paid_spin_enabled,daily_free_spin FROM seasons WHERE id=$1::uuid`, [seasonId]);
        if (!season.rows[0]) return Response.json({ ok:false, code:"SEASON_NOT_FOUND" }, { status:404 });
        const spins = await collectSeasonSpinMetrics({ query } as never, seasonId);
        const metrics = buildEconomyMetrics({ startsAt: season.rows[0].starts_at, endsAt: season.rows[0].ends_at, spins });
        const prizes = await query<{ id:string; kind:string; title:string; quantity_total:number; quantity_remaining:number; amount:string; unit_cost:string; currency:string|null; metadata:Record<string,unknown>|null }>(
          `SELECT id::text,kind,title,quantity_total,quantity_remaining,amount::text,unit_cost::text,currency,metadata FROM prizes WHERE season_id=$1::uuid ORDER BY created_at ASC`, [seasonId]);
        const prizeEconomy = prizes.rows.map((prize) => ({
          id: prize.id, kind: prize.kind, title: prize.title, quantityTotal: prize.quantity_total,
          quantityRemaining: prize.quantity_remaining, consumed: Math.max(0, prize.quantity_total - prize.quantity_remaining),
          amount: Number(prize.amount), unitCost: Number(prize.unit_cost), currency: prize.currency,
          multiplier: getEconomyMultiplier({ quantityTotal: prize.quantity_total, quantityRemaining: prize.quantity_remaining, elapsedFraction: metrics.elapsedFraction }),
          weight: Number(prize.metadata?.weight ?? 1) || 1,
        }));
        return Response.json({ ok:true, season:season.rows[0], spins, metrics, prizes:prizeEconomy });
      } catch (error) {
        const code = error instanceof Error ? error.message : "REQUEST_FAILED";
        return Response.json({ ok:false, code }, { status: code === "SEASON_NOT_FOUND" ? 404 : 401 });
      }
    },
  }},
});
