import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";
import { createSeason, listSeasons, updateSeason } from "@/server/season-service";

const VALID_STATES = new Set(["DRAFT", "SCHEDULED", "ACTIVE", "ENDING", "CLOSED", "PAYOUT", "ARCHIVED"]);

async function repairLiveSeasons() {
  await query(`
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END, created_at DESC
             ) AS rn
      FROM seasons
      WHERE state IN ('ACTIVE','ENDING')
    )
    UPDATE seasons s
       SET state='CLOSED', updated_at=now()
      FROM ranked r
     WHERE s.id=r.id AND r.rn>1
  `);
}

function withDisplayCodes<T extends { code: string; name: string }>(seasons: T[]) {
  return seasons.map((season, index) => ({
    ...season,
    code: `CRICKET BOX #${String(seasons.length - index).padStart(3, "0")}`,
  }));
}

export const Route = createFileRoute("/api/admin/seasons")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
          await repairLiveSeasons();
          const seasons = await listSeasons();
          return Response.json({ ok: true, seasons: withDisplayCodes(seasons) });
        } catch {
          return Response.json({ ok: false, code: "AUTH_FAILED" }, { status: 401 });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json() as { initData?: string; code?: string; name?: string; paidSpinPrice?: unknown; paidSpinEnabled?: boolean; dailyFreeSpin?: boolean };
          const actor = await authenticateAdmin(body.initData ?? "");
          const code = (body.code ?? "").trim();
          const name = (body.name ?? code).trim();
          const paidSpinPrice = Number(body.paidSpinPrice ?? 100);
          if (!code || !name || !Number.isSafeInteger(paidSpinPrice) || paidSpinPrice <= 0) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
          const season = await createSeason({ code, name, paidSpinPrice, paidSpinEnabled: body.paidSpinEnabled !== false, dailyFreeSpin: body.dailyFreeSpin !== false, adminId: actor.id });
          if (season) await query(`INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, after_data) VALUES ($1::uuid, 'SEASON_CREATED', 'season', $2, $3::jsonb)`, [actor.id, season.id, JSON.stringify(season)]);
          return Response.json({ ok: true, season: { ...season, code: season.code } });
        } catch (error) {
          console.error("Season create failed:", error instanceof Error ? error.message : error);
          return Response.json({ ok: false, code: "REQUEST_FAILED" }, { status: 400 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = await request.json() as { initData?: string; id?: string; code?: string; name?: string; state?: string; startsAt?: string | null; endsAt?: string | null; paidSpinPrice?: unknown; paidSpinEnabled?: boolean; dailyFreeSpin?: boolean };
          const actor = await authenticateAdmin(body.initData ?? "");
          const seasonId = body.id;
          if (!seasonId) return Response.json({ ok: false, code: "INVALID_ID" }, { status: 400 });
          if (body.state && !VALID_STATES.has(body.state)) return Response.json({ ok: false, code: "INVALID_STATE" }, { status: 400 });
          const paidSpinPrice = body.paidSpinPrice === undefined ? undefined : Number(body.paidSpinPrice);
          if (paidSpinPrice !== undefined && (!Number.isSafeInteger(paidSpinPrice) || paidSpinPrice <= 0)) return Response.json({ ok: false, code: "INVALID_PAID_SPIN_PRICE" }, { status: 400 });

          const result = await withTransaction(async (client) => {
            await client.query(`SELECT pg_advisory_xact_lock(hashtext('cricket_box:season_state'))`);
            const before = await client.query(`SELECT id::text,code,name,state,starts_at::text,ends_at::text,paid_spin_price,paid_spin_enabled,daily_free_spin FROM seasons WHERE id=$1::uuid FOR UPDATE`, [seasonId]);
            if (!before.rows[0]) return { season: undefined, before: undefined };
            const season = await updateSeason(seasonId, { code: body.code, name: body.name, state: body.state as never, startsAt: body.startsAt, endsAt: body.endsAt, paidSpinPrice, paidSpinEnabled: body.paidSpinEnabled, dailyFreeSpin: body.dailyFreeSpin }, client);
            if (!season) return { season: undefined, before: before.rows[0] };
            await client.query(`INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, before_data, after_data) VALUES ($1::uuid, 'SEASON_UPDATED', 'season', $2, $3::jsonb, $4::jsonb)`, [actor.id, seasonId, JSON.stringify(before.rows[0]), JSON.stringify(season)]);
            return { season, before: before.rows[0] };
          });

          if (!result.season || !result.before) return Response.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
          return Response.json({ ok: true, season: result.season });
        } catch (error) {
          const code = error instanceof Error ? error.message : "REQUEST_FAILED";
          const status = ["INVALID_STATE", "INVALID_PAID_SPIN_PRICE"].includes(code) ? 400 : ["INVALID_SEASON_TRANSITION", "PAID_SPIN_PRICE_LOCKED", "PAID_SPIN_REENABLE_LOCKED", "SEASON_START_LOCKED", "SEASON_END_CANNOT_BE_SHORTENED", "SEASON_END_CANNOT_BE_REMOVED"].includes(code) ? 409 : 400;
          console.error("Season update failed:", code);
          return Response.json({ ok: false, code }, { status });
        }
      },
    },
  },
});
