import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { query } from "@/server/db";
import { buildEconomyMetrics, getEconomyMultiplier } from "@/server/season-economy";

export const Route = createFileRoute("/api/admin/economy")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
        const seasonId = new URL(request.url).searchParams.get("seasonId") ?? "";
        if (!seasonId) return Response.json({ ok:false, code:"INVALID_SEASON" }, { status:400 });
        const seasonResult = await query<{ id:string; code:string; name:string; state:string; starts_at:string|null; ends_at:string|null; paid_spin_price:number; paid_spin_enabled:boolean; daily_free_spin:boolean }>(`SELECT id::text,code,name,state,starts_at::text,ends_at::text,paid_spin_price,paid_spin_enabled,daily_free_spin FROM seasons WHERE id=$1::uuid`, [seasonId]);
        const season = seasonResult.rows[0];
        if (!season) return Response.json({ ok:false, code:"SEASON_NOT_FOUND" }, { status:404 });
        const counts = await query<{hour:string;day:string;week:string;season:string}>(`SELECT COUNT(*) FILTER (WHERE created_at>=now()-interval '1 hour')::text AS hour,COUNT(*) FILTER (WHERE created_at>=now()-interval '1 day')::text AS day,COUNT(*) FILTER (WHERE created_at>=now()-interval '7 days')::text AS week,COUNT(*)::text AS season FROM spins WHERE season_id=$1::uuid AND status='COMPLETED'`, [seasonId]);
        const row=counts.rows[0];
        const spins={hour:Number(row?.hour??0),day:Number(row?.day??0),week:Number(row?.week??0),season:Number(row?.season??0)};
        const metrics=buildEconomyMetrics({startsAt:season.starts_at,endsAt:season.ends_at,spins});
        const prizes=await query<{id:string;kind:string;title:string;quantity_total:number;quantity_remaining:number;amount:string;unit_cost:string;currency:string|null;metadata:Record<string,unknown>|null}>(`SELECT id::text,kind,title,quantity_total,quantity_remaining,amount::text,unit_cost::text,currency,metadata FROM prizes WHERE season_id=$1::uuid ORDER BY created_at ASC`,[seasonId]);
        return Response.json({ok:true,season,spins,metrics,prizes:prizes.rows.map(prize=>({id:prize.id,kind:prize.kind,title:prize.title,quantityTotal:prize.quantity_total,quantityRemaining:prize.quantity_remaining,consumed:Math.max(0,prize.quantity_total-prize.quantity_remaining),amount:Number(prize.amount),unitCost:Number(prize.unit_cost),currency:prize.currency,active:true,multiplier:getEconomyMultiplier({quantityTotal:prize.quantity_total,quantityRemaining:prize.quantity_remaining,elapsedFraction:metrics.elapsedFraction}),weight:Number(prize.metadata?.weight??1)||1}))});
      } catch(error) {
        const code=error instanceof Error?error.message:"REQUEST_FAILED";
        return Response.json({ok:false,code},{status:code==="SEASON_NOT_FOUND"?404:401});
      }
    },
  }},
});
