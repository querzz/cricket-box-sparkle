import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query } from "@/server/db";
import { getCurrentSeasonDay, getSeasonDayCount, summarizeCheckins } from "@/server/daily-streak";

type SeasonRow = { id:string; code:string; name:string; state:string; starts_at:string|null; ends_at:string|null };

export const Route=createFileRoute("/api/admin/daily-streak")({server:{handlers:{
  GET:async({request})=>{
    try{
      const url=new URL(request.url);
      await authenticateAdmin(url.searchParams.get("initData")??"");
      const requested=url.searchParams.get("seasonId");
      const seasonResult=await query<SeasonRow>(
        requested
          ? "SELECT id::text,code,name,state,starts_at::text,ends_at::text FROM seasons WHERE id=$1::uuid"
          : "SELECT id::text,code,name,state,starts_at::text,ends_at::text FROM seasons ORDER BY CASE WHEN state='ACTIVE' THEN 0 WHEN state='ENDING' THEN 1 WHEN state='SCHEDULED' THEN 2 ELSE 3 END,created_at DESC LIMIT 1",
        requested?[requested]:[],
      );
      const season=seasonResult.rows[0];
      if(!season) return Response.json({ok:false,code:"SEASON_NOT_FOUND"},{status:404});
      const totalDays=getSeasonDayCount(season.starts_at,season.ends_at);
      const currentDay=getCurrentSeasonDay(season.starts_at,season.ends_at);
      const checkins=await query<{user_id:string;day_index:number}>(
        "SELECT user_id::text,day_index FROM season_daily_checkins WHERE season_id=$1::uuid ORDER BY user_id,day_index",
        [season.id],
      );
      const userMap=new Map<string,{userId:string;days:number[]}>();
      for(const row of checkins.rows){
        const id=row.user_id;
        const entry=userMap.get(id)??{userId:id,days:[]};
        entry.days.push(Number(row.day_index));
        userMap.set(id,entry);
      }
      const users=await query<{id:string;telegram_id:string;username:string|null;first_name:string;last_name:string|null}>(
        "SELECT u.id::text,u.telegram_id::text,u.username,u.first_name,u.last_name FROM users u WHERE u.is_test=FALSE AND EXISTS(SELECT 1 FROM season_daily_checkins c WHERE c.season_id=$1::uuid AND c.user_id=u.id) ORDER BY u.created_at ASC",
        [season.id],
      );
      const rows=users.rows.map((u)=>{
        const summary=summarizeCheckins(userMap.get(u.id)?.days??[],totalDays,currentDay,15);
        return {
          id:u.id,telegramId:u.telegram_id,username:u.username?"@"+u.username.replace(/^@/,""):"—",
          name:[u.first_name,u.last_name].filter(Boolean).join(" "),
          ...summary,days:userMap.get(u.id)?.days??[],
        };
      });
      const checkedToday=rows.filter(r=>r.checkedInToday).length;
      const noMisses=rows.filter(r=>r.currentDay>0&&r.currentStreak===Math.min(r.visitedDays,r.currentDay)&&r.visitedDays===r.currentDay).length;
      const eligible=rows.filter(r=>r.eligibleForReward).length;
      return Response.json({ok:true,season:{id:season.id,code:season.code,name:season.name,state:season.state,startsAt:season.starts_at,endsAt:season.ends_at,totalDays,currentDay},metrics:{participants:rows.length,checkedToday,notCheckedToday:Math.max(0,rows.length-checkedToday),noMisses,eligible},players:rows});
    }catch(error){
      console.error("[CRICKET BOX] daily streak admin GET failed",error instanceof Error?error.message:error);
      const denied=error instanceof Error&&error.message==="ADMIN_ACCESS_DENIED";
      return Response.json({ok:false,code:denied?"ADMIN_ACCESS_DENIED":"DAILY_STREAK_FAILED"},{status:denied?403:500});
    }
  },
}}});