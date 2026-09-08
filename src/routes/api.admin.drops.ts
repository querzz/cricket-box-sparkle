import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";
import { activateDropById } from "@/server/liveops";

const TYPES = new Set(["AT", "SPIN_COUNT", "SEASON_PERCENT", "MANUAL"]);
const ALLOWED_KINDS = new Set(["STARS", "PREMIUM", "MONEY", "NFT", "PHYSICAL", "CUSTOM", "FREE_SPIN", "EMPTY"]);
const MAX_PRIZES_PER_DROP = 25;
const MAX_QUANTITY_PER_PRIZE = 1_000_000;
const MAX_AMOUNT = 1_000_000_000;

function validPrize(prize: unknown) {
  if (!prize || typeof prize !== "object") return false;
  const p = prize as Record<string, unknown>;
  const kind = typeof p.kind === "string" ? p.kind.trim() : "";
  const title = typeof p.title === "string" ? p.title.trim() : "";
  const quantityTotal = p.quantityTotal;
  const quantityRemaining = p.quantityRemaining;
  const amount = Number(p.amount ?? 0);
  const unitCost = Number(p.unitCost ?? 0);
  return Boolean(
    ALLOWED_KINDS.has(kind) &&
    title &&
    Number.isInteger(quantityTotal) &&
    Number(quantityTotal) >= 1 &&
    Number(quantityTotal) <= MAX_QUANTITY_PER_PRIZE &&
    (quantityRemaining === undefined || (Number.isInteger(quantityRemaining) && Number(quantityRemaining) >= 0 && Number(quantityRemaining) <= Number(quantityTotal))) &&
    Number.isFinite(amount) && amount >= 0 && amount <= MAX_AMOUNT &&
    Number.isFinite(unitCost) && unitCost >= 0 && unitCost <= MAX_AMOUNT,
  );
}

function validPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const prizes = (payload as { prizes?: unknown }).prizes;
  return Array.isArray(prizes) && prizes.length > 0 && prizes.length <= MAX_PRIZES_PER_DROP && prizes.every(validPrize);
}

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
        if (triggerType === "MANUAL" && value !== null) return Response.json({ ok: false, code: "INVALID_TRIGGER" }, { status: 400 });
        if (triggerType === "SEASON_PERCENT" && (value === null || value < 0 || value > 100)) return Response.json({ ok: false, code: "INVALID_TRIGGER" }, { status: 400 });
        if (triggerType === "SPIN_COUNT" && (value === null || value < 0 || !Number.isInteger(value))) return Response.json({ ok: false, code: "INVALID_TRIGGER" }, { status: 400 });
        if (triggerType === "AT" && (value === null || value <= 0 || !Number.isInteger(value))) return Response.json({ ok: false, code: "INVALID_TRIGGER" }, { status: 400 });
        if (!validPayload(body.payload)) return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 });
        const season = await query(`SELECT id FROM seasons WHERE id=$1::uuid`, [seasonId]);
        if (!season.rows[0]) return Response.json({ ok: false, code: "SEASON_NOT_FOUND" }, { status: 404 });
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
          await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,$2,'season_drop',$3,$4::jsonb)`, [actor.id, `DROP_${action}`, id, JSON.stringify({ seasonId, action })]);
        });
        return Response.json({ ok: true });
      } catch (error) {
        const code = error instanceof Error ? error.message : "REQUEST_FAILED";
        return Response.json({ ok: false, code }, { status: code === "NOT_FOUND" ? 404 : 409 });
      }
    },
  }},
});
