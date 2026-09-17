import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";

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
