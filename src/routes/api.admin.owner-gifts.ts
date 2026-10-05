import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";
import { appendStarsLedger, STARS_MAX_BALANCE } from "@/server/stars-ledger";

type RewardType = "STARS"|"FREE_SPIN"|"XP"|"NOTE";
type GiftRow = {
  id:string; username:string; telegramId:string; gift:string; status:"Подготовлен"|"Выдан"|"Ожидает";
  message:string; createdAt:string; issuedAt:string|null; rewardType?:RewardType; amount?:number; rewardApplied?:boolean;
};

async function readGifts(executor?:{query:(text:string,values?:unknown[])=>Promise<any>}){
  const db=executor??{query};
  const result=await db.query(`SELECT COALESCE(value,'[]'::jsonb) AS value FROM app_settings WHERE key='owner_gifts' LIMIT 1`);
  return (result.rows[0]?.value??[]) as GiftRow[];
}

export const Route=createFileRoute("/api/admin/owner-gifts")({server:{handlers:{
  GET:async({request})=>{
    try{await authenticateAdmin(new URL(request.url).searchParams.get("initData")??"");return Response.json({ok:true,gifts:await readGifts()});}
    catch{return Response.json({ok:false,code:"OWNER_GIFTS_FAILED"},{status:401});}
  },
  POST:async({request})=>{
    try{
      const body=await request.json() as {initData?:unknown;username?:unknown;telegramId?:unknown;gift?:unknown;message?:unknown;rewardType?:unknown;amount?:unknown};
      const admin=await authenticateAdmin(typeof body.initData==="string"?body.initData:"");
      const telegramId=String(body.telegramId??"").replace(/\D/g,"");
      const gift=String(body.gift??"").trim();
      const message=String(body.message??"").trim().slice(0,1000);
      const rewardType=(String(body.rewardType??"NOTE") as RewardType);
      const amount=Number(body.amount??0);
      if(!telegramId)return Response.json({ok:false,code:"INVALID_TELEGRAM_ID"},{status:400});
      if(!gift)return Response.json({ok:false,code:"INVALID_GIFT"},{status:400});
      if(!["STARS","FREE_SPIN","XP","NOTE"].includes(rewardType))return Response.json({ok:false,code:"INVALID_REWARD_TYPE"},{status:400});
      if(rewardType!=="NOTE"&&(!Number.isSafeInteger(amount)||amount<1||amount>(rewardType==="STARS"?STARS_MAX_BALANCE:rewardType==="FREE_SPIN"?20:10000)))return Response.json({ok:false,code:"INVALID_REWARD_AMOUNT"},{status:400});
      const user=await query<{id:string;username:string|null}>(`SELECT id::text,username FROM users WHERE is_test=FALSE AND telegram_id=$1 LIMIT 1`,[telegramId]);
      if(!user.rows[0])return Response.json({ok:false,code:"USER_NOT_FOUND"},{status:404});
      const row:GiftRow={id:"og_"+Date.now()+"_"+Math.random().toString(36).slice(2,8),username:String(body.username??"").trim()||user.rows[0].username?("@"+(user.rows[0].username??"")).replace(/^@@/,"@"):"—",telegramId,gift,status:"Подготовлен",message,createdAt:new Date().toISOString(),issuedAt:null,rewardType,amount:rewardType==="NOTE"?0:amount,rewardApplied:false};
      const gifts=await readGifts();gifts.unshift(row);
      await query(`INSERT INTO app_settings(key,value) VALUES('owner_gifts',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[JSON.stringify(gifts.slice(0,500))]);
      await query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'OWNER_GIFT_CREATED','setting','owner_gifts',$2::jsonb)`,[admin.id,JSON.stringify({giftId:row.id,userId:user.rows[0].id,telegramId,gift,rewardType,amount:row.amount})]);
      return Response.json({ok:true,gift:row,gifts});
    }catch(error){return Response.json({ok:false,code:error instanceof Error?error.message:"OWNER_GIFT_CREATE_FAILED"},{status:400});}
  },
  PATCH:async({request})=>{
    try{
      const body=await request.json() as {initData?:unknown;id?:unknown;status?:unknown};
      const admin=await authenticateAdmin(typeof body.initData==="string"?body.initData:"");
      const id=String(body.id??"");
      const status=body.status==="Выдан"?"Выдан":body.status==="Ожидает"?"Ожидает":body.status==="Подготовлен"?"Подготовлен":null;
      if(!id||!status)return Response.json({ok:false,code:"INVALID_UPDATE"},{status:400});
      const result=await withTransaction(async client=>{
        const setting=await client.query<{value:GiftRow[]}>(`SELECT COALESCE(value,'[]'::jsonb) AS value FROM app_settings WHERE key='owner_gifts' LIMIT 1 FOR UPDATE`);
        const gifts=(setting.rows[0]?.value??[]) as GiftRow[];
        const index=gifts.findIndex(gift=>gift.id===id);
        if(index<0)throw new Error("GIFT_NOT_FOUND");
        const current=gifts[index];
        let applied=Boolean(current.rewardApplied);
        let issuedAt=current.issuedAt??null;
        if(status==="Выдан"&&!applied&&(current.rewardType??"NOTE")!=="NOTE"){
          const user=await client.query<{id:string;xp:number}>(`SELECT id::text,xp FROM users WHERE is_test=FALSE AND telegram_id=$1 FOR UPDATE`,[current.telegramId]);
          if(!user.rows[0])throw new Error("USER_NOT_FOUND");
          const type=current.rewardType??"NOTE";const amount=Math.max(0,Math.floor(Number(current.amount??0)));
          if(type==="STARS"){
            await appendStarsLedger(client,{userId:user.rows[0].id,type:"ADMIN_CORRECTION",amount,balanceDelta:amount,idempotencyKey:"owner-gift:"+id,referenceId:admin.id,metadata:{source:"PERSONAL_GIFT",giftId:id,reason:current.gift}});
          }else if(type==="FREE_SPIN"){
            const state=await client.query<{bonus_free_spins:number}>(`SELECT bonus_free_spins FROM user_state WHERE user_id=$1::uuid FOR UPDATE`,[user.rows[0].id]);
            const currentBonus=Number(state.rows[0]?.bonus_free_spins??0);if(currentBonus+amount>1000)throw new Error("BONUS_SPIN_LIMIT");
            await client.query(`UPDATE user_state SET bonus_free_spins=bonus_free_spins+$2,updated_at=now() WHERE user_id=$1::uuid`,[user.rows[0].id,amount]);
          }else if(type==="XP"){
            const nextXp=Number(user.rows[0].xp??0)+amount;await client.query(`UPDATE users SET xp=$2,level=$3,last_seen_at=now() WHERE id=$1::uuid`,[user.rows[0].id,nextXp,Math.max(1,Math.floor(nextXp/100)+1)]);
          }
          applied=true;issuedAt=new Date().toISOString();
          await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'PERSONAL_GIFT_REWARD_APPLIED','setting','owner_gifts',$2::jsonb)`,[admin.id,JSON.stringify({giftId:id,telegramId:current.telegramId,rewardType:type,amount,reason:current.gift})]);
        }
        gifts[index]={...current,status,issuedAt:status==="Выдан"?issuedAt:null,rewardApplied:applied};
        await client.query(`INSERT INTO app_settings(key,value) VALUES('owner_gifts',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[JSON.stringify(gifts)]);
        await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'OWNER_GIFT_UPDATED','setting','owner_gifts',$2::jsonb)`,[admin.id,JSON.stringify({id,status,rewardApplied:applied})]);
        return gifts;
      });
      return Response.json({ok:true,gifts:result});
    }catch(error){const code=error instanceof Error?error.message:"OWNER_GIFT_UPDATE_FAILED";return Response.json({ok:false,code},{status:code==="GIFT_NOT_FOUND"||code==="USER_NOT_FOUND"?404:code==="BONUS_SPIN_LIMIT"||code==="STARS_BALANCE_LIMIT"?409:400});}
  },
}}});
