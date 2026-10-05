import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";
import { sendTelegramNotification } from "@/server/telegram-notify";

const DEFAULTS = {
  enabled: { "gift-or-pass": true, "good-or-bad": false, "owner-special": true },
  passCount: 2,
  failureText: "Не повезло… но это было красиво 😈",
  confirm: true,
};

type Settings = typeof DEFAULTS;
const ENABLED_KEYS = Object.keys(DEFAULTS.enabled) as Array<keyof Settings["enabled"]>;

function parseSettings(input: Partial<Settings>): Settings {
  if (!input || typeof input !== "object") throw new Error("INVALID_SETTINGS");

  const passCount = Number(input.passCount ?? DEFAULTS.passCount);
  if (!Number.isSafeInteger(passCount) || passCount < 1 || passCount > 20) throw new Error("INVALID_PASS_COUNT");

  const failureText = String(input.failureText ?? DEFAULTS.failureText).trim().slice(0, 500);
  if (!failureText) throw new Error("INVALID_FAILURE_TEXT");

  const rawEnabled = input.enabled && typeof input.enabled === "object" ? input.enabled as Partial<Record<keyof Settings["enabled"], unknown>> : {};
  const enabled = {} as Settings["enabled"];
  for (const key of ENABLED_KEYS) {
    const value = rawEnabled[key];
    if (value !== undefined && typeof value !== "boolean") throw new Error("INVALID_ENABLED_VALUE");
    enabled[key] = value === undefined ? DEFAULTS.enabled[key] : value;
  }

  if (input.confirm !== undefined && typeof input.confirm !== "boolean") throw new Error("INVALID_CONFIRM_VALUE");

  return {
    enabled,
    passCount,
    failureText,
    confirm: input.confirm === undefined ? DEFAULTS.confirm : input.confirm,
  };
}

export const Route = createFileRoute("/api/admin/mechanics")({ server:{ handlers:{
  GET: async ({request}) => {
    try {
      await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
    } catch {
      return Response.json({ok:false,code:"AUTH_FAILED"},{status:401});
    }
    try {
      const result = await query<{value: Settings}>(`SELECT value FROM app_settings WHERE key='mechanics' LIMIT 1`);
      const value = result.rows[0]?.value ?? DEFAULTS;
      return Response.json({ok:true,settings:parseSettings(value)});
    } catch (error) {
      const code = error instanceof Error ? error.message : "MECHANICS_FAILED";
      return Response.json({ok:false,code},{status:500});
    }
  },
  POST: async ({request}) => {
    try {
      const body = await request.json() as {initData?:unknown;telegramId?:unknown;type?:unknown;title?:unknown;message?:unknown;rewardType?:unknown;amount?:unknown;passCount?:unknown;goodAmount?:unknown};
      const admin = await authenticateAdmin(typeof body.initData === 'string' ? body.initData : '');
      const type = String(body.type ?? '');
      if (!['GIFT_OR_PASS','GOOD_OR_BAD','OWNER_SPECIAL'].includes(type)) throw new Error('INVALID_EVENT_TYPE');
      const telegramId = String(body.telegramId ?? '').replace(/\D/g,'');
      if (!telegramId) throw new Error('TELEGRAM_ID_REQUIRED');
      const settingsRow = await query<{value: Settings}>(`SELECT value FROM app_settings WHERE key='mechanics' LIMIT 1`);
      const currentSettings = parseSettings(settingsRow.rows[0]?.value ?? DEFAULTS);
      const mechanismKey = type==='GIFT_OR_PASS' ? 'gift-or-pass' : type==='GOOD_OR_BAD' ? 'good-or-bad' : 'owner-special';
      if (!currentSettings.enabled[mechanismKey]) throw new Error('MECHANIC_DISABLED');
      const rewardType = String(body.rewardType ?? 'NOTE');
      if (!['STARS','FREE_SPIN','XP','NOTE'].includes(rewardType)) throw new Error('INVALID_REWARD_TYPE');
      const amount = Math.floor(Number(body.amount ?? 0));
      if (rewardType !== 'NOTE' && (!Number.isSafeInteger(amount) || amount < 1 || amount > 100)) throw new Error('INVALID_REWARD_AMOUNT');
      const passCount = Math.max(0, Math.min(20, Math.floor(Number(body.passCount ?? 0))));
      const goodAmount = Math.max(0, Math.min(100, Math.floor(Number(body.goodAmount ?? 5))));
      const result = await withTransaction(async client => {
        const user = await client.query<{id:string;username:string|null}>(`SELECT id::text,username FROM users WHERE telegram_id=$1 AND is_test=FALSE FOR UPDATE`, [telegramId]);
        if (!user.rows[0]) throw new Error('USER_NOT_FOUND');
        const season = await client.query<{id:string}>(`SELECT id::text FROM seasons WHERE state IN ('ACTIVE','ENDING') ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END,created_at DESC LIMIT 1`);
        const seasonId = season.rows[0]?.id ?? null;
        const defaultTitle = type==='GIFT_OR_PASS' ? 'Подарок, который можно передать' : type==='GOOD_OR_BAD' ? 'Хороший или неудачный подарок' : 'Особый подарок владельца';
        const title = String(body.title ?? defaultTitle).trim().slice(0,160);
        const message = String(body.message ?? '').trim().slice(0,1000);
        let payload:Record<string,unknown>={title,message};
        if(type==='GOOD_OR_BAD') payload={...payload,good:{type:'STARS',amount:goodAmount,title:'Хороший подарок'},bad:{type:'NOTE',amount:0,title:'Неудачный подарок'}};
        else payload={...payload,reward:{type:rewardType,amount:rewardType==='NOTE'?0:amount},passCount};
        const event = await client.query<{id:string;created_at:string}>(`INSERT INTO entertainment_events(season_id,created_by,user_id,type,status,pass_remaining,payload) VALUES($1::uuid,$2::uuid,$3::uuid,$4,'OFFERED',$5,$6::jsonb) RETURNING id::text,created_at::text`, [seasonId,admin.id,user.rows[0].id,type,type==='GIFT_OR_PASS'?passCount:0,JSON.stringify(payload)]);
        await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'ENTERTAINMENT_EVENT_CREATED','user',$2,$3::jsonb)`, [admin.id,user.rows[0].id,JSON.stringify({eventId:event.rows[0].id,type,telegramId,rewardType,amount,passCount,goodAmount})]);
        return {id:event.rows[0].id,username:user.rows[0].username?('@'+user.rows[0].username.replace(/^@/,'')):'—',telegramId,type,status:'OFFERED',createdAt:event.rows[0].created_at,payload};
      });
      const eventLabel = type==="GIFT_OR_PASS" ? "🎁 Подарок, который можно передать" : type==="GOOD_OR_BAD" ? "🎲 Хороший или неудачный подарок" : "✨ Особый подарок владельца";\n      void sendTelegramNotification(telegramId, `<b>${eventLabel}</b>\n\nОткрой CRICKET BOX — для тебя появилось новое событие.`);\n      return Response.json({ok:true,event:result});
    } catch(error) {
      const code=error instanceof Error?error.message:'ENTERTAINMENT_CREATE_FAILED';
      const status=['INVALID_EVENT_TYPE','INVALID_REWARD_TYPE','INVALID_REWARD_AMOUNT','TELEGRAM_ID_REQUIRED','MECHANIC_DISABLED'].includes(code)?400:code==='USER_NOT_FOUND'?404:code==='ADMIN_ACCESS_DENIED'?401:500;
      return Response.json({ok:false,code},{status});
    }
  },
  PATCH: async ({request}) => {
    try {
      const body = await request.json() as {initData?:unknown;settings?:Partial<Settings>};
      const admin = await authenticateAdmin(typeof body.initData === "string" ? body.initData : "");
      const settings = parseSettings(body.settings ?? {});
      await withTransaction(async(client) => {
        await client.query(`INSERT INTO app_settings(key,value) VALUES('mechanics',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[JSON.stringify(settings)]);
        await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'MECHANICS_UPDATED','setting','mechanics',$2::jsonb)`,[admin.id,JSON.stringify(settings)]);
      });
      return Response.json({ok:true,settings});
    } catch (error) {
      const code = error instanceof Error ? error.message : "MECHANICS_UPDATE_FAILED";
      const status = ["INVALID_SETTINGS","INVALID_PASS_COUNT","INVALID_FAILURE_TEXT","INVALID_ENABLED_VALUE","INVALID_CONFIRM_VALUE"].includes(code) ? 400 : code === "ADMIN_ACCESS_DENIED" ? 401 : 500;
      return Response.json({ok:false,code},{status});
    }
  },
}}});
