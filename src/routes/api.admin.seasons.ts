import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";
import { createSeason, listSeasons, updateSeason } from "@/server/season-service";

const VALID_STATES = new Set(["DRAFT", "SCHEDULED", "ACTIVE", "ENDING", "CLOSED", "PAYOUT", "ARCHIVED"]);

export const Route = createFileRoute("/api/admin/seasons")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
        return Response.json({ ok: true, seasons: await listSeasons() });
      } catch {
        return Response.json({ ok: false, code: "AUTH_FAILED" }, { status: 401 });
      }
    },
    POST: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: string; code?: string; name?: string; paidSpinPrice?: number; dailyFreeSpin?: boolean };
        const actor = await authenticateAdmin(body.initData ?? "");
        const code = (body.code ?? "").trim();
        const name = (body.name ?? code).trim();
        if (!code || !name) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
        const season = await createSeason({ code, name, paidSpinPrice: Math.max(1, Number(body.paidSpinPrice ?? 100)), dailyFreeSpin: body.dailyFreeSpin !== false, adminId: actor.id });
        if (season) {
          await query(
            `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, after_data)
             VALUES ($1::uuid, 'SEASON_CREATED', 'season', $2, $3::jsonb)`,
            [actor.id, season.id, JSON.stringify({ code: season.code, name: season.name, state: season.state })],
          );
        }
        return Response.json({ ok: true, season });
      } catch (error) {
        console.error("Season create failed:", error instanceof Error ? error.message : error);
        return Response.json({ ok: false, code: "REQUEST_FAILED" }, { status: 400 });
      }
    },
    PATCH: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: string; id?: string; code?: string; name?: string; state?: string; startsAt?: string | null; endsAt?: string | null; paidSpinPrice?: number; dailyFreeSpin?: boolean };
        const actor = await authenticateAdmin(body.initData ?? "");
        if (!body.id) return Response.json({ ok: false, code: "INVALID_ID" }, { status: 400 });
        if (body.state && !VALID_STATES.has(body.state)) return Response.json({ ok: false, code: "INVALID_STATE" }, { status: 400 });

        const result = await withTransaction(async (client) => {
          const before = await client.query<{ id:string; code:string; name:string; state:string; starts_at:string|null; ends_at:string|null; paid_spin_price:number; daily_free_spin:boolean }>(
            `SELECT id::text,code,name,state,starts_at::text,ends_at::text,paid_spin_price,daily_free_spin FROM seasons WHERE id=$1::uuid FOR UPDATE`, [body.id],
          );
          if (!before.rows[0]) return { season: undefined, before: undefined };

          const season = await updateSeason(body.id!, {
            code: body.code,
            name: body.name,
            state: body.state as never,
            startsAt: body.startsAt,
            endsAt: body.endsAt,
            paidSpinPrice: body.paidSpinPrice,
            dailyFreeSpin: body.dailyFreeSpin,
          }, client);

          return { season, before: before.rows[0] };
        });

        if (!result.season || !result.before) return Response.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
        await query(
          `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, before_data, after_data)
           VALUES ($1::uuid, 'SEASON_UPDATED', 'season', $2, $3::jsonb, $4::jsonb)`,
          [actor.id, body.id, JSON.stringify(result.before), JSON.stringify(result.season)],
        );
        return Response.json({ ok: true, season: result.season });
      } catch (error) {
        console.error("Season update failed:", error instanceof Error ? error.message : error);
        return Response.json({ ok: false, code: error instanceof Error && error.message === "INVALID_STATE" ? "INVALID_STATE" : "REQUEST_FAILED" }, { status: 400 });
      }
    },
  }},
});
