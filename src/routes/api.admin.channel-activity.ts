import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";

const CHANNEL_ID = process.env["TELEGRAM_CHANNEL_ID"];
const TELEGRAM_BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"];
const MAX_ACTIVITY_BONUS_SPINS = 20;
const MAX_BONUS_SPINS = 1000;

type ActivityStatus = "Низкая" | "Активный" | "Очень активный" | "Максимальная";
type TelegramUser = { id:number; username?:string; first_name?:string; last_name?:string; is_bot?:boolean };

function levelFromScore(score:number):ActivityStatus {
  if (score >= 16) return "Максимальная";
  if (score >= 8) return "Очень активный";
  if (score >= 3) return "Активный";
  return "Низкая";
}

function isAdminMemberStatus(status:string|undefined) {
  return status === "administrator" || status === "creator";
}

async function telegramApi(method:string, body:Record<string,unknown>) {
  if (!TELEGRAM_BOT_TOKEN) return { ok:false, error:"TELEGRAM_BOT_TOKEN_MISSING" } as const;
  try {
    const response=await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(6000),
    });
    const data=await response.json() as {ok:boolean;result?:any;description?:string};
    return data.ok ? {ok:true,result:data.result} as const : {ok:false,error:data.description??"TELEGRAM_API_ERROR"} as const;
  } catch(error) {
    return {ok:false,error:error instanceof Error?error.message:"TELEGRAM_REQUEST_FAILED"} as const;
  }
}

async function getTelegramDiagnostics() {
  const diagnostics={
    configured:Boolean(CHANNEL_ID&&TELEGRAM_BOT_TOKEN),
    channelId:CHANNEL_ID??null,
    linkedDiscussionChatId:null as string|null,
    botId:null as number|null,
    botChannelStatus:null as string|null,
    botDiscussionStatus:null as string|null,
    channelTitle:null as string|null,
    ok:false,
    issues:[] as string[],
  };
  if (!TELEGRAM_BOT_TOKEN) diagnostics.issues.push("Не задан TELEGRAM_BOT_TOKEN.");
  if (!CHANNEL_ID) diagnostics.issues.push("Не задан TELEGRAM_CHANNEL_ID.");
  if (!diagnostics.configured) return diagnostics;

  const [me,chat]=await Promise.all([
    telegramApi("getMe",{}),
    telegramApi("getChat",{chat_id:CHANNEL_ID}),
  ]);

  if (!me.ok) diagnostics.issues.push("Бот не отвечает через Telegram Bot API.");
  else diagnostics.botId=Number(me.result?.id)||null;

  if (!chat.ok) {
    diagnostics.issues.push(`Не удалось получить канал: ${chat.error}`);
    return diagnostics;
  }

  diagnostics.channelTitle=typeof chat.result?.title==="string"?chat.result.title:null;
  const linked=chat.result?.linked_chat_id;
  diagnostics.linkedDiscussionChatId=linked!==undefined&&linked!==null?String(linked):null;

  if (diagnostics.botId) {
    const channelMember=await telegramApi("getChatMember",{chat_id:CHANNEL_ID,user_id:diagnostics.botId});
    if (channelMember.ok) diagnostics.botChannelStatus=channelMember.result?.status??null;
    else diagnostics.issues.push("Не удалось проверить права бота в канале.");

    if (!isAdminMemberStatus(diagnostics.botChannelStatus??undefined)) {
      diagnostics.issues.push("Бот не является администратором канала. Для автоматического учёта chat_member/message_reaction нужны права администратора.");
    }

    if (diagnostics.linkedDiscussionChatId) {
      const discussionMember=await telegramApi("getChatMember",{chat_id:diagnostics.linkedDiscussionChatId,user_id:diagnostics.botId});
      if (discussionMember.ok) diagnostics.botDiscussionStatus=discussionMember.result?.status??null;
      else diagnostics.issues.push("Не удалось проверить бота в чате обсуждений.");
      if (!isAdminMemberStatus(diagnostics.botDiscussionStatus??undefined)) {
        diagnostics.issues.push("Бот не администратор в чате обсуждений. При включённом privacy mode он может не получать обычные комментарии.");
      }
    } else {
      diagnostics.issues.push("У канала не найден привязанный чат обсуждений — комментарии учитывать негде.");
    }
  }

  diagnostics.ok=diagnostics.issues.length===0;
  return diagnostics;
}

export const Route=createFileRoute("/api/admin/channel-activity")({server:{handlers:{
  GET:async({request})=>{
    try{
      const url=new URL(request.url);
      await authenticateAdmin(url.searchParams.get("initData")??"");
      const requested=(url.searchParams.get("seasonId")??"").trim();

      const settings=await query<{value:unknown}>(`SELECT value FROM app_settings WHERE key='channel_activity' LIMIT 1`);
      const activityEnabled=(settings.rows[0]?.value as {enabled?:unknown}|undefined)?.enabled!==false;

      const seasonsResult=await query<{id:string;code:string;name:string;state:string;starts_at:string|null;ends_at:string|null}>(
        `SELECT id::text,code,name,state,starts_at::text,ends_at::text
           FROM seasons
          ORDER BY CASE
            WHEN state='ACTIVE' THEN 0
            WHEN state='ENDING' THEN 1
            WHEN state='SCHEDULED' THEN 2
            ELSE 3
          END,created_at DESC
          LIMIT 50`,
      );
      const seasons=seasonsResult.rows;
      const selected=requested
        ? seasons.find((season)=>season.id===requested)
        : seasons[0];
      if(requested&&!selected) return Response.json({ok:false,code:"SEASON_NOT_FOUND"},{status:404});
      if(!selected) return Response.json({ok:true,season:null,seasons:[],enabled:activityEnabled,configured:Boolean(CHANNEL_ID&&TELEGRAM_BOT_TOKEN),diagnostics:await getTelegramDiagnostics(),stats:{activeUsers:0,totalPoints:0,totalActions:0,bonusReady:0,comments:0,reactions:0,joins:0,lastEventAt:null},users:[]});

      const diagnostics=await getTelegramDiagnostics();
      if(!CHANNEL_ID) {
        return Response.json({
          ok:true,
          enabled:activityEnabled,
          configured:false,
          diagnostics,
          seasons,
          season:{id:selected.id,code:selected.code,name:selected.name,startsAt:selected.starts_at,endsAt:selected.ends_at,state:selected.state},
          stats:{activeUsers:0,totalPoints:0,totalActions:0,bonusReady:0,comments:0,reactions:0,joins:0,lastEventAt:null},
          users:[],
        });
      }

      const result=await query<{
        user_id:string|null;telegram_id:string;name:string;username:string|null;
        active_days:string;reactions:string;comments:string;joins:string;score:string;
        bonus_spins:string;activity_bonus_issued:string;activity_bonus_used:string;
      }>(
        `SELECT u.id::text AS user_id,
                ca.telegram_user_id::text AS telegram_id,
                COALESCE(NULLIF(trim(concat_ws(' ',u.first_name,u.last_name)),''),'Telegram user') AS name,
                u.username,
                COUNT(DISTINCT ca.occurred_at::date)::text AS active_days,
                COUNT(*) FILTER (WHERE ca.event_type='REACTION')::text AS reactions,
                COUNT(*) FILTER (WHERE ca.event_type='COMMENT')::text AS comments,
                COUNT(*) FILTER (WHERE ca.event_type='JOIN')::text AS joins,
                COALESCE(SUM(ca.activity_points),0)::text AS score,
                COALESCE(us.bonus_free_spins,0)::text AS bonus_spins,
                COALESCE(us.activity_bonus_spins_issued,0)::text AS activity_bonus_issued,
                COALESCE((SELECT COUNT(*) FROM spins s WHERE s.user_id=u.id AND s.season_id=$2::uuid AND s.type='ACTIVITY_BONUS' AND s.status='COMPLETED'),0)::text AS activity_bonus_used
           FROM channel_activity ca
           LEFT JOIN users u ON u.telegram_id=ca.telegram_user_id
           LEFT JOIN user_state us ON us.user_id=u.id
          WHERE ca.channel_id=$1::bigint
            AND (u.id IS NULL OR u.is_test=FALSE)
            AND ($3::timestamptz IS NULL OR ca.occurred_at >= $3::timestamptz)
            AND ($4::timestamptz IS NULL OR ca.occurred_at <= $4::timestamptz)
            AND ca.telegram_user_id > 0
          GROUP BY u.id,u.first_name,u.last_name,u.username,us.bonus_free_spins,us.activity_bonus_spins_issued,ca.telegram_user_id
          ORDER BY SUM(ca.activity_points) DESC,MAX(ca.occurred_at) DESC`,
        [CHANNEL_ID,selected.id,selected.starts_at,selected.ends_at],
      );

      const globalCounts=await query<{active_users:string;total_points:string;total_actions:string;comments:string;reactions:string;joins:string;last_event_at:string|null;bonus_ready:string}>(
        `SELECT COUNT(DISTINCT ca.telegram_user_id)::text AS active_users,
                COALESCE(SUM(ca.activity_points),0)::text AS total_points,
                COUNT(*)::text AS total_actions,
                COUNT(*) FILTER (WHERE ca.event_type='COMMENT')::text AS comments,
                COUNT(*) FILTER (WHERE ca.event_type='REACTION')::text AS reactions,
                COUNT(*) FILTER (WHERE ca.event_type='JOIN')::text AS joins,
                MAX(ca.occurred_at)::text AS last_event_at,
                COUNT(DISTINCT ca.telegram_user_id) FILTER (
                  WHERE EXISTS (
                    SELECT 1 FROM user_state us2 JOIN users u2 ON u2.id=us2.user_id
                    WHERE u2.telegram_id=ca.telegram_user_id
                      AND us2.activity_bonus_spins_issued>(
                        SELECT COUNT(*) FROM spins sb
                         WHERE sb.user_id=u2.id AND sb.season_id=$2::uuid AND sb.type='ACTIVITY_BONUS' AND sb.status='COMPLETED'
                      )
                  )
                )::text AS bonus_ready
           FROM channel_activity ca
          WHERE ca.channel_id=$1::bigint
            AND ($3::timestamptz IS NULL OR ca.occurred_at >= $3::timestamptz)
            AND ($4::timestamptz IS NULL OR ca.occurred_at <= $4::timestamptz)`,
        [CHANNEL_ID,selected.id,selected.starts_at,selected.ends_at],
      );

      const missingProfiles=result.rows.filter((row)=>!row.username||row.name==="Telegram user").slice(0,50);
      const profileEntries=await Promise.all(missingProfiles.map(async(row)=>[row.telegram_id,await telegramApi("getChatMember",{chat_id:CHANNEL_ID,user_id:Number(row.telegram_id)})] as const));
      const users=result.rows.map((row)=>{
        const score=Math.max(0,Number(row.score));
        const activityIssued=Math.min(MAX_ACTIVITY_BONUS_SPINS,Math.max(0,Number(row.activity_bonus_issued)));
        const activityUsed=Math.max(0,Number(row.activity_bonus_used));
        const bonusRemaining=Math.max(0,activityIssued-activityUsed);
        const profileResponse=profileEntries.find(([telegramId])=>telegramId===row.telegram_id)?.[1];
        const profile:TelegramUser|undefined=profileResponse?.ok?profileResponse.result?.user:undefined;
        const profileName=[profile?.first_name,profile?.last_name].filter(Boolean).join(" ").trim();
        const name=row.name!=="Telegram user"?row.name:profileName||`Telegram ${row.telegram_id}`;
        const username=row.username? `@${row.username.replace(/^@/,"")}` : profile?.username? `@${profile.username.replace(/^@/,"")}` : "—";
        return {
          id:row.user_id??`tg_${row.telegram_id}`,
          telegramId:row.telegram_id,name,username,
          activeDays:Number(row.active_days),reactions:Number(row.reactions),comments:Number(row.comments),joins:Number(row.joins),
          score,level:levelFromScore(score),bonus:bonusRemaining>0,
          bonusSpins:Number(row.bonus_spins),activityBonusRemaining:bonusRemaining,
        };
      });
      const stats={
        activeUsers:Number(globalCounts.rows[0]?.active_users??0),
        totalPoints:Number(globalCounts.rows[0]?.total_points??0),
        totalActions:Number(globalCounts.rows[0]?.total_actions??0),
        bonusReady:Number(globalCounts.rows[0]?.bonus_ready??0),
        comments:Number(globalCounts.rows[0]?.comments??0),
        reactions:Number(globalCounts.rows[0]?.reactions??0),
        joins:Number(globalCounts.rows[0]?.joins??0),
        lastEventAt:globalCounts.rows[0]?.last_event_at??null,
      };
      return Response.json({ok:true,enabled:activityEnabled,configured:Boolean(CHANNEL_ID&&TELEGRAM_BOT_TOKEN),diagnostics,seasons,season:{id:selected.id,code:selected.code,name:selected.name,startsAt:selected.starts_at,endsAt:selected.ends_at,state:selected.state},stats,users});
    }catch(error){
      console.error("Channel activity admin API failed:",error instanceof Error?error.message:error);
      const denied=error instanceof Error&&error.message==="ADMIN_ACCESS_DENIED";
      return Response.json({ok:false,code:denied?"ADMIN_ACCESS_DENIED":"CHANNEL_ACTIVITY_FAILED"},{status:denied?403:500});
    }
  },
  POST:async({request})=>{
    try{
      const body=await request.json() as {initData?:unknown;telegramId?:unknown};
      const admin=await authenticateAdmin(typeof body.initData==="string"?body.initData:"");
      const telegramId=typeof body.telegramId==="string"?body.telegramId.trim():"";
      if(!/^\d+$/.test(telegramId)) return Response.json({ok:false,code:"INVALID_USER"},{status:400});
      const result=await withTransaction(async(client)=>{
        const user=await client.query<{id:string}>(`SELECT id::text FROM users WHERE telegram_id=$1::bigint FOR UPDATE`,[telegramId]);
        if(!user.rows[0]) throw new Error("USER_NOT_FOUND");
        const state=await client.query<{bonus_free_spins:number}>(`SELECT bonus_free_spins FROM user_state WHERE user_id=$1::uuid FOR UPDATE`,[user.rows[0].id]);
        const current=Number(state.rows[0]?.bonus_free_spins??0);
        if(current>=MAX_BONUS_SPINS) throw new Error("BONUS_CAP_REACHED");
        await client.query(`INSERT INTO user_state(user_id) VALUES($1::uuid) ON CONFLICT(user_id) DO NOTHING`,[user.rows[0].id]);
        await client.query(`UPDATE user_state SET bonus_free_spins=LEAST($2,bonus_free_spins+1),updated_at=now() WHERE user_id=$1::uuid`,[user.rows[0].id,MAX_BONUS_SPINS]);
        await client.query(`INSERT INTO audit_logs (admin_id,action,entity_type,entity_id,after_data) VALUES ($1::uuid,'ACTIVITY_BONUS_GRANTED','user',$2,$3::jsonb)`,[admin.id,user.rows[0].id,JSON.stringify({telegramId,source:"ADMIN",amount:1})]);
        return current+1;
      });
      return Response.json({ok:true,bonusFreeSpins:result});
    }catch(error){
      const code=error instanceof Error?error.message:"CHANNEL_ACTIVITY_GRANT_FAILED";
      const status=code==="USER_NOT_FOUND"?404:code==="BONUS_CAP_REACHED"?409:400;
      return Response.json({ok:false,code},{status});
    }
  },
  PATCH:async({request})=>{
    try{
      const body=await request.json() as {initData?:unknown;enabled?:unknown};
      const admin=await authenticateAdmin(typeof body.initData==="string"?body.initData:"");
      if(typeof body.enabled!=="boolean") return Response.json({ok:false,code:"INVALID_ENABLED"},{status:400});
      await withTransaction(async(client)=>{
        await client.query(`INSERT INTO app_settings(key,value) VALUES('channel_activity',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[JSON.stringify({enabled:body.enabled})]);
        await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'CHANNEL_ACTIVITY_SYSTEM_UPDATED','setting','channel_activity',$2::jsonb)`,[admin.id,JSON.stringify({enabled:body.enabled})]);
      });
      return Response.json({ok:true,enabled:body.enabled});
    }catch(error){
      const code=error instanceof Error?error.message:"CHANNEL_ACTIVITY_UPDATE_FAILED";
      return Response.json({ok:false,code},{status:code==="ADMIN_ACCESS_DENIED"?401:400});
    }
  },
}}});
