import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";
import { activateDropById } from "@/server/liveops";

const TYPES = new Set(["AT", "SPIN_COUNT", "SEASON_PERCENT", "MANUAL"]);

export const Route = createFileRoute("/api/admin/drops")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
        const seasonId = new URL(request.url).searchParams.get("seasonId") ?? "";
        if (!seasonId) return Response.json({ ok: false, code: "INVALID_SEASON" }, { status: 400 });
        const rows = await query(`SELECT id::text,season_id::text,name,trigger_type,trigger_value,payload,status,created_by::text,activated_at,executed_at,created_at,updated_at FROM season_drop_events WHERE season_id=$1::uuid ORDER BY created_at DESC`, [seasonId]);
        return Response.json({ ok: true, drops: rows.rows });
      } catch {
        return Response.json({ ok: false, code: "AUTH_FAILED" }, { status: 401 });
      }
    },
    POST: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: string; seasonId?: string; name?: string; triggerType?: string; triggerValue?: unknown; payload?: unknown };
        const actor = await authenticateAdmin(body.initData ?? "");
        const seasonId = (body.seasonId ?? "").trim();
        const name = (body.name ?? "").trim();
        const triggerType = body.triggerType ?? "";
        const value = body.triggerValue === null || body.triggerValue === undefined ? null : Number(body.triggerValue);
        if (!seasonId || !name || !TYPES.has(triggerType) || (triggerType !== "MANUAL" && !Number.isFinite(value))) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
        if (triggerType === "SEASON_PERCENT" && (Number(value) < 0 || Number(value) > 100)) return Response.json({ ok: false, code: "INVALID_TRIGGER" }, { status: 400 });
        if (triggerType === "SPIN_COUNT" && (Number(value) < 0 || !Number.isInteger(Number(value)))) return Response.json({ ok: false, code: "INVALID_TRIGGER" }, { status: 400 });
        if (triggerType === "AT" && Number(value) <= 0) return Response.json({ ok: false, code: "INVALID_TRIGGER" }, { status: 400 });
        if (!body.payload || typeof body.payload !== "object" || !Array.isArray((body.payload as { prizes?: unknown }).prizes)) return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 });
        const result = await query(`INSERT INTO season_drop_events(season_id,name,trigger_type,trigger_value,payload,status,created_by) VALUES($1::uuid,$2,$3,$4,$5::jsonb,'SCHEDULED',$6::uuid) RETURNING id::text,season_id::text,name,trigger_type,trigger_value,payload,status,created_at`, [seasonId, name, triggerType, value, JSON.stringify(body.payload), actor.id]);
        await query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'DROP_SCHEDULED','season_drop',$2,$3::jsonb)`, [actor.id, result.rows[0].id, JSON.stringify(result.rows[0])]);
        return Response.json({ ok: true, drop: result.rows[0] });
      } catch (error) {
        const code = error instanceof Error ? error.message : "REQUEST_FAILED";
        return Response.json({ ok: false, code }, { status: 400 });
      }
    },
    PATCH: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: string; id?: string; seasonId?: string; action?: string };
        const actor = await authenticateAdmin(body.initData ?? "");
        const id = body.id?.trim() ?? "";
        const seasonId = body.seasonId?.trim() ?? "";
        const action = body.action ?? "";
        if (!id || !seasonId || !action) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
        await withTransaction(async client => {
          const row = await client.query<{ id: string; status: string }>(`SELECT id::text,status FROM season_drop_events WHERE id=$1::uuid AND season_id=$2::uuid FOR UPDATE`, [id, seasonId]);
          if (!row.rows[0]) throw new Error("NOT_FOUND");
          if (action === "CANCEL") {
            if (row.rows[0].status !== "SCHEDULED") throw new Error("DROP_NOT_SCHEDULED");
            await client.query(`UPDATE season_drop_events SET status='CANCELLED',updated_at=now() WHERE id=$1::uuid`, [id]);
          } else if (action === "ACTIVATE") {
            if (row.rows[0].status !== "SCHEDULED") throw new Error("DROP_NOT_SCHEDULED");
            await activateDropById(client, seasonId, id);
          } else {
            throw new Error("INVALID_ACTION");
          }
          await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id) VALUES($1::uuid,$2,'season_drop',$3)`, [actor.id, `DROP_${action}`, id]);
        });
        return Response.json({ ok: true });
      } catch (error) {
        const code = error instanceof Error ? error.message : "REQUEST_FAILED";
        return Response.json({ ok: false, code }, { status: code === "NOT_FOUND" ? 404 : 409 });
      }
    },
  }},
});
