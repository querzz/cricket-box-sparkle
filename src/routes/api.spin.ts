import { createFileRoute } from "@tanstack/react-router";
import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { withTransaction } from "@/server/db";
import { activateDueDrops } from "@/server/liveops";
import { secureRandomUnit } from "@/server/secure-random";
import { appendStarsLedger } from "@/server/stars-ledger";
import { getTelegramChannelMembership } from "@/server/telegram-channel";
import { enforceRateLimit, RateLimitError } from "@/server/rate-limit";
import { seasonElapsedFraction } from "@/server/season-economy";
import { pickDynamicPrize } from "@/server/dynamic-prize-selection";

const MAX_STARS = 500;
type PrizeKind = "STARS" | "PREMIUM" | "MONEY" | "NFT" | "PHYSICAL" | "CUSTOM" | "FREE_SPIN" | "EMPTY";
type Body = { initData?: unknown; paid?: unknown; idempotencyKey?: unknown };
type Prize = { id:string; kind:PrizeKind; title:string; subtitle:string|null; amount:string; currency:string|null; quantity_total:number; quantity_remaining:number; metadata:Record<string,unknown>|null };

const rewardResponse = (result:{spinId:string;payoutId:string|null;createdAt:string;prize:Prize;credited:number;rewardStars:number;spinType:string;duplicate:boolean}) => {
  const prize=result.prize;
  return { ok:true, duplicate:result.duplicate,
    spin:{id:result.spinId,type:result.spinType,priceStars:0,status:"COMPLETED",createdAt:result.createdAt},
    reward:{id:result.payoutId??result.spinId,kind:prize.kind,title:prize.title,subtitle:prize.subtitle,amount:Number(prize.amount)||undefined,wonAt:result.createdAt,status:prize.kind==="EMPTY"||prize.kind==="STARS"?"RECEIVED":"PENDING",
      payoutNote:prize.kind==="EMPTY"?"В этот раз без награды.":prize.kind==="STARS"?(result.credited<result.rewardStars?`Лимит 500 Stars: зачислено ${result.credited} из ${result.rewardStars}.`:"Stars зачислены на баланс."):"Награда записана и ожидает выдачи.",
      creditedAmount:prize.kind==="STARS"?result.credited:undefined,uncreditedAmount:prize.kind==="STARS"?Math.max(0,result.rewardStars-result.credited):0}};
};

export const Route=createFileRoute("/api/spin")({server:{handlers:{POST:async({request})=>{
  try{
    const body=await request.json() as Body;
    const initData=typeof body.initData==="string"?body.initData.trim():"";
    const paid=body.paid===true;
    if(!initData)return Response.json({ok:false,code:"INIT_DATA_MISSING"},{status:400});
    if(paid)return Response.json({ok:false,code:"PAYMENT_REQUIRED"},{status:402});
    const suppliedKey=typeof body.idempotencyKey==="string"?body.idempotencyKey.trim():"";
    const idempotencyKey=suppliedKey||crypto.randomUUID().replaceAll("-","");
    if(idempotencyKey.length>100||!/^[A-Za-z0-9:_-]+$/.test(idempotencyKey))return Response.json({ok:false,code:"INVALID_IDEMPOTENCY_KEY"},{status:400});

    const validated=await validateTelegramInitData(initData,requireBotToken());
    const telegramId=validated.user?.id;
    if(!telegramId)return Response.json({ok:false,code:"TELEGRAM_USER_MISSING"},{status:400});
    await enforceRateLimit(`spin:${telegramId}`,10);
    const membership=await getTelegramChannelMembership(telegramId);

    const result=await withTransaction(async client=>{
      const userResult=await client.query<{id:string;xp:number}>(`SELECT id::text,xp FROM users WHERE telegram_id=$1 LIMIT 1 FOR UPDATE`,[telegramId]);
      if(!userResult.rows[0])throw new Error("USER_NOT_FOUND");
      const user=userResult.rows[0];
      const existing=await client.query<{id:string;created_at:string;type:string;kind:PrizeKind;title:string;subtitle:string|null;amount:string;currency:string|null;payout_id:string|null;reward_stars:string;credited_stars:string}>(
        `SELECT s.id::text,s.created_at::text,s.type,p.kind,p.title,p.subtitle,p.amount::text,p.currency,py.id::text AS payout_id,
                COALESCE((SELECT SUM(CASE WHEN sl.type='REWARD' THEN COALESCE((sl.metadata->>'requestedAmount')::integer,sl.amount) ELSE 0 END) FROM stars_ledger sl WHERE sl.spin_id=s.id),0)::text AS reward_stars,
                COALESCE((SELECT SUM(CASE WHEN sl.type='REWARD' THEN COALESCE((sl.metadata->>'creditedAmount')::integer,sl.amount) ELSE 0 END) FROM stars_ledger sl WHERE sl.spin_id=s.id),0)::text AS credited_stars
           FROM spins s JOIN prizes p ON p.id=s.prize_id LEFT JOIN payouts py ON py.spin_id=s.id
          WHERE s.user_id=$1::uuid AND s.idempotency_key=$2 AND s.status='COMPLETED' ORDER BY s.created_at DESC LIMIT 1`,[user.id,idempotencyKey]);
      if(existing.rows[0]){
        const row=existing.rows[0];
        const prize={id:row.id,kind:row.kind,title:row.title,subtitle:row.subtitle,amount:row.amount,currency:row.currency,metadata:{},quantity_total:1,quantity_remaining:0};
        return {spinId:row.id,payoutId:row.payout_id,createdAt:row.created_at,prize,credited:Number(row.credited_stars)||0,rewardStars:Number(row.reward_stars)||0,spinType:row.type,duplicate:true};
      }
      await client.query(`INSERT INTO user_state(user_id,stars_balance,is_subscribed,is_participant,bonus_free_spins) VALUES($1::uuid,125,TRUE,TRUE,0) ON CONFLICT(user_id) DO NOTHING`,[user.id]);
      const stateResult=await client.query<{is_subscribed:boolean;is_participant:boolean;stars_balance:number;bonus_free_spins:number;activity_bonus_season_id:string|null;activity_bonus_spins_issued:number}>(`SELECT is_subscribed,is_participant,stars_balance,bonus_free_spins,activity_bonus_season_id::text,activity_bonus_spins_issued FROM user_state WHERE user_id=$1::uuid FOR UPDATE`,[user.id]);
      const state=stateResult.rows[0];
      const subscribed=membership??state?.is_subscribed??false;
      if(membership!==null&&membership!==state?.is_subscribed)await client.query(`UPDATE user_state SET is_subscribed=$2,updated_at=now() WHERE user_id=$1::uuid`,[user.id,membership]);
      if(!state||!subscribed)throw new Error("NOT_SUBSCRIBED");
      if(!state.is_participant)throw new Error("NOT_PARTICIPANT");
      const seasonResult=await client.query<{id:string;code:string;state:string;daily_free_spin:boolean;paid_spin_price:number;starts_at:string|null;ends_at:string|null}>(`SELECT id::text,code,state,daily_free_spin,paid_spin_price,starts_at::text,ends_at::text FROM seasons WHERE state IN ('ACTIVE','ENDING') ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END,created_at DESC LIMIT 1 FOR UPDATE`);
      const season=seasonResult.rows[0];
      if(!season)throw new Error("SEASON_NOT_ACTIVE");
      await activateDueDrops(client,season.id);
      const activityUsedResult=await client.query<{used:string}>(`SELECT COUNT(*)::text AS used FROM spins WHERE user_id=$1::uuid AND season_id=$2::uuid AND type='ACTIVITY_BONUS' AND status='COMPLETED'`,[user.id,season.id]);
      const activityIssued=season.id===state.activity_bonus_season_id?Number(state.activity_bonus_spins_issued??0):0;
      const activityRemaining=Math.max(0,activityIssued-Number(activityUsedResult.rows[0]?.used??0));
      const alreadyFree=await client.query<{exists:boolean}>(`SELECT EXISTS(SELECT 1 FROM spins WHERE user_id=$1::uuid AND season_id=$2::uuid AND type='FREE' AND status='COMPLETED' AND created_at>=date_trunc('day',now())) AS exists`,[user.id,season.id]);
      const useDaily=Boolean(season.daily_free_spin&&!alreadyFree.rows[0]?.exists);
      const useActivity=!useDaily&&activityRemaining>0;
      const useGift=!useDaily&&!useActivity&&Number(state.bonus_free_spins??0)>0;
      if(!useDaily&&!useActivity&&!useGift)throw new Error("NO_ATTEMPTS");

      const recent=await client.query<{kind:PrizeKind}>(`SELECT p.kind FROM spins s JOIN prizes p ON p.id=s.prize_id WHERE s.user_id=$1::uuid AND s.season_id=$2::uuid AND s.status='COMPLETED' ORDER BY s.created_at DESC LIMIT 30`,[user.id,season.id]);
      const recentKinds=recent.rows.map(row=>row.kind);
      let emptyStreak=0;
      for(const kind of recentKinds){if(kind!=="EMPTY")break;emptyStreak+=1;}
      const elapsedFraction=seasonElapsedFraction(season.starts_at,season.ends_at);

      const prizes=await client.query<Prize>(`SELECT id::text,kind,title,subtitle,amount::text,currency,quantity_total,quantity_remaining,metadata FROM prizes WHERE season_id=$1::uuid AND quantity_remaining>0 AND is_active=TRUE AND (kind<>'STARS' OR $2::integer<$3::integer) ORDER BY created_at ASC FOR UPDATE`,[season.id,Number(state.stars_balance??0),MAX_STARS]);
      if(!prizes.rows.length)throw new Error("NO_PRIZES");
      const selection=pickDynamicPrize(prizes.rows,secureRandomUnit,{elapsedFraction,emptyStreak,recentKinds});
      const picked=selection.prize;
      const inventory=await client.query(`UPDATE prizes SET quantity_remaining=quantity_remaining-1,updated_at=now() WHERE id=$1::uuid AND quantity_remaining>0 RETURNING id`,[picked.id]);
      if(!inventory.rows[0])throw new Error("NO_PRIZES");
      const spinType=useActivity?"ACTIVITY_BONUS":"FREE";
      const spin=await client.query<{id:string;created_at:string}>(`INSERT INTO spins(user_id,season_id,type,price_stars,prize_id,status,idempotency_key,completed_at) VALUES($1::uuid,$2::uuid,$3,0,$4::uuid,'COMPLETED',$5,now()) RETURNING id::text,created_at::text`,[user.id,season.id,spinType,picked.id,idempotencyKey]);
      if(useActivity||useGift)await client.query(`UPDATE user_state SET bonus_free_spins=GREATEST(0,bonus_free_spins-1),updated_at=now() WHERE user_id=$1::uuid`,[user.id]);
      const nextXp=Number(user.xp??0)+10; await client.query(`UPDATE users SET xp=$2,level=$3,last_seen_at=now() WHERE id=$1::uuid`,[user.id,nextXp,Math.max(1,Math.floor(nextXp/100)+1)]);
      const rewardStars=picked.kind==="STARS"?Math.max(0,Math.floor(Number(picked.amount)||0)):0;
      const credited=rewardStars>0?Math.min(rewardStars,Math.max(0,MAX_STARS-Number(state.stars_balance??0))):0;
      const overflow=Math.max(0,rewardStars-credited);
      if(rewardStars>0){
        await appendStarsLedger(client,{userId:user.id,seasonId:season.id,spinId:spin.rows[0].id,type:"REWARD",amount:rewardStars,balanceDelta:credited,referenceId:picked.id,idempotencyKey:`spin:${spin.rows[0].id}:stars-reward`,metadata:{requestedAmount:rewardStars,creditedAmount:credited,overflowAmount:overflow,source:spinType}});
        if(overflow>0)await appendStarsLedger(client,{userId:user.id,seasonId:season.id,spinId:spin.rows[0].id,type:"CAPPED_OVERFLOW_BURNED",amount:-overflow,balanceDelta:0,referenceId:picked.id,idempotencyKey:`spin:${spin.rows[0].id}:stars-overflow`,metadata:{requestedAmount:rewardStars,creditedAmount:credited,overflowAmount:overflow}});
      }
      let payoutId:string|null=null;
      if(picked.kind!=="EMPTY"){
        const payoutStatus=rewardStars>0?"PAID":"PENDING";
        const note=rewardStars>0?(credited<rewardStars?`Лимит 500 Stars: зачислено ${credited} из ${rewardStars}.`:"Stars зачислены на баланс."):"Приз ожидает выдачи администратором.";
        const payout=await client.query<{id:string}>(`INSERT INTO payouts(spin_id,user_id,prize_id,kind,amount,currency,status,note,paid_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::numeric,$6,$7,$8,CASE WHEN $7='PAID' THEN now() ELSE NULL END) RETURNING id::text`,[spin.rows[0].id,user.id,picked.id,picked.kind,picked.amount,picked.currency,payoutStatus,note]);
        payoutId=payout.rows[0].id;
      }
      await client.query(`INSERT INTO audit_logs(action,entity_type,entity_id,after_data) VALUES('SPIN_COMPLETED','spin',$1,$2::jsonb)`,[spin.rows[0].id,JSON.stringify({userId:user.id,seasonId:season.id,prizeId:picked.id,type:spinType,idempotencyKey,usedDaily:useDaily,usedActivityBonus:useActivity,usedGiftBonus:useGift,rewardKind:picked.kind,creditedStars:credited,overflowStars:overflow,algorithmVersion:"dynamic-v1",elapsedFraction,emptyStreak,recentKinds:recentKinds.slice(0,8),selection:selection.diagnostics[picked.id]})]);
      return {spinId:spin.rows[0].id,payoutId,createdAt:spin.rows[0].created_at,prize:picked,credited,rewardStars,spinType,duplicate:false};
    });
    return Response.json(rewardResponse(result));
  }catch(error){
    if(error instanceof RateLimitError)return Response.json({ok:false,code:"RATE_LIMITED"},{status:429,headers:{"Retry-After":String(error.retryAfterSeconds)}});
    const code=error instanceof Error?error.message:"SPIN_FAILED";
    const status=["NO_ATTEMPTS","NO_PRIZES","SEASON_NOT_ACTIVE"].includes(code)?409:["USER_NOT_FOUND","NOT_SUBSCRIBED","NOT_PARTICIPANT"].includes(code)?403:code==="PAYMENT_REQUIRED"?402:400;
    console.error("[CRICKET BOX] spin failed",{code});
    return Response.json({ok:false,code,detail:code},{status});
  }
}}}});
