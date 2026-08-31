import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { listPrizes, upsertPrize } from "@/server/season-service";

export const Route = createFileRoute("/api/admin/prizes")({
  server: { handlers: {
    GET: async ({ request }) => {
      try { await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? ""); const seasonId = new URL(request.url).searchParams.get("seasonId"); if (!seasonId) return Response.json({ok:false,code:"INVALID_SEASON"},{status:400}); return Response.json({ok:true,prizes:await listPrizes(seasonId)}); }
      catch { return Response.json({ok:false,code:"AUTH_FAILED"},{status:401}); }
    },
    POST: async ({ request }) => {
      try {
        const body = await request.json() as {initData?:string; id?:string; seasonId?:string; kind?:string; title?:string; subtitle?:string|null; amount?:number; unitCost?:number; currency?:string|null; quantityTotal?:number; quantityRemaining?:number; metadata?:Record<string,unknown>};
        await authenticateAdmin(body.initData ?? "");
        if (!body.seasonId || !body.title) return Response.json({ok:false,code:"INVALID_INPUT"},{status:400});
        const prize = await upsertPrize({id:body.id,seasonId:body.seasonId,kind:body.kind ?? "CUSTOM",title:body.title,subtitle:body.subtitle,amount:Number(body.amount ?? 0),unitCost:Number(body.unitCost ?? 0),currency:body.currency,quantityTotal:Math.max(0,Number(body.quantityTotal ?? 0)),quantityRemaining:Math.max(0,Number(body.quantityRemaining ?? body.quantityTotal ?? 0)),metadata:body.metadata});
        return Response.json({ok:true,prize});
      } catch { return Response.json({ok:false,code:"REQUEST_FAILED"},{status:400}); }
    },
  }}
});
