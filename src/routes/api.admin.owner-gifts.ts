import { createFileRoute } from '@tanstack/react-router';
import { authenticateAdmin } from '@/server/auth/access';
import { query, withTransaction } from '@/server/db';
import { appendStarsLedger, STARS_MAX_BALANCE } from '@/server/stars-ledger';
type RewardType='STARS'|'FREE_SPIN'|'XP'|'NOTE';
type GiftStatus='Подготовлен'|'Выдан'|'Отменён';
type GiftRow={id:string;username:string;telegramId:string;userId:string;gift:string;status:GiftStatus;message:string;createdAt:string;issuedAt:string|null;rewardType:RewardType;amount:number;rewardApplied:boolean};

async function readGifts(){
 const r=await query<{id:string;username:string|null;telegram_id:string;user_id:string;title:string;status:string;message:string|null;created_at:string;claimed_at:string|null;rewards:Record<string,unknown>[]}>(
  `SELECT og.id::text, u.username, u.telegram_id::text, u.id::text AS user_id, og.title, og.status, og.message, og.created_at::text, og.claimed_at::text, COALESCE(og.rewards,'[]'::jsonb) AS rewards
     FROM owner_gifts og JOIN users u ON u.id=og.user_id
    WHERE u.is_test=FALSE ORDER BY og.created_at DESC LIMIT 500`);
 return r.rows.map(row=>{const reward=(row.rewards[0]??{}) as Record<string,unknown>;const type=String(reward.type??'NOTE') as RewardType;const amount=Number(reward.amount??0);const issued=['CLAIMED'].includes(row.status);return{id:row.id,username:row.username?'@'+row.username.replace(/^@/,''):'—',telegramId:row.telegram_id,userId:row.user_id,gift:row.title,status:row.status==='CLAIMED'?'Выдан':row.status==='CANCELLED'?'Отменён':'Подготовлен',message:row.message??'',createdAt:row.created_at,issuedAt:row.claimed_at,rewardType:type,amount,rewardApplied:issued};});
}
export const Route=createFileRoute('/api/admin/owner-gifts')({server:{handlers:{
GET:async({request})=>{try{await authenticateAdmin(new URL(request.url).searchParams.get('initData')??'');return Response.json({ok:true,gifts:await readGifts()});}catch(error){console.error('Owner gifts GET failed',error);return Response.json({ok:false,code:'OWNER_GIFTS_FAILED'},{status:500});}},
POST:async({request})=>{try{
 const body=await request.json() as {initData?:unknown;username?:unknown;telegramId?:unknown;gift?:unknown;message?:unknown;rewardType?:unknown;amount?:unknown};
 const admin=await authenticateAdmin(typeof body.initData==='string'?body.initData:'');
 const telegramId=String(body.telegramId??'').replace(/\D/g,'');const gift=String(body.gift??'').trim();const message=String(body.message??'').trim().slice(0,1000);
 const rewardType=String(body.rewardType??'NOTE') as RewardType;const amount=Math.floor(Number(body.amount??0));
 if(!telegramId||!gift)return Response.json({ok:false,code:'INVALID_INPUT'},{status:400});
 if(!['STARS','FREE_SPIN','XP','NOTE'].includes(rewardType))return Response.json({ok:false,code:'INVALID_REWARD_TYPE'},{status:400});
 const max=rewardType==='STARS'?STARS_MAX_BALANCE:rewardType==='FREE_SPIN'?20:10000;
 if(rewardType!=='NOTE'&&(!Number.isSafeInteger(amount)||amount<1||amount>max))return Response.json({ok:false,code:'INVALID_REWARD_AMOUNT'},{status:400});
 const result=await withTransaction(async client=>{
  const user=await client.query<{id:string;username:string|null}>(`SELECT id::text,username FROM users WHERE is_test=FALSE AND telegram_id=$1 FOR UPDATE`,[telegramId]);
  if(!user.rows[0])throw new Error('USER_NOT_FOUND');
  const reward=rewardType==='NOTE'?[]:[{type:rewardType,amount}];
  const row=await client.query<{id:string;created_at:string}>(`INSERT INTO owner_gifts(user_id,created_by,title,message,status,rewards) VALUES($1::uuid,$2::uuid,$3,$4,'SENT',$5::jsonb) RETURNING id::text,created_at::text`,[user.rows[0].id,admin.id,gift,message,JSON.stringify(reward)]);
  await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'OWNER_GIFT_CREATED','user',$2,$3::jsonb)`,[admin.id,user.rows[0].id,JSON.stringify({giftId:row.rows[0].id,telegramId,gift,rewardType,amount})]);
  return row.rows[0];
 });
 void sendTelegramNotification(telegramId, `🎁 Личный подарок от CRICKET BOX\n\n${gift}${message ? `\n${message}` : ""}\n\nОткрой CRICKET BOX, чтобы получить подарок.`);\n return Response.json({ok:true,gift:{id:result.id,username:body.username||'—',telegramId,gift,status:'Подготовлен',message,createdAt:result.created_at,issuedAt:null,rewardType,amount:rewardType==='NOTE'?0:amount,rewardApplied:false},gifts:await readGifts()});
}catch(error){const code=error instanceof Error?error.message:'OWNER_GIFT_CREATE_FAILED';return Response.json({ok:false,code},{status:code==='USER_NOT_FOUND'?404:400});}},
PATCH:async({request})=>{try{
 const body=await request.json() as {initData?:unknown;id?:unknown;status?:unknown};
 const admin=await authenticateAdmin(typeof body.initData==='string'?body.initData:'');const id=String(body.id??'');const status=String(body.status??'');
 if(!id||!['Выдан','Отменён','Подготовлен'].includes(status))return Response.json({ok:false,code:'INVALID_UPDATE'},{status:400});
 const result=await withTransaction(async client=>{
  const row=await client.query<{id:string;user_id:string;status:string;rewards:Record<string,unknown>[];claimed_at:string|null;title:string}>(`SELECT id::text,user_id::text,status,rewards,claimed_at::text,title FROM owner_gifts WHERE id=$1::uuid FOR UPDATE`,[id]);
  if(!row.rows[0])throw new Error('GIFT_NOT_FOUND');const current=row.rows[0];
  const dbStatus=status==='Выдан'?'CLAIMED':status==='Отменён'?'CANCELLED':'SENT';
  if(dbStatus==='CLAIMED'&&current.status!=='CLAIMED'){
   const reward=(current.rewards[0]??{}) as Record<string,unknown>;const type=String(reward.type??'NOTE') as RewardType;const value=Math.floor(Number(reward.amount??0));
   const user=await client.query<{id:string;xp:number}>(`SELECT id::text,xp FROM users WHERE id=$1::uuid FOR UPDATE`,[current.user_id]);if(!user.rows[0])throw new Error('USER_NOT_FOUND');
   if(type==='STARS'&&value>0){
    const state=await client.query<{stars_balance:number}>(`SELECT stars_balance FROM user_state WHERE user_id=$1::uuid FOR UPDATE`,[current.user_id]);const balance=Number(state.rows[0]?.stars_balance??0);const credited=Math.min(value,Math.max(0,STARS_MAX_BALANCE-balance));
    await appendStarsLedger(client,{userId:current.user_id,type:'ADMIN_CORRECTION',amount:value,balanceDelta:credited,seasonId:null,referenceId:id,idempotencyKey:'owner-gift:'+id,metadata:{source:'PERSONAL_GIFT',giftId:id,creditedAmount:credited,overflowAmount:value-credited}});
    if(value>credited)await appendStarsLedger(client,{userId:current.user_id,type:'CAPPED_OVERFLOW_BURNED',amount:-(value-credited),balanceDelta:0,referenceId:id,idempotencyKey:'owner-gift-overflow:'+id,metadata:{source:'PERSONAL_GIFT',giftId:id,creditedAmount:credited,overflowAmount:value-credited}});
   }else if(type==='FREE_SPIN'&&value>0)await client.query(`INSERT INTO user_state(user_id,bonus_free_spins) VALUES($1::uuid,$2) ON CONFLICT(user_id) DO UPDATE SET bonus_free_spins=LEAST(1000,user_state.bonus_free_spins+$2),updated_at=now()`,[current.user_id,value]);
   else if(type==='XP'&&value>0){const xp=Number(user.rows[0].xp??0)+value;await client.query(`UPDATE users SET xp=$2,level=$3,updated_at=now() WHERE id=$1::uuid`,[current.user_id,xp,Math.max(1,Math.floor(xp/100)+1)]);}
   await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'PERSONAL_GIFT_REWARD_APPLIED','user',$2,$3::jsonb)`,[admin.id,current.user_id,JSON.stringify({giftId:id,rewardType:type,amount:value})]);
  }
  await client.query(`UPDATE owner_gifts SET status=$2,claimed_at=CASE WHEN $2='CLAIMED' THEN COALESCE(claimed_at,now()) ELSE claimed_at END,updated_at=now() WHERE id=$1::uuid`,[id,dbStatus]);
 });
 return Response.json({ok:true,gifts:await readGifts()});
}catch(error){const code=error instanceof Error?error.message:'OWNER_GIFT_UPDATE_FAILED';return Response.json({ok:false,code},{status:code==='GIFT_NOT_FOUND'||code==='USER_NOT_FOUND'?404:400});}}
}}});