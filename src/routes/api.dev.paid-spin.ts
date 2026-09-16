import { createFileRoute } from "@tanstack/react-router";
import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";
import { authenticateAdmin } from "@/server/auth/access";
import { secureRandomUnit } from "@/server/secure-random";
import { pickDynamicPrize } from "@/server/dynamic-prize-selection";

type PrizeRow = { id:string; kind:string; title:string; subtitle:string|null; amount:string; currency:string|null; quantity_remaining:number; metadata:Record<string,unknown>|null; };

export const Route = createFileRoute("/api/dev/paid-spin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as { initData?: unknown };
          const initData = typeof body.initData === "string" ? body.initData.trim() : "";
          const admin = await authenticateAdmin(initData);
          const validated = await validateTelegramInitData(initData, requireBotToken());
          const telegramId = validated.user?.id;
          if (!telegramId) throw new Error("TELEGRAM_USER_MISSING");

          const result = await withTransaction(async (client) => {
            const user = await client.query<{id:string; xp:number}>(`SELECT id::text,xp FROM users WHERE telegram_id=$1 FOR UPDATE`, [telegramId]);
            if (!user.rows[0]) throw new Error("USER_NOT_FOUND");
            const season = await client.query<{id:string; code:string; state:string}>(`SELECT id::text,code,state FROM seasons WHERE state IN ('ACTIVE','ENDING') ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END,created_at DESC LIMIT 1 FOR UPDATE`);
            const current = season.rows[0];
            if (!current) throw new Error("SEASON_NOT_ACTIVE");
            const prizes = await client.query<PrizeRow>(`SELECT id::text,kind,title,subtitle,amount::text,currency,quantity_remaining,metadata FROM prizes WHERE season_id=$1::uuid AND quantity_remaining>0 AND is_active=TRUE ORDER BY created_at ASC FOR UPDATE`, [current.id]);
            if (!prizes.rows.length) throw new Error("NO_PRIZES");
            const selection = pickDynamicPrize(prizes.rows, secureRandomUnit, {});
            const picked = selection.prize;
            const updated = await client.query(`UPDATE prizes SET quantity_remaining=quantity_remaining-1,updated_at=now() WHERE id=$1::uuid AND quantity_remaining>0 RETURNING id`, [picked.id]);
            if (!updated.rows[0]) throw new Error("NO_PRIZES");
            const spin = await client.query<{id:string;created_at:string}>(`INSERT INTO spins (user_id,season_id,type,price_stars,prize_id,status,completed_at) VALUES ($1::uuid,$2::uuid,'PAID',0,$3::uuid,'COMPLETED',now()) RETURNING id::text,created_at::text`, [user.rows[0].id,current.id,picked.id]);
            const xp = Number(user.rows[0].xp ?? 0) + 10;
            await client.query(`UPDATE users SET xp=$2,level=$3,last_seen_at=now() WHERE id=$1::uuid`, [user.rows[0].id,xp,Math.max(1,Math.floor(xp/100)+1)]);
            let payoutId: string | null = null;
            if (picked.kind !== "EMPTY") {
              const payout = await client.query<{id:string}>(`INSERT INTO payouts (spin_id,user_id,prize_id,kind,amount,currency,status,note,paid_at) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::numeric,$6,'PENDING',$7,NULL) RETURNING id::text`, [spin.rows[0].id,user.rows[0].id,picked.id,picked.kind,picked.amount,picked.currency,"DEV manual fulfillment"]);
              payoutId = payout.rows[0].id;
            }
            await client.query(`INSERT INTO audit_logs (admin_id,action,entity_type,entity_id,after_data) VALUES ($1::uuid,'DEV_PAID_SPIN','spin',$2,$3::jsonb)`, [admin.id,spin.rows[0].id,JSON.stringify({userId:user.rows[0].id,seasonId:current.id,prizeId:picked.id,rewardKind:picked.kind,algorithmVersion:"finite-pool-v1",selection:selection.diagnostics[picked.id]})]);
            return {spin:spin.rows[0],payoutId,prize:picked};
          });
          return Response.json({ok:true,test:true,spin:{id:result.spin.id,type:"PAID",priceStars:0,status:"COMPLETED",createdAt:result.spin.created_at},reward:{id:result.payoutId??result.spin.id,kind:result.prize.kind,title:result.prize.title,subtitle:result.prize.subtitle,amount:Number(result.prize.amount)||undefined,wonAt:result.spin.created_at,status:result.prize.kind==="EMPTY"?"RECEIVED":"PENDING"}});
        } catch (error) {
          const code = error instanceof Error ? error.message : "DEV_PAID_SPIN_FAILED";
          return Response.json({ok:false,code},{status:code==="NO_PRIZES"?409:400});
        }
      },
    },
  },
});
