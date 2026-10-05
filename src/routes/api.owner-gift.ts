import { createFileRoute } from '@tanstack/react-router';
import { validateTelegramInitData } from '@/server/auth/telegram';
import { requireBotToken } from '@/server/config';
import { withTransaction } from '@/server/db';
import { appendStarsLedger, STARS_MAX_BALANCE } from '@/server/stars-ledger';

export const Route=createFileRoute('/api/owner-gift')({server:{handlers:{
GET:async({request})=>{
 try{
  const url=new URL(request.url);const v=await validateTelegramInitData((url.searchParams.get('initData')??'').trim(),requireBotToken());const tg=v.user;if(!tg?.id)throw new Error('TELEGRAM_USER_MISSING');
  const rows=await withTransaction(async client=>await client.query<{id:string;title:string;message:string|null;reward_type:string;amount:number;created_at:string}>(`SELECT og.id::text,og.title,og.message,COALESCE(og.rewards->0->>'type','NOTE') AS reward_type,COALESCE((og.rewards->0->>'amount')::int,0) AS amount,og.created_at::text FROM owner_gifts og JOIN users u ON u.id=og.user_id WHERE u.telegram_id=$1 AND og.status='SENT' ORDER BY og.created_at DESC LIMIT 1`,[tg.id]));
  return Response.json({ok:true,gift:rows.rows[0]?{id:rows.rows[0].id,title:rows.rows[0].title,message:rows.rows[0].message??undefined,rewardType:rows.rows[0].reward_type,amount:Number(rows.rows[0].amount??0),createdAt:rows.rows[0].created_at}:null});
 }catch(error){const code=error instanceof Error?error.message:'OWNER_GIFT_FAILED';return Response.json({ok:false,code},{status:400});}
},
POST:async({request})=>{
 try{
  const body=await request.json() as {initData?:unknown;id?:unknown};const v=await validateTelegramInitData(typeof body.initData==='string'?body.initData:'',requireBotToken());const tg=v.user;if(!tg?.id)throw new Error('TELEGRAM_USER_MISSING');
  const result=await withTransaction(async client=>{
   const row=await client.query<{id:string;user_id:string;title:string;message:string|null;reward_type:string;amount:number;status:string}>(`SELECT og.id::text,og.user_id::text,og.title,og.message,COALESCE(og.rewards->0->>'type','NOTE') AS reward_type,COALESCE((og.rewards->0->>'amount')::int,0) AS amount,og.status FROM owner_gifts og JOIN users u ON u.id=og.user_id WHERE u.telegram_id=$1 AND og.id=$2::uuid FOR UPDATE`,[tg.id,String(body.id??'')]);
   if(!row.rows[0])throw new Error('GIFT_NOT_FOUND');const gift=row.rows[0];if(gift.status==='CLAIMED')return{duplicate:true,amount:Number(gift.amount),rewardType:gift.reward_type};if(gift.status!=='SENT')throw new Error('GIFT_NOT_AVAILABLE');
   const type=gift.reward_type as 'STARS'|'FREE_SPIN'|'XP'|'NOTE';const amount=Math.max(0,Math.floor(Number(gift.amount)||0));
   const user=await client.query<{id:string;xp:number}>(`SELECT id::text,xp FROM users WHERE id=$1::uuid FOR UPDATE`,[gift.user_id]);if(!user.rows[0])throw new Error('USER_NOT_FOUND');
   let credited=amount;
   if(type==='STARS'&&amount>0){const st=await client.query<{stars_balance:number}>(`SELECT stars_balance FROM user_state WHERE user_id=$1::uuid FOR UPDATE`,[gift.user_id]);const balance=Number(st.rows[0]?.stars_balance??0);credited=Math.min(amount,Math.max(0,STARS_MAX_BALANCE-balance));await appendStarsLedger(client,{userId:gift.user_id,type:'ADMIN_CORRECTION',amount,balanceDelta:credited,referenceId:gift.id,idempotencyKey:'owner-gift-claim:'+gift.id,metadata:{source:'PERSONAL_GIFT',giftId:gift.id,creditedAmount:credited,overflowAmount:amount-credited}});if(amount>credited)await appendStarsLedger(client,{userId:gift.user_id,type:'CAPPED_OVERFLOW_BURNED',amount:-(amount-credited),balanceDelta:0,referenceId:gift.id,idempotencyKey:'owner-gift-claim-overflow:'+gift.id,metadata:{source:'PERSONAL_GIFT',creditedAmount:credited,overflowAmount:amount-credited}});}
   if(type==='FREE_SPIN'&&amount>0)await client.query(`INSERT INTO user_state(user_id,bonus_free_spins) VALUES($1::uuid,$2) ON CONFLICT(user_id) DO UPDATE SET bonus_free_spins=LEAST(1000,user_state.bonus_free_spins+$2),updated_at=now()`,[gift.user_id,amount]);
   if(type==='XP'&&amount>0){const xp=Number(user.rows[0].xp??0)+amount;await client.query(`UPDATE users SET xp=$2,level=$3,updated_at=now() WHERE id=$1::uuid`,[gift.user_id,xp,Math.max(1,Math.floor(xp/100)+1)]);}
   await client.query(`UPDATE owner_gifts SET status='CLAIMED',claimed_at=now(),updated_at=now() WHERE id=$1::uuid`,[gift.id]);
   await client.query(`INSERT INTO audit_logs(action,entity_type,entity_id,after_data) VALUES('OWNER_GIFT_CLAIMED','user',$1,$2::jsonb)`,[gift.user_id,JSON.stringify({giftId:gift.id,rewardType:type,amount,credited})]);
   return{duplicate:false,amount:credited,rewardType:type,title:gift.title};
  });
  return Response.json({ok:true,...result});
 }catch(error){const code=error instanceof Error?error.message:'OWNER_GIFT_CLAIM_FAILED';return Response.json({ok:false,code},{status:code==='GIFT_NOT_FOUND'?404:code==='GIFT_NOT_AVAILABLE'?409:400});}}}}});