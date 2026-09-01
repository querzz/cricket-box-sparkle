import { createFileRoute } from "@tanstack/react-router";
import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";
import { authenticateAdmin } from "@/server/auth/access";

const MAX_STARS = 500;

type PrizeRow = { id:string; kind:string; title:string; subtitle:string|null; amount:string; currency:string|null; quantity_remaining:number; metadata:Record<string,unknown>|null };
function pickWeighted(prizes: PrizeRow[]) {
  const weighted = prizes.map((p) => ({ p, weight: Math.max(0.000001, Number(p.metadata?.weight ?? 1)) * p.quantity_remaining }));
  const total = weighted.reduce((s, x) => s + x.weight, 0);
  let cursor = Math.random() * total;
  for (const x of weighted) { cursor -= x.weight; if (cursor < 0) return x.p; }
  return weighted[weighted.length - 1]!.p;
}

export const Route = createFileRoute("/api/dev/paid-spin")({ server: { handlers: {
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
        const picked = pickWeighted(prizes.rows);
        const updated = await client.query(`UPDATE prizes SET quantity_remaining=quantity_remaining-1,updated_at=now() WHERE id=$1::uuid AND quantity_remaining>0 RETURNING id`, [picked.id]);
        if (!updated.rows[0]) throw new Error("NO_PRIZES");
        const spin = await client.query<{id:string;created_at:string}>(`INSERT INTO spins (user_id,season_id,type,price_stars,prize_id,status,completed_at) VALUES ($1::uuid,$2::uuid,'PAID',0,$3::uuid,'COMPLETED',now()) RETURNING id::text,created_at::text`, [user.rows[0].id,current.id,picked.id]);
        const xp = Number(user.rows[0].xp ?? 0) + 10;
        await client.query(`UPDATE users SET xp=$2,level=$3,last_seen_at=now() WHERE id=$1::uuid`, [user.rows[0].id,xp,Math.max(1,Math.floor(xp/100)+1)]);
        let payoutId: string | null = null;
        let credited = 0;
        if (picked.kind === "STARS") {
          const state = await client.query<{stars_balance:number}>(`SELECT stars_balance FROM user_state WHERE user_id=$1::uuid FOR UPDATE`, [user.rows[0].id]);
          const balance = Number(state.rows[0]?.stars_balance ?? 0);
          const amount = Math.max(0, Math.floor(Number(picked.amount) || 0));
          credited = Math.min(amount, Math.max(0, MAX_STARS - balance));
          if (credited > 0) await client.query(`UPDATE user_state SET stars_balance=stars_balance+$2,updated_at=now() WHERE user_id=$1::uuid`, [user.rows[0].id,credited]);
        }
        if (picked.kind !== "EMPTY") {
          const payout = await client.query<{id:string}>(`INSERT INTO payouts (spin_id,user_id,prize_id,kind,amount,currency,status,note,paid_at) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::numeric,$6,$7,$8,CASE WHEN $7='PAID' THEN now() ELSE NULL END) RETURNING id::text`, [spin.rows[0].id,user.rows[0].id,picked.id,picked.kind,picked.amount,picked.currency,picked.kind==='STARS'?'PAID':'PENDING',picked.kind==='STARS'?'DEV Stars reward':'DEV_PAID_SPIN']);
          payoutId = payout.rows[0].id;
        }
        await client.query(`INSERT INTO audit_logs (admin_id,action,entity_type,entity_id,after_data) VALUES ($1::uuid,'DEV_PAID_SPIN','spin',$2,$3::jsonb)`, [admin.id,spin.rows[0].id,JSON.stringify({userId:user.rows[0].id,seasonId:current.id,prizeId:picked.id,rewardKind:picked.kind,creditedStars:credited})]);
        return {spin:spin.rows[0],payoutId,prize:picked,credited};
      });
      return Response.json({ok:true,test:true,spin:{id:result.spin.id,type:"PAID",priceStars:0,status:"COMPLETED",createdAt:result.spin.created_at},reward:{id:result.payoutId??result.spin.id,kind:result.prize.kind,title:result.prize.title,subtitle:result.prize.subtitle,amount:Number(result.prize.amount)||undefined,wonAt:result.spin.created_at,status:result.prize.kind==="EMPTY"?"RECEIVED":result.prize.kind==="STARS"?"RECEIVED":"PENDING",creditedAmount:result.prize.kind==="STARS"?result.credited:undefined}});
    } catch (error) {
      const code = error instanceof Error ? error.message : "DEV_PAID_SPIN_FAILED";
      return Response.json({ok:false,code},{status:code==="NO_PRIZES"?409:400});
    }
  },
}});
