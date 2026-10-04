import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";

function validDate(value: unknown) {
  const date = typeof value === "string" ? new Date(value) : new Date(NaN);
  return Number.isFinite(date.getTime()) ? date : null;
}

export const Route = createFileRoute("/api/admin/free-spin-campaigns")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
        const seasonId = new URL(request.url).searchParams.get("seasonId") ?? "";
        const result = seasonId
          ? await query("SELECT id::text,season_id::text,name,starts_at::text,ends_at::text,spins_per_user,enabled,created_at::text FROM free_spin_campaigns WHERE season_id=$1::uuid ORDER BY starts_at ASC", [seasonId])
          : await query("SELECT id::text,season_id::text,name,starts_at::text,ends_at::text,spins_per_user,enabled,created_at::text FROM free_spin_campaigns ORDER BY starts_at DESC LIMIT 100");
        return Response.json({ok:true,campaigns:result.rows});
      } catch {
        return Response.json({ok:false,code:"AUTH_FAILED"},{status:401});
      }
    },
    POST: async ({request}) => {
      try {
        const body=await request.json() as {initData?:unknown;seasonId?:unknown;name?:unknown;startsAt?:unknown;endsAt?:unknown;spinsPerUser?:unknown;enabled?:unknown};
        const admin=await authenticateAdmin(typeof body.initData==="string"?body.initData:"");
        const seasonId=String(body.seasonId??"").trim();
        const name=String(body.name??"").trim();
        const startsAt=validDate(body.startsAt);
        const endsAt=validDate(body.endsAt);
        const spinsPerUser=Number(body.spinsPerUser??1);
        const enabled=body.enabled!==false;
        if(!seasonId||!name||name.length>120||!startsAt||!endsAt||endsAt<=startsAt||!Number.isSafeInteger(spinsPerUser)||spinsPerUser<1||spinsPerUser>20) return Response.json({ok:false,code:"INVALID_CAMPAIGN"},{status:400});
        const season=await query("SELECT id::text,starts_at::text,ends_at::text,state FROM seasons WHERE id=$1::uuid",[seasonId]);
        const s=season.rows[0] as {id:string;starts_at:string|null;ends_at:string|null;state:string}|undefined;
        if(!s) return Response.json({ok:false,code:"SEASON_NOT_FOUND"},{status:404});
        if(!["DRAFT","SCHEDULED","ACTIVE","ENDING"].includes(s.state)) return Response.json({ok:false,code:"SEASON_NOT_EDITABLE"},{status:409});
        if(s.starts_at && startsAt < new Date(s.starts_at)) return Response.json({ok:false,code:"CAMPAIGN_OUTSIDE_SEASON"},{status:400});
        if(s.ends_at && endsAt > new Date(s.ends_at)) return Response.json({ok:false,code:"CAMPAIGN_OUTSIDE_SEASON"},{status:400});
        const id=await withTransaction(async(client)=>{
          const row=await client.query("INSERT INTO free_spin_campaigns(season_id,name,starts_at,ends_at,spins_per_user,enabled,created_by) VALUES($1::uuid,$2,$3,$4,$5,$6,$7::uuid) RETURNING id::text",[seasonId,name,startsAt.toISOString(),endsAt.toISOString(),spinsPerUser,enabled,admin.id]);
          await client.query("INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'FREE_SPIN_CAMPAIGN_CREATED','free_spin_campaign',$2,$3::jsonb)",[admin.id,row.rows[0].id,JSON.stringify({seasonId,name,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),spinsPerUser,enabled})]);
          return row.rows[0].id;
        });
        return Response.json({ok:true,id});
      } catch(error) {
        const code=error instanceof Error?error.message:"CAMPAIGN_CREATE_FAILED";
        return Response.json({ok:false,code},{status:code==="SEASON_NOT_FOUND"?404:409});
      }
    },
    PATCH: async ({request}) => {
      try {
        const body=await request.json() as {initData?:unknown;id?:unknown;enabled?:unknown};
        const admin=await authenticateAdmin(typeof body.initData==="string"?body.initData:"");
        const id=String(body.id??"").trim();
        if(!id||typeof body.enabled!=="boolean") return Response.json({ok:false,code:"INVALID_CAMPAIGN"},{status:400});
        await withTransaction(async(client)=>{
          const row=await client.query("SELECT id::text FROM free_spin_campaigns WHERE id=$1::uuid FOR UPDATE",[id]);
          if(!row.rows[0]) throw new Error("CAMPAIGN_NOT_FOUND");
          await client.query("UPDATE free_spin_campaigns SET enabled=$2,updated_at=now() WHERE id=$1::uuid",[id,body.enabled]);
          const initialGrantedUsers=body.enabled ? await (async()=> {
            const row=await client.query<{season_id:string}>(`SELECT season_id::text FROM free_spin_campaigns WHERE id=$1::uuid`,[id]);
            return row.rows[0] ? grantFreeSpinCampaignToCurrentParticipants(client,id,row.rows[0].season_id) : 0;
          })() : 0;
          await client.query("INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'FREE_SPIN_CAMPAIGN_TOGGLED','free_spin_campaign',$2,$3::jsonb)",[admin.id,id,JSON.stringify({enabled:body.enabled,initialGrantedUsers})]);
          return {enabled:body.enabled,initialGrantedUsers};
        });
        return Response.json({ok:true,enabled:result.enabled,initialGrantedUsers:result.initialGrantedUsers});
      } catch(error) {
        const code=error instanceof Error?error.message:"CAMPAIGN_UPDATE_FAILED";
        return Response.json({ok:false,code},{status:code==="CAMPAIGN_NOT_FOUND"?404:409});
      }
    },
  }},
});
