import { createFileRoute } from '@tanstack/react-router';
import { validateTelegramInitData } from '@/server/auth/telegram';
import { requireBotToken } from '@/server/config';
import { withTransaction } from '@/server/db';
import { appendStarsLedger } from '@/server/stars-ledger';
import { getCurrentSeasonDay } from '@/server/daily-streak';

const CHOICES = {
  STARS: { title: '+5 Stars', amount: 5 },
  FREE_SPIN: { title: '+1 бонусная попытка', amount: 1 },
  DAILY_GIFT_BOOST: { title: '+20% к шансу Daily Gift', amount: 20 },
  NEXT_SPIN_BOOST: { title: 'Буст на следующую прокрутку', amount: 1 },
} as const;

function streakInfo(days:number[], currentDay:number) {
  const sorted=[...new Set(days)].filter((d)=>Number.isInteger(d)&&d>=1).sort((a,b)=>a-b);
  let cycleNo=1; let currentCycle=1;
  for(let i=0;i<sorted.length;i++){
    if(i>0&&sorted[i]!==sorted[i-1]+1) cycleNo++;
    if(sorted[i]===currentDay) currentCycle=cycleNo;
  }
  let streak=0; const set=new Set(sorted);
  for(let day=currentDay;day>0&&set.has(day);day--) streak++;
  return {cycleNo:currentCycle||cycleNo,currentStreak:streak};
}

export const Route=createFileRoute('/api/streak/claim')({server:{handlers:{
  POST:async({request})=>{
    try{
      const body=await request.json() as {initData?:string;choice?:string};
      const choice=body.choice as keyof typeof CHOICES;
      if(!(choice in CHOICES)) return Response.json({ok:false,code:'INVALID_STREAK_CHOICE'},{status:400});
      const validated=await validateTelegramInitData((body.initData??'').trim(),requireBotToken());
      const tg=validated.user;
      if(!tg?.id) return Response.json({ok:false,code:'TELEGRAM_USER_MISSING'},{status:400});
      const result=await withTransaction(async client=>{
        const user=await client.query<{id:string}>(\"SELECT id::text FROM users WHERE telegram_id=$1 FOR UPDATE\",[tg.id]);
        if(!user.rows[0]) throw new Error('USER_NOT_FOUND');
        if(!user.rows[0].is_subscribed) throw new Error('NOT_SUBSCRIBED');
        if(!user.rows[0].is_participant) throw new Error('NOT_PARTICIPANT');
        const season=await client.query<{id:string;state:string;starts_at:string|null;ends_at:string|null;is_paused:boolean}>(\"SELECT id::text,state,starts_at::text,ends_at::text,is_paused FROM seasons WHERE state IN ('ACTIVE','ENDING') ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END,created_at DESC LIMIT 1 FOR UPDATE\");
        if(!season.rows[0]) throw new Error('SEASON_NOT_ACTIVE');
        const s=season.rows[0];
        if(s.is_paused) throw new Error('SEASON_PAUSED');
        const currentDay=getCurrentSeasonDay(s.starts_at,s.ends_at);
        if(currentDay<7) throw new Error('STREAK_NOT_READY');
        const checkins=await client.query<{day_index:number}>(\"SELECT day_index FROM season_daily_checkins WHERE season_id=$1::uuid AND user_id=$2::uuid ORDER BY day_index ASC\",[s.id,user.rows[0].id]);
        const info=streakInfo(checkins.rows.map(r=>Number(r.day_index)),currentDay);
        if(info.currentStreak<7) throw new Error('STREAK_NOT_READY');
        const existing=await client.query<{reward_type:string;amount:number}>(\"SELECT reward_type,amount FROM season_streak_rewards WHERE season_id=$1::uuid AND user_id=$2::uuid AND cycle_no=$3 AND day_index=7 FOR UPDATE\",[s.id,user.rows[0].id,info.cycleNo]);
        if(existing.rows[0]) return {choice:existing.rows[0].reward_type,amount:Number(existing.rows[0].amount),duplicate:true};
        const cfg=CHOICES[choice];
        const reward=await client.query<{id:string}>(\"INSERT INTO season_streak_rewards(season_id,user_id,cycle_no,day_index,reward_type,amount,metadata) VALUES($1::uuid,$2::uuid,$3,7,$4,$5,$6::jsonb) RETURNING id::text\",[s.id,user.rows[0].id,info.cycleNo,choice,cfg.amount,JSON.stringify({title:cfg.title,source:'DAILY_STREAK_DAY_7'})]);
        if(choice==='STARS'){
          const state=await client.query<{stars_balance:number}>(\"SELECT stars_balance FROM user_state WHERE user_id=$1::uuid FOR UPDATE\",[user.rows[0].id]);
          const room=Math.max(0,500-Number(state.rows[0]?.stars_balance??0));
          const credited=Math.min(cfg.amount,room);
          await appendStarsLedger(client,{userId:user.rows[0].id,type:'REWARD',amount:cfg.amount,balanceDelta:credited,seasonId:s.id,referenceId:reward.rows[0].id,idempotencyKey:'streak-stars:'+reward.rows[0].id,metadata:{source:'DAILY_STREAK_DAY_7',creditedAmount:credited,overflowAmount:cfg.amount-credited,cycleNo:info.cycleNo}});
          if(cfg.amount>credited) await appendStarsLedger(client,{userId:user.rows[0].id,type:'CAPPED_OVERFLOW_BURNED',amount:-(cfg.amount-credited),balanceDelta:0,seasonId:s.id,referenceId:reward.rows[0].id,idempotencyKey:'streak-stars-overflow:'+reward.rows[0].id,metadata:{source:'DAILY_STREAK_DAY_7',creditedAmount:credited,overflowAmount:cfg.amount-credited,cycleNo:info.cycleNo}});
          await client.query(\"INSERT INTO audit_logs(action,entity_type,entity_id,after_data) VALUES('DAILY_STREAK_REWARD_CLAIMED','season_streak_reward',$1,$2::jsonb)\",[reward.rows[0].id,JSON.stringify({userId:user.rows[0].id,seasonId:s.id,cycleNo:info.cycleNo,choice,amount:credited})]);
          return {choice,amount:credited,requestedAmount:cfg.amount,duplicate:false};
        }
        if(choice==='FREE_SPIN') await client.query(\"UPDATE user_state SET bonus_free_spins=LEAST(1000,bonus_free_spins+$2),updated_at=now() WHERE user_id=$1::uuid\",[user.rows[0].id,cfg.amount]);
        if(choice==='DAILY_GIFT_BOOST') await client.query(\"UPDATE user_state SET daily_gift_chance_boost_pct=LEAST(100,daily_gift_chance_boost_pct+$2),updated_at=now() WHERE user_id=$1::uuid\",[user.rows[0].id,cfg.amount]);
        if(choice==='NEXT_SPIN_BOOST') await client.query(\"UPDATE user_state SET next_spin_boosts=LEAST(10,next_spin_boosts+$2),updated_at=now() WHERE user_id=$1::uuid\",[user.rows[0].id,cfg.amount]);
        await client.query(\"INSERT INTO audit_logs(action,entity_type,entity_id,after_data) VALUES('DAILY_STREAK_REWARD_CLAIMED','season_streak_reward',$1,$2::jsonb)\",[reward.rows[0].id,JSON.stringify({userId:user.rows[0].id,seasonId:s.id,cycleNo:info.cycleNo,choice,amount:cfg.amount})]);
        return {choice,amount:cfg.amount,requestedAmount:cfg.amount,duplicate:false};
      });
      return Response.json({ok:true,...result});
    }catch(error){
      const code=error instanceof Error?error.message:'STREAK_CLAIM_FAILED';
      const status=['INVALID_STREAK_CHOICE','TELEGRAM_USER_MISSING'].includes(code)?400:['STREAK_NOT_READY','SEASON_PAUSED','SEASON_NOT_ACTIVE'].includes(code)?409:['NOT_SUBSCRIBED','NOT_PARTICIPANT'].includes(code)?403:400;
      return Response.json({ok:false,code},{status});
    }
  },
}}});