import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query } from "@/server/db";

const DEFAULTS = {
  enabled: { "gift-or-pass": true, "good-or-bad": false, "owner-special": true },
  passCount: 2,
  failureText: "Не повезло… но это было красиво 😈",
  confirm: true,
};

type Settings = typeof DEFAULTS;

export const Route = createFileRoute("/api/admin/mechanics")({ server:{ handlers:{
  GET: async ({request}) => {
    try {
      await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
      const result = await query<{value: Settings}>(`SELECT value FROM app_settings WHERE key='mechanics' LIMIT 1`);
      const value = result.rows[0]?.value ?? DEFAULTS;
      return Response.json({ok:true,settings:{...DEFAULTS,...value,enabled:{...DEFAULTS.enabled,...value.enabled}}});
    } catch { return Response.json({ok:false,code:"MECHANICS_FAILED"},{status:401}); }
  },
  PATCH: async ({request}) => {
    try {
      const body = await request.json() as {initData?:unknown;settings?:Partial<Settings>};
      const admin = await authenticateAdmin(typeof body.initData === "string" ? body.initData : "");
      if (!body.settings || typeof body.settings !== "object") return Response.json({ok:false,code:"INVALID_SETTINGS"},{status:400});
      const settings: Settings = {
        enabled: {...DEFAULTS.enabled,...(body.settings.enabled ?? {})},
        passCount: Math.min(20,Math.max(1,Math.floor(Number(body.settings.passCount ?? DEFAULTS.passCount)))),
        failureText: String(body.settings.failureText ?? DEFAULTS.failureText).trim().slice(0,500),
        confirm: body.settings.confirm !== false,
      };
      await query(`INSERT INTO app_settings(key,value) VALUES('mechanics',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[JSON.stringify(settings)]);
      await query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'MECHANICS_UPDATED','setting','mechanics',$2::jsonb)`,[admin.id,JSON.stringify(settings)]);
      return Response.json({ok:true,settings});
    } catch { return Response.json({ok:false,code:"MECHANICS_UPDATE_FAILED"},{status:400}); }
  },
}}});
