import { createFileRoute } from '@tanstack/react-router';
import { authenticateAdmin } from '@/server/auth/access';
import { query } from '@/server/db';

type SeasonRow={id:string;code:string;name:string;state:string;starts_at:string|null;ends_at:string|null;closed_at:string|null};
function dayAt(starts:string|null,end:string|null){if(!starts||!end)return 0;return Math.max(0,Math.min(7,Math.floor((new Date(end).getTime()-new Date(starts).getTime())/86400000)+1));}
function currentStreak(days:number[],day:number){const set=new Set(days);let s=0;for(let d=day;d>0&&set.has(d);d--)s++;return s;}

export const Route=createFileRoute('/api/admin/daily-streak')({server:{handlers:{
GET:async({request})=>{
try{
const url=new URL(request.url);await authenticateAdmin(url.searchParams.get('initData')??'');
const requested=url.searchParams.get('seasonId');
const seasonResult=await query<SeasonRow>(requested?'SELECT id::text,code,name,state,starts_at::text,ends_at::text,closed_at::text FROM seasons WHERE id=$1::uuid':"SELECT id::text,code,name,state,starts_at::text,ends_at::text,closed_at::text FROM seasons WHERE state IN ('ACTIVE','ENDING','CLOSED','PAYOUT','ARCHIVED') ORDER BY CASE WHEN state='ACTIVE' THEN 0 WHEN state='ENDING' THEN 1 WHEN state='PAYOUT' THEN 2 WHEN state='CLOSED' THEN 3 ELSE 4 END,created_at DESC LIMIT 1",requested?[requested]:[]);
const season=seasonResult.rows[0];if(!season)return Response.json({ok:false,code:'SEASON_NOT_FOUND'},{status:404});
const live=['ACTIVE','ENDING'].includes(season.state);const end=['CLOSED','PAYOUT','ARCHIVED'].includes(season.state)?season.closed_at:season.ends_at;const day=dayAt(season.starts_at,end);
const checks=await query<{user_id:string;day_index:number}>("SELECT user_id::text,day_index FROM season_daily_checkins WHERE season_id=$1::uuid AND day_index BETWEEN 1 AND 7 ORDER BY user_id,day_index",[season.id]);
const byUser=new Map<string,number[]>();for(const row of checks.rows){const a=byUser.get(row.user_id)??[];a.push(Number(row.day_index));byUser.set(row.user_id,a);}
const choices=await query<{user_id:string;day_index:number;reward_type:string;amount:number;cycle_no:number}>("SELECT user_id::text,day_index,reward_type,amount,cycle_no FROM season_streak_rewards WHERE season_id=$1::uuid ORDER BY created_at ASC",[season.id]);
const users=await query<{id:string;telegram_id:string;username:string|null;first_name:string;last_name:string|null}>("SELECT u.id::text,u.telegram_id::text,u.username,u.first_name,u.last_name FROM users u WHERE u.is_test=FALSE AND EXISTS(SELECT 1 FROM season_daily_checkins c WHERE c.season_id=$1::uuid AND c.user_id=u.id) ORDER BY u.created_at ASC",[season.id]);
const players=users.rows.map(u=>{const days=byUser.get(u.id)??[];const streak=currentStreak(days,Math.min(7,day));const choice=choices.find(c=>c.user_id===u.id&&Number(c.day_index)===7);return{id:u.id,telegramId:u.telegram_id,username:u.username?'@'+u.username.replace(/^@/,''):'—',name:[u.first_name,u.last_name].filter(Boolean).join(' '),totalDays:7,currentDay:day,visitedDays:days.length,currentStreak:streak,checkedInToday:day>0&&days.includes(day),eligibleForReward:!choice&&streak>=7,days,day7Choice:choice?{type:choice.reward_type,amount:Number(choice.amount),cycleNo:Number(choice.cycle_no)}:null};});
const checkedToday=players.filter(p=>p.checkedInToday).length;const noMisses=players.filter(p=>p.visitedDays===day&&day>0).length;const eligible=players.filter(p=>p.eligibleForReward).length;
return Response.json({ok:true,season:{id:season.id,code:season.code,name:season.name,state:season.state,startsAt:season.starts_at,endsAt:season.ends_at,closedAt:season.closed_at,totalDays:7,currentDay:day,live},metrics:{participants:players.length,checkedToday,notCheckedToday:Math.max(0,players.length-checkedToday),noMisses,eligible,starsSchedule:[1,1,1,2,2,3],day7Choices:['STARS','FREE_SPIN','DAILY_GIFT_BOOST','NEXT_SPIN_BOOST']},players});
}catch(error){console.error('[CRICKET BOX] daily streak admin GET failed',error instanceof Error?error.message:error);const denied=error instanceof Error&&error.message==='ADMIN_ACCESS_DENIED';return Response.json({ok:false,code:denied?'ADMIN_ACCESS_DENIED':'DAILY_STREAK_FAILED'},{status:denied?403:500});}
}}}});