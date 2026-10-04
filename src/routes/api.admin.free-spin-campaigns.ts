import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";
import { grantFreeSpinCampaignToCurrentParticipants } from "@/server/free-spin-campaigns";

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
        const body=await request.json() as {initData?:unknown;seasonId?:unknown;name?:unknown;spinsPerUser?:unknown};
        const admin=await authenticateAdmin(typeof body.initData==="string"?body.initData:"");
        const seasonId=String(body.seasonId??"").trim();
        const name=String(body.name??"").trim();
        const spinsPerUser=Number(body.spinsPerUser??1);
        if(!seasonId||!name||name.length>120||!Number.isSafeInteger(spinsPerUser)||spinsPerUser<1||spinsPerUser>20) return Response.json({ok:false,code:"INVALID_CAMPAIGN"},{status:400});
        const season=await query("SELECT id::text,starts_at::text,ends_at::text,state FROM seasons WHERE id=$1::uuid",[seasonId]);
        const s=season.rows[0] as {id:string;starts_at:string|null;ends_at:string|null;state:string}|undefined;
        if(!s) return Response.json({ok:false,code:"SEASON_NOT_FOUND"},{status:404});
        if(!["ACTIVE","ENDING"].includes(s.state)) return Response.json({ok:false,code:"SEASON_NOT_ACTIVE"},{status:409});
        const id=await withTransaction(async(client)=>{
          const startsAt=new Date();
          const endsAt=s.ends_at ? new Date(s.ends_at) : new Date(startsAt.getTime()+30*86400000);
          const row=await client.query("INSERT INTO free_spin_campaigns(season_id,name,starts_at,ends_at,spins_per_user,enabled,created_by) VALUES($1::uuid,$2,$3,$4,$5,TRUE,$6::uuid) RETURNING id::text",[seasonId,name,startsAt.toISOString(),endsAt.toISOString(),spinsPerUser,admin.id]);
          const grantedUsers=await grantFreeSpinCampaignToCurrentParticipants(client,row.rows[0].id,seasonId);
          await client.query("INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'FREE_SPIN_CAMPAIGN_CREATED','free_spin_campaign',$2,$3::jsonb)",[admin.id,row.rows[0].id,JSON.stringify({seasonId,name,spinsPerUser,grantedUsers})]);
          return {id:row.rows[0].id,grantedUsers};
        });
        return Response.json({ok:true,id:result.id,grantedUsers:result.grantedUsers});
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

        const result=await withTransaction(async(client)=>{
          const campaign=await client.query<{season_id:string;state:string;ends_at:string|null}>(
            `SELECT c.season_id::text,s.state,s.ends_at::text
               FROM free_spin_campaigns c
               JOIN seasons s ON s.id=c.season_id
              WHERE c.id=$1::uuid
              FOR UPDATE`,
            [id],
          );
          if(!campaign.rows[0]) throw new Error("CAMPAIGN_NOT_FOUND");

          let grantedUsers=0;
          if(body.enabled && ["ACTIVE","ENDING"].includes(campaign.rows[0].state)) {
            const now=new Date();
            const endsAt=campaign.rows[0].ends_at ? new Date(campaign.rows[0].ends_at) : new Date(now.getTime()+30*86400000);
            await client.query(
              "UPDATE free_spin_campaigns SET enabled=TRUE,starts_at=$2,ends_at=$3,updated_at=now() WHERE id=$1::uuid",
              [id,now.toISOString(),endsAt.toISOString()],
            );
            grantedUsers=await grantFreeSpinCampaignToCurrentParticipants(client,id,campaign.rows[0].season_id);
          } else {
            await client.query(
              "UPDATE free_spin_campaigns SET enabled=$2,updated_at=now() WHERE id=$1::uuid",
              [id,body.enabled],
            );
          }

          await client.query(
            "INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'FREE_SPIN_CAMPAIGN_TOGGLED','free_spin_campaign',$2,$3::jsonb)",
            [admin.id,id,JSON.stringify({enabled:body.enabled,grantedUsers})],
          );
          return {enabled:Boolean(body.enabled),grantedUsers};
        });

        return Response.json({ok:true,enabled:result.enabled,grantedUsers:result.grantedUsers});
      } catch(error) {
        const code=error instanceof Error?error.message:"CAMPAIGN_UPDATE_FAILED";
        return Response.json({ok:false,code},{status:code==="CAMPAIGN_NOT_FOUND"?404:409});
      }
    },
  }},
});
