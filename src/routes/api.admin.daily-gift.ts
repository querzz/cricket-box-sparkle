import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";
import { DEFAULT_DAILY_GIFT_CONFIG, parseDailyGiftConfig } from "@/server/daily-gift";

export const Route = createFileRoute("/api/admin/daily-gift")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
        const result = await query<{ value: unknown }>("SELECT value FROM app_settings WHERE key='daily_gift' LIMIT 1");
        return Response.json({ ok: true, config: parseDailyGiftConfig(result.rows[0]?.value ?? DEFAULT_DAILY_GIFT_CONFIG) });
      } catch {
        return Response.json({ ok: false, code: "AUTH_FAILED" }, { status: 401 });
      }
    },
    PATCH: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: unknown; config?: unknown };
        const admin = await authenticateAdmin(typeof body.initData === "string" ? body.initData : "");
        const config = parseDailyGiftConfig(body.config);
        await withTransaction(async (client) => {
          await client.query(
            "INSERT INTO app_settings(key,value) VALUES('daily_gift',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
            [JSON.stringify(config)],
          );
          await client.query(
            "INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'DAILY_GIFT_ODDS_UPDATED','setting','daily_gift',$2::jsonb)",
            [admin.id, JSON.stringify(config)],
          );
        });
        return Response.json({ ok: true, config });
      } catch (error) {
        const code = error instanceof Error ? error.message : "DAILY_GIFT_UPDATE_FAILED";
        return Response.json({ ok: false, code }, { status: code === "INVALID_DAILY_GIFT_CHANCE" ? 400 : 500 });
      }
    },
  }},
});
