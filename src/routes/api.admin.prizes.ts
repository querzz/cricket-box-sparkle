import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { withTransaction } from "@/server/db";
import { listPrizes, upsertPrize } from "@/server/season-service";

export const Route = createFileRoute("/api/admin/prizes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          await authenticateAdmin(url.searchParams.get("initData") ?? "");
          const seasonId = url.searchParams.get("seasonId");
          if (!seasonId) return Response.json({ ok: false, code: "INVALID_SEASON" }, { status: 400 });
          const includeInactive = url.searchParams.get("includeInactive") === "true";
          const prizes = await listPrizes(seasonId);
          return Response.json({ ok: true, prizes: includeInactive ? prizes : prizes.filter((prize) => prize.is_active) });
        } catch {
          return Response.json({ ok: false, code: "AUTH_FAILED" }, { status: 401 });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json() as {
            initData?: string;
            id?: string;
            seasonId?: string;
            kind?: string;
            title?: string;
            subtitle?: string | null;
            amount?: unknown;
            unitCost?: unknown;
            currency?: string | null;
            quantityTotal?: unknown;
            quantityRemaining?: unknown;
            active?: boolean;
            imageUrl?: string | null;
            metadata?: Record<string, unknown>;
            economicOverride?: boolean;
            economicOverrideReason?: string;
          };
          const admin = await authenticateAdmin(body.initData ?? "");
          const seasonId = body.seasonId;
          const title = body.title?.trim();
          if (!seasonId || !title) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
          const quantityTotalNumber = Number(body.quantityTotal ?? 0);
          const quantityRemainingNumber = body.quantityRemaining == null ? quantityTotalNumber : Number(body.quantityRemaining);
          const amount = Number(body.amount ?? 0);
          const unitCost = Number(body.unitCost ?? 0);
          if (!Number.isFinite(amount) || !Number.isFinite(unitCost) || !Number.isFinite(quantityTotalNumber) || !Number.isFinite(quantityRemainingNumber)) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
          const quantityTotal = Math.max(0, Math.floor(quantityTotalNumber));
          const quantityRemaining = Math.max(0, Math.floor(quantityRemainingNumber));
          const economicOverride = body.economicOverride === true;
          if (economicOverride && admin.role !== "OWNER") return Response.json({ ok: false, code: "OWNER_ONLY" }, { status: 403 });
          const economicOverrideReason = typeof body.economicOverrideReason === "string" ? body.economicOverrideReason.trim() : "";
          if (economicOverride && (economicOverrideReason.length < 5 || economicOverrideReason.length > 500)) return Response.json({ ok: false, code: "INVALID_OVERRIDE_REASON" }, { status: 400 });

          const prize = await withTransaction(async (client) => {
            const nextPrize = await upsertPrize({
              id: body.id,
              seasonId,
              kind: body.kind ?? "CUSTOM",
              title,
              subtitle: body.subtitle,
              amount,
              unitCost,
              currency: body.currency,
              quantityTotal,
              quantityRemaining,
              active: body.active !== false,
              imageUrl: body.imageUrl,
              metadata: body.metadata,
              economicOverride,
              economicOverrideRole: admin.role === "OWNER" ? "OWNER" : undefined,
              economicOverrideReason,
            }, client);
            const action = economicOverride ? "PRIZE_ECONOMIC_OVERRIDE" : "PRIZE_UPDATED";
            await client.query(
              `INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data)
               VALUES($1::uuid,$2,'prize',$3,$4::jsonb)`,
              [admin.id, action, nextPrize.id, JSON.stringify({ ...nextPrize, economicOverride, economicOverrideReason: economicOverride ? economicOverrideReason : undefined })],
            );
            return nextPrize;
          });
          return Response.json({ ok: true, prize });
        } catch (error) {
          const code = error instanceof Error ? error.message : "REQUEST_FAILED";
          const status = ["INVALID_PRIZE_KIND","INVALID_PRIZE_TITLE","INVALID_PRIZE_AMOUNT","INVALID_PRIZE_COST","INVALID_PRIZE_QUANTITY","INVALID_PRIZE_WEIGHT","INVALID_INPUT","INVALID_SEASON","INVALID_OVERRIDE_REASON"].includes(code)
            ? 400
            : ["PRIZE_NOT_FOUND","PRIZE_SEASON_MISMATCH","SEASON_NOT_FOUND"].includes(code)
              ? 404
              : ["PRIZE_ECONOMICS_LOCKED","PRIZE_QUANTITY_BELOW_WON","SEASON_PRIZE_POOL_INVALID"].includes(code)
                ? 409
                : code === "OWNER_ONLY"
                  ? 403
                  : 400;
          return Response.json({ ok: false, code }, { status });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const body = await request.json() as { initData?: string; id?: unknown; seasonId?: unknown };
          const actor = await authenticateAdmin(typeof body.initData === "string" ? body.initData : "");
          const id = typeof body.id === "string" ? body.id : "";
          const seasonId = typeof body.seasonId === "string" ? body.seasonId : "";
          if (!id || !seasonId) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });

          const result = await withTransaction(async (client) => {
            const before = await client.query<{
              id: string; season_id: string; is_active: boolean; title: string; kind: string; quantity_total: number; quantity_remaining: number;
            }>(
              `SELECT id::text, season_id::text, is_active, title, kind, quantity_total, quantity_remaining
                 FROM prizes WHERE id=$1::uuid AND season_id=$2::uuid FOR UPDATE`,
              [id, seasonId],
            );
            if (!before.rows[0]) throw new Error("PRIZE_NOT_FOUND");
            if (!before.rows[0].is_active) return { deactivated: false };

            const season = await client.query<{ state:string }>(`SELECT state FROM seasons WHERE id=$1::uuid FOR UPDATE`, [seasonId]);
            if (!season.rows[0]) throw new Error("SEASON_NOT_FOUND");
            const live = ["ACTIVE","ENDING"].includes(season.rows[0].state);
            if (live) {
              const remaining = await client.query<{ playable:string }>(
                `SELECT COUNT(*) FILTER (
                   WHERE is_active=TRUE
                     AND quantity_remaining>0
                     AND CASE
                       WHEN COALESCE(metadata->>'weight','') = '' THEN 1::numeric
                       WHEN metadata->>'weight' ~ '^([0-9]+(\\.[0-9]+)?)$' THEN (metadata->>'weight')::numeric
                       ELSE 0::numeric
                     END > 0
                 )::text AS playable
                   FROM prizes WHERE season_id=$1::uuid AND id<>$2::uuid`,
                [seasonId, id],
              );
              if (Number(remaining.rows[0]?.playable ?? 0) === 0) throw new Error("SEASON_PRIZE_POOL_INVALID");
            }

            await client.query(`UPDATE prizes SET is_active=FALSE, updated_at=now() WHERE id=$1::uuid`, [id]);
            await client.query(
              `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, before_data, after_data)
               VALUES ($1::uuid,'PRIZE_DEACTIVATED','prize',$2,$3::jsonb,$4::jsonb)`,
              [actor.id, id, JSON.stringify(before.rows[0]), JSON.stringify({ ...before.rows[0], is_active: false })],
            );
            return { deactivated: true };
          });

          return Response.json({ ok: true, deactivated: result.deactivated });
        } catch (error) {
          const code = error instanceof Error ? error.message : "REQUEST_FAILED";
          const status = ["PRIZE_NOT_FOUND","SEASON_NOT_FOUND"].includes(code) ? 404 : code === "SEASON_PRIZE_POOL_INVALID" ? 409 : 400;
          return Response.json({ ok: false, code }, { status });
        }
      },
    },
  },
});
