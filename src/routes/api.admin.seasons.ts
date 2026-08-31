import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { createSeason, listSeasons, updateSeason } from "@/server/season-service";

export const Route = createFileRoute("/api/admin/seasons")({
  server: { handlers: {
    GET: async ({ request }) => {
      try { await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? ""); return Response.json({ ok:true, seasons: await listSeasons() }); }
      catch { return Response.json({ok:false,code:"AUTH_FAILED"},{status:401}); }
    },
    POST: async ({ request }) => {
      try {
        const body = await request.json() as {initData?:string; code?:string; name?:string; paidSpinPrice?:number; dailyFreeSpin?:boolean};
        const actor = await authenticateAdmin(body.initData ?? "");
        const code = (body.code ?? "").trim(); const name = (body.name ?? code).trim();
        if (!code || !name) return Response.json({ok:false,code:"INVALID_INPUT"},{status:400});
        const season = await createSeason({code,name,paidSpinPrice:Math.max(1,Number(body.paidSpinPrice ?? 100)),dailyFreeSpin:body.dailyFreeSpin !== false,adminId:actor.id});
        return Response.json({ok:true,season});
      } catch { return Response.json({ok:false,code:"REQUEST_FAILED"},{status:400}); }
    },
    PATCH: async ({ request }) => {
      try {
        const body = await request.json() as {initData?:string; id?:string; code?:string; name?:string; state?:string; startsAt?:string|null; endsAt?:string|null; paidSpinPrice?:number; dailyFreeSpin?:boolean};
        await authenticateAdmin(body.initData ?? "");
        if (!body.id) return Response.json({ok:false,code:"INVALID_ID"},{status:400});
        const season = await updateSeason(body.id,{code:body.code,name:body.name,state: body.state as never,startsAt:body.startsAt ?? null,endsAt:body.endsAt ?? null,paidSpinPrice:body.paidSpinPrice,dailyFreeSpin:body.dailyFreeSpin});
        return Response.json({ok:true,season});
      } catch { return Response.json({ok:false,code:"REQUEST_FAILED"},{status:400}); }
    },
  }}
});
