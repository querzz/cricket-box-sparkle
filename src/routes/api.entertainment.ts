import { createFileRoute } from '@tanstack/react-router';
import type { PoolClient } from 'pg';
import { validateTelegramInitData } from '@/server/auth/telegram';
import { requireBotToken } from '@/server/config';
import { query, withTransaction } from '@/server/db';
import { appendStarsLedger, STARS_MAX_BALANCE } from '@/server/stars-ledger';
import { secureRandomUnit } from '@/server/secure-random';

type Reward={type:'STARS'|'FREE_SPIN'|'XP'|'NOTE';amount:number;title?:string};
function enabled(settings:unknown,type:string){const s=settings as {enabled?:Record<string,unknown>}|null;return s?.enabled?.[type.toLowerCase().replaceAll('_','-')]!==false;}
function targetLabel(row:{username:string|null;first_name:string;last_name:string|null}){return row.username?'@'+row.username.replace(/^@/,''):[row.first_name,row.last_name].filter(Boolean).join(' ');}

async function applyReward(client:PoolClient,userId:string,seasonId:string|null,reward:Reward,referenceId:string,source:string){
 if(reward.type==='NOTE')return {credited:0};
 const amount=Math.max(0,Math.floor(Number(reward.amount)||0));
 if(reward.type==='STARS'){
  const state=await client.query<{stars_balance:number}>('SELECT stars_balance FROM user_state WHERE user_id=$1::uuid FOR UPDATE',[userId]);
  const balance=Number(state.rows[0]?.stars_balance??0);const credited=Math.min(amount,Math.max(0,STARS_MAX_BALANCE-balance));
  await appendStarsLedger(client,{userId,type:'REWARD',amount,balanceDelta:credited,seasonId,referenceId,idempotencyKey:'entertainment-stars:'+referenceId,metadata:{source,requestedAmount:amount,creditedAmount:credited,overflowAmount:amount-credited}});
  if(amount>credited)await appendStarsLedger(client,{userId,type:'CAPPED_OVERFLOW_BURNED',amount:-(amount-credited),balanceDelta:0,seasonId,referenceId,idempotencyKey:'entertainment-stars-overflow:'+referenceId,metadata:{source,requestedAmount:amount,creditedAmount:credited,overflowAmount:amount-credited}});
  return {credited};
 }
 if(reward.type==='FREE_SPIN'){await client.query('INSERT INTO user_state(user_id,bonus_free_spins) VALUES($1::uuid,$2) ON CONFLICT(user_id) DO UPDATE SET bonus_free_spins=LEAST(1000,user_state.bonus_free_spins+$2),updated_at=now()',[userId,amount]);return {credited:amount};}
 if(reward.type==='XP'){const u=await client.query<{xp:number}>('SELECT xp FROM users WHERE id=$1::uuid FOR UPDATE',[userId]);const xp=Number(u.rows[0]?.xp??0)+amount;await client.query('UPDATE users SET xp=$2,level=$3,updated_at=now() WHERE id=$1::uuid',[userId,xp,Math.max(1,Math.floor(xp/100)+1)]);return {credited:amount};}
 return {credited:0};
}

export const Route=createFileRoute('/api/entertainment')({server:{handlers:{
GET:async({request})=>{
 try{
  const url=new URL(request.url);const v=await validateTelegramInitData((url.searchParams.get('initData')??'').trim(),requireBotToken());const tg=v.user;if(!tg?.id)throw new Error('TELEGRAM_USER_MISSING');
  const user=await query<{id:string;username:string|null;first_name:string;last_name:string|null}>('SELECT id::text,username,first_name,last_name FROM users WHERE telegram_id=$1',[tg.id]);if(!user.rows[0])throw new Error('USER_NOT_FOUND');
  const setting=await query<{value:unknown}>(`SELECT value FROM app_settings WHERE key='mechanics' LIMIT 1`);const settings=setting.rows[0]?.value as {enabled?:Record<string,boolean>}|undefined;
  const event=await query<{id:string;type:string;status:string;pass_remaining:number;payload:Record<string,unknown>;created_at:string;season_id:string|null}>(`SELECT id::text,type,status,pass_remaining,payload,created_at::text,season_id::text FROM entertainment_events WHERE user_id=$1::uuid AND status='OFFERED' ORDER BY created_at DESC LIMIT 1`,[user.rows[0].id]);
  const e=event.rows[0];if(!e||settings?.enabled?.[e.type.toLowerCase().replaceAll('_','-') ]===false)return Response.json({ok:true,event:null});
  return Response.json({ok:true,event:{id:e.id,type:e.type,passRemaining:Number(e.pass_remaining),payload:e.payload,createdAt:e.created_at,user:targetLabel(user.rows[0])}});
 }catch(error){const code=error instanceof Error?error.message:'ENTERTAINMENT_GET_FAILED';return Response.json({ok:false,code},{status:400});}
},
POST:async({request})=>{
 try{
  const body=await request.json() as {initData?:unknown;eventId?:unknown;action?:unknown;passToTelegramId?:unknown};const v=await validateTelegramInitData(typeof body.initData==='string'?body.initData:'',requireBotToken());const tg=v.user;if(!tg?.id)throw new Error('TELEGRAM_USER_MISSING');
  const action=String(body.action??'CLAIM');if(!['CLAIM','PASS'].includes(action))throw new Error('INVALID_EVENT_ACTION');
  const result=await withTransaction(async client=>{
   const user=await client.query<{id:string;username:string|null;first_name:string;last_name:string|null;xp:number}>('SELECT id::text,username,first_name,last_name,xp FROM users WHERE telegram_id=$1 AND is_test=FALSE FOR UPDATE',[tg.id]);if(!user.rows[0])throw new Error('USER_NOT_FOUND');
   const row=await client.query<{id:string;type:string;status:string;pass_remaining:number;payload:Record<string,unknown>;season_id:string|null}>('SELECT id::text,type,status,pass_remaining,payload,season_id::text FROM entertainment_events WHERE id=$1::uuid AND user_id=$2::uuid FOR UPDATE',[String(body.eventId??''),user.rows[0].id]);if(!row.rows[0])throw new Error('EVENT_NOT_FOUND');const event=row.rows[0];if(event.status!=='OFFERED')throw new Error('EVENT_ALREADY_USED');
   if(action==='PASS'){
    if(event.type!=='GIFT_OR_PASS')throw new Error('PASS_NOT_ALLOWED');if(Number(event.pass_remaining)<=0)throw new Error('PASS_LIMIT_REACHED');
    const toId=String(body.passToTelegramId??'').replace(/\D/g,'');if(!toId)throw new Error('PASS_TARGET_REQUIRED');
    const target=await client.query<{id:string;is_participant:boolean;username:string|null;first_name:string;last_name:string|null}>('SELECT u.id::text,us.is_participant,u.username,u.first_name,u.last_name FROM users u LEFT JOIN user_state us ON us.user_id=u.id WHERE u.telegram_id=$1 AND u.is_test=FALSE FOR UPDATE',[toId]);if(!target.rows[0]||target.rows[0].is_participant===false)throw new Error('PASS_TARGET_NOT_ELIGIBLE');
    const nextPass=Math.max(0,Number(event.pass_remaining)-1);
    const newEvent=await client.query<{id:string}>('INSERT INTO entertainment_events(season_id,created_by,user_id,type,status,pass_remaining,payload) SELECT season_id,created_by,$2::uuid,type,\'OFFERED\',$3,payload FROM entertainment_events WHERE id=$1::uuid RETURNING id::text',[event.id,target.rows[0].id,nextPass]);
    await client.query('UPDATE entertainment_events SET status=\'PASSED\',acted_at=now() WHERE id=$1::uuid',[event.id]);
    await client.query(`INSERT INTO audit_logs(action,entity_type,entity_id,after_data) VALUES('ENTERTAINMENT_EVENT_PASSED','user',$1,$2::jsonb)`,[user.rows[0].id,JSON.stringify({eventId:event.id,toUserId:target.rows[0].id,newEventId:newEvent.rows[0].id,passRemaining:nextPass})]);
    return {action:'PASS',target:targetLabel(target.rows[0]),newEventId:newEvent.rows[0].id};
   }
   const payload=event.payload??{};let reward:Reward={type:'NOTE',amount:0};let title=String(payload.title??'Развлекательное событие');let resultTitle=title;
   if(event.type==='GOOD_OR_BAD'){
    const good=(payload.good??{type:'STARS',amount:5,title:'Хороший подарок'}) as Reward;const bad=(payload.bad??{type:'NOTE',amount:0,title:'Неудачный подарок'}) as Reward;reward=secureRandomUnit()<0.5?good:bad;resultTitle=reward.title??title;
   }else{reward=(payload.reward??{type:'NOTE',amount:0}) as Reward;}
   const applied=await applyReward(client,user.rows[0].id,event.season_id,reward,event.id,'ENTERTAINMENT_'+event.type);
   await client.query("UPDATE entertainment_events SET status='CLAIMED',acted_at=now(),payload=jsonb_set(payload,'{result}',$2::jsonb,true) WHERE id=$1::uuid",[event.id,JSON.stringify({type:reward.type,amount:reward.amount,title:resultTitle,credited:applied.credited})]);
   await client.query(`INSERT INTO audit_logs(action,entity_type,entity_id,after_data) VALUES('ENTERTAINMENT_EVENT_CLAIMED','user',$1,$2::jsonb)`,[user.rows[0].id,JSON.stringify({eventId:event.id,eventType:event.type,rewardType:reward.type,amount:reward.amount,title:resultTitle,credited:applied.credited})]);
   return {action:'CLAIM',eventType:event.type,title:resultTitle,rewardType:reward.type,amount:Number(reward.amount??0),credited:Number(applied.credited??0)};
  });
  return Response.json({ok:true,...result});
 }catch(error){const code=error instanceof Error?error.message:'ENTERTAINMENT_ACTION_FAILED';const status=['EVENT_NOT_FOUND'].includes(code)?404:['EVENT_ALREADY_USED','PASS_LIMIT_REACHED','PASS_NOT_ALLOWED','PASS_TARGET_REQUIRED','PASS_TARGET_NOT_ELIGIBLE'].includes(code)?409:400;return Response.json({ok:false,code},{status});}
}}}});