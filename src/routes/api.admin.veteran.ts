import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";
import { getVeteranTier, VETERAN_RULES, type VeteranTier } from "@/server/veteran";

export const Route = createFileRoute("/api/admin/veteran")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
        const enabledResult = await query<{ enabled: boolean }>(`SELECT COALESCE((value->>'enabled')::boolean, TRUE) AS enabled FROM app_settings WHERE key='veteran_bonus'`);
        const enabled = enabledResult.rows[0]?.enabled !== false;
        const users = await query<{ id:string;telegram_id:string;username:string|null;first_name:string;last_name:string|null;seasons:string;spins:string;wins:string;tier:VeteranTier;bonus_issued:string;bonus_used:string }>(
          `WITH history AS (
             SELECT s.user_id,COUNT(DISTINCT s.season_id)::text AS seasons,COUNT(*)::text AS spins,
                    COUNT(*) FILTER (WHERE p.prize_id IS NOT NULL AND p.kind<>'EMPTY')::text AS wins
               FROM spins s
               LEFT JOIN payouts p ON p.spin_id=s.id AND p.prize_id IS NOT NULL
              WHERE s.status='COMPLETED'
              GROUP BY s.user_id
           )
           SELECT u.id::text,u.telegram_id::text,u.username,u.first_name,u.last_name,
                  COALESCE(h.seasons,'0') AS seasons,COALESCE(h.spins,'0') AS spins,COALESCE(h.wins,'0') AS wins,
                  CASE WHEN COALESCE(h.seasons::int,0)>=4 THEN 'ELITE'::text WHEN COALESCE(h.seasons::int,0)>=2 THEN 'VETERAN'::text ELSE 'ROOKIE'::text END AS tier,
                  COALESCE(us.veteran_bonus_spins_issued,0)::text AS bonus_issued,
                  COALESCE((SELECT COUNT(*) FROM spins vb WHERE vb.user_id=u.id AND vb.type='VETERAN_BONUS' AND vb.status='COMPLETED'),0)::text AS bonus_used
             FROM users u
             LEFT JOIN history h ON h.user_id=u.id
             LEFT JOIN user_state us ON us.user_id=u.id
            WHERE u.is_test=FALSE
            ORDER BY COALESCE(h.seasons::int,0) DESC,COALESCE(h.spins::int,0) DESC,u.created_at DESC
            LIMIT 500`,
        );
        return Response.json({
          ok:true,
          enabled,
          rules:(Object.keys(VETERAN_RULES) as VeteranTier[]).map((tier)=>({tier,label:VETERAN_RULES[tier].label,minSeasons:VETERAN_RULES[tier].minSeasons,bonusSpins:VETERAN_RULES[tier].bonusSpins,description:VETERAN_RULES[tier].description})),
          players:users.rows.map((row)=>({id:row.id,telegramId:row.telegram_id,username:row.username?`@${row.username.replace(/^@/,"")}`:"—",name:[row.first_name,row.last_name].filter(Boolean).join(" "),seasons:Number(row.seasons),spins:Number(row.spins),wins:Number(row.wins),tier:row.tier,bonusIssued:Number(row.bonus_issued),bonusUsed:Number(row.bonus_used),bonusRemaining:Math.max(0,Number(row.bonus_issued)-Number(row.bonus_used))})),
        });
      } catch {
        return Response.json({ok:false,code:"VETERAN_FAILED"},{status:401});
      }
    },
    PATCH: async ({ request }) => {
      try {
        const body = await request.json() as { initData?:unknown; enabled?:unknown };
        const admin = await authenticateAdmin(typeof body.initData === "string" ? body.initData : "");
        if (admin.role !== "OWNER") return Response.json({ok:false,code:"OWNER_ONLY"},{status:403});
        if (typeof body.enabled !== "boolean") return Response.json({ok:false,code:"INVALID_ENABLED"},{status:400});
        await withTransaction(async (client)=>{
          await client.query(`INSERT INTO app_settings(key,value) VALUES('veteran_bonus',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[JSON.stringify({enabled:body.enabled})]);
          await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'VETERAN_SYSTEM_UPDATED','setting','veteran_bonus',$2::jsonb)`,[admin.id,JSON.stringify({enabled:body.enabled})]);
        });
        return Response.json({ok:true,enabled:body.enabled});
      } catch (error) {
        const code=error instanceof Error?error.message:"VETERAN_UPDATE_FAILED";
        return Response.json({ok:false,code},{status:code==="OWNER_ONLY"?403:400});
      }
    },
  }},
});
