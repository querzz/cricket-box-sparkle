import { createFileRoute } from "@tanstack/react-router";

import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";
import { secureRandomUnit } from "@/server/secure-random";
import { STARS_MAX_BALANCE } from "@/server/stars-ledger";
import { activateDueDrops } from "@/server/liveops";
import { pickDynamicPrize } from "@/server/dynamic-prize-selection";

type Body = { payload?: unknown; telegramId?: unknown; chargeId?: unknown; currency?: unknown; totalAmount?: unknown };
type PrizeRow = { id:string; kind:"STARS"|"PREMIUM"|"MONEY"|"NFT"|"PHYSICAL"|"CUSTOM"|"FREE_SPIN"|"EMPTY"; title:string; subtitle:string|null; amount:string; currency:string|null; quantity_total:number; quantity_remaining:number; metadata:Record<string,unknown>|null };
const BOT_HEADER="x-cricket-bot-token";

type RefundContext = { userId:string; telegramId:number; chargeId:string; transactionId:string };

async function refundTelegramStars(telegramId:number, chargeId:string) {
  const response=await fetch(`https://api.telegram.org/bot${requireBotToken()}/refundStarPayment`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({user_id:telegramId,telegram_payment_charge_id:chargeId})});
  const data=await response.json() as {ok:boolean;description?:string};
  if(data.ok || data.description?.toUpperCase().includes("CHARGE_ALREADY_REFUNDED")) return true;
  throw new Error(`TELEGRAM_REFUND_FAILED:${data.description??"unknown"}`);
}

async function markPaymentRefunded(context:RefundContext, reason:string) {
  await withTransaction(async client=>{
    const row=await client.query<{status:string;user_id:string;amount:string}>(`SELECT status,user_id::text,amount::text FROM star_transactions WHERE id=$1::uuid FOR UPDATE`,[context.transactionId]);
    if(!row.rows[0]) throw new Error("PAYMENT_NOT_FOUND");
    if(row.rows[0].user_id!==context.userId) throw new Error("PAYMENT_USER_MISMATCH");
    if(row.rows[0].status==="SUCCESS") return;
    if(row.rows[0].status!=="PENDING") return;
    await client.query(`UPDATE star_transactions SET status='REFUNDED',processed_at=now(),payload=payload||$2::jsonb WHERE id=$1::uuid`,[context.transactionId,JSON.stringify({refundReason:reason,refundedTelegramId:context.telegramId,refundedChargeId:context.chargeId})]);
    await client.query(`INSERT INTO audit_logs(action,entity_type,entity_id,after_data) VALUES('PAID_SPIN_REFUNDED','star_transaction',$1,$2::jsonb)`,[context.transactionId,JSON.stringify({userId:context.userId,telegramId:context.telegramId,chargeId:context.chargeId,reason})]);
  });
}

export const Route=createFileRoute("/api/payment/complete")({server:{handlers:{POST:async({request})=>{
  const refundState:{current:RefundContext|null}={current:null};
  try{
    const token=request.headers.get(BOT_HEADER)??""; if(!token||token!==requireBotToken())return Response.json({ok:false,code:"UNAUTHORIZED"},{status:401});
    const body=await request.json() as Body; const payload=typeof body.payload==="string"?body.payload.trim():""; const chargeId=typeof body.chargeId==="string"?body.chargeId.trim():""; const currency=typeof body.currency==="string"?body.currency:""; const totalAmount=Number(body.totalAmount); const telegramId=Number(body.telegramId);
    if(!payload||!chargeId||currency!=="XTR"||!Number.isSafeInteger(totalAmount)||totalAmount<=0||!Number.isSafeInteger(telegramId))return Response.json({ok:false,code:"INVALID_PAYMENT"},{status:400});
    if(!payload.startsWith("paidspin:v1:"))return Response.json({ok:false,code:"INVALID_PAYLOAD"},{status:400}); const parts=payload.split(":"); const userId=parts[2]; const seasonId=parts[3]; if(!userId||!seasonId)return Response.json({ok:false,code:"INVALID_PAYLOAD"},{status:400});
    const result=await withTransaction(async client=>{
      const existing=await client.query<{status:string;spin_id:string|null;user_id:string|null;amount:string}>(`SELECT status,spin_id::text,user_id::text,amount::text FROM star_transactions WHERE telegram_charge_id=$1 LIMIT 1 FOR UPDATE`,[chargeId]);
      if(existing.rows[0]){const row=existing.rows[0]; if(row.user_id!==userId||Number(row.amount)!==totalAmount)throw new Error("PAYMENT_CHARGE_MISMATCH"); if(row.status==="SUCCESS")return{duplicate:true,spinId:row.spin_id,payoutId:null,reward:null}; if(row.status!=="PENDING")throw new Error("PAYMENT_NOT_PENDING");}
      const tx=await client.query<{id:string;amount:number;status:string;user_id:string;payload:Record<string,unknown>}>(`SELECT id::text,amount,status,user_id::text,payload FROM star_transactions WHERE payload->>'payload'=$1 ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`,[payload]);
      if(!tx.rows[0])throw new Error("PAYMENT_NOT_FOUND"); if(tx.rows[0].user_id!==userId)throw new Error("PAYMENT_USER_MISMATCH"); if(Number(tx.rows[0].amount)!==totalAmount||tx.rows[0].status!=="PENDING")throw new Error("PAYMENT_NOT_PENDING");
      const user=await client.query<{id:string;xp:number}>(`SELECT id::text,xp FROM users WHERE id=$1::uuid AND telegram_id=$2 FOR UPDATE`,[userId,telegramId]); if(!user.rows[0])throw new Error("USER_NOT_FOUND");
      refundState.current={userId,telegramId,chargeId,transactionId:tx.rows[0].id};
      await client.query(`INSERT INTO user_state(user_id) VALUES($1::uuid) ON CONFLICT(user_id) DO NOTHING`,[userId]); const stateResult=await client.query<{is_subscribed:boolean;is_participant:boolean;stars_balance:number}>(`SELECT is_subscribed,is_participant,stars_balance FROM user_state WHERE user_id=$1::uuid FOR UPDATE`,[userId]); const state=stateResult.rows[0]; if(!state?.is_subscribed)throw new Error("NOT_SUBSCRIBED"); if(!state.is_participant)throw new Error("NOT_PARTICIPANT");
      const seasonResult=await client.query<{state:string;starts_at:string|null;ends_at:string|null;paid_spin_enabled:boolean}>(`SELECT state,starts_at::text,ends_at::text,paid_spin_enabled FROM seasons WHERE id=$1::uuid FOR UPDATE`,[seasonId]); const season=seasonResult.rows[0]; if(!season||!["ACTIVE","ENDING"].includes(season.state))throw new Error("SEASON_NOT_ACTIVE"); if(!season.paid_spin_enabled)throw new Error("PAID_SPIN_DISABLED");
      await activateDueDrops(client,seasonId);
      const prizes=await client.query<PrizeRow>(`SELECT id::text,kind,title,subtitle,amount::text,currency,quantity_total,quantity_remaining,metadata FROM prizes WHERE season_id=$1::uuid AND quantity_remaining>0 AND is_active=TRUE ORDER BY created_at ASC FOR UPDATE`,[seasonId]); if(!prizes.rows.length)throw new Error("NO_PRIZES");
      const selection=pickDynamicPrize(prizes.rows,secureRandomUnit,{}); const picked=selection.prize; const inventory=await client.query(`UPDATE prizes SET quantity_remaining=quantity_remaining-1,updated_at=now() WHERE id=$1::uuid AND quantity_remaining>0 RETURNING id`,[picked.id]); if(!inventory.rows[0])throw new Error("NO_PRIZES");
      const spin=await client.query<{id:string;created_at:string}>(`INSERT INTO spins(user_id,season_id,type,price_stars,prize_id,status,telegram_payment_charge_id,completed_at) VALUES($1::uuid,$2::uuid,'PAID',$3,$4::uuid,'COMPLETED',$5,now()) RETURNING id::text,created_at::text`,[userId,seasonId,totalAmount,picked.id,chargeId]);
      let payoutId:string|null=null;
      if(picked.kind!=="EMPTY"){
        const payout=await client.query<{id:string}>(`INSERT INTO payouts(spin_id,user_id,prize_id,kind,amount,currency,status,note) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::numeric,$6,'PENDING',$7) RETURNING id::text`,[spin.rows[0].id,userId,picked.id,picked.kind,picked.amount,picked.currency,"Награда ожидает ручной выдачи администратором."]);
        payoutId=payout.rows[0].id;
      }
      const nextXp=Number(user.rows[0].xp??0)+10; await client.query(`UPDATE users SET xp=$2,level=$3,last_seen_at=now() WHERE id=$1::uuid`,[userId,nextXp,Math.max(1,Math.floor(nextXp/100)+1)]);
      await client.query(`UPDATE star_transactions SET status='SUCCESS',telegram_charge_id=$2,spin_id=$3::uuid,processed_at=now(),payload=payload||$4::jsonb WHERE id=$1::uuid`,[tx.rows[0].id,chargeId,spin.rows[0].id,JSON.stringify({telegramId,currency,totalAmount})]);
      await client.query(`INSERT INTO audit_logs(action,entity_type,entity_id,after_data) VALUES('PAID_SPIN_COMPLETED','spin',$1,$2::jsonb)`,[spin.rows[0].id,JSON.stringify({userId,seasonId,prizeId:picked.id,chargeId,totalAmount,payoutId,rewardKind:picked.kind,algorithmVersion:"finite-pool-v1",selection:selection.diagnostics[picked.id]})]);
      return{duplicate:false,spinId:spin.rows[0].id,payoutId,reward:{kind:picked.kind,title:picked.title,subtitle:picked.subtitle,amount:Number(picked.amount)||undefined,payoutStatus:picked.kind==="EMPTY"?null:"PENDING",manualFulfillment:picked.kind!=="EMPTY"}};
    }); return Response.json({ok:true,...result});
  }catch(error){
    const code=error instanceof Error?error.message:"PAYMENT_COMPLETE_FAILED";
    const context=refundState.current;
    if(context){
      try{ await refundTelegramStars(context.telegramId,context.chargeId); await markPaymentRefunded(context,code); return Response.json({ok:false,code:"PAYMENT_REFUNDED",reason:code},{status:409}); }
      catch(refundError){ const refundCode=refundError instanceof Error?refundError.message:"TELEGRAM_REFUND_FAILED"; console.error("[CRICKET BOX] paid spin refund failed",{code,refundCode,chargeId:context.chargeId}); return Response.json({ok:false,code:"PAYMENT_REFUND_PENDING"},{status:502}); }
    }
    const status=["PAYMENT_NOT_FOUND","PAYMENT_USER_MISMATCH","USER_NOT_FOUND"].includes(code)?404:["SEASON_NOT_ACTIVE","NO_PRIZES","PAYMENT_NOT_PENDING","PAID_SPIN_DISABLED"].includes(code)?409:400;
    return Response.json({ok:false,code},{status});
  }
}}}});
