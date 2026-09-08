import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { query } from "@/server/db";
import { buildEconomyMetrics, getEconomyMultiplier } from "@/server/season-economy";
import { writeEconomySnapshot } from "@/server/liveops";

type SeasonRow = {
  id: string;
  code: string;
  name: string;
  state: string;
  starts_at: string | null;
  ends_at: string | null;
  paid_spin_price: number;
  paid_spin_enabled: boolean;
  daily_free_spin: boolean;
};

type SpinCounts = { hour: number; day: number; week: number; season: number };

export const Route = createFileRoute("/api/admin/economy")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
        const url = new URL(request.url);
        const seasonId = url.searchParams.get("seasonId") ?? "";
        const history = Math.min(50, Math.max(0, Number(url.searchParams.get("history") ?? 0) || 0));
        if (!seasonId) return Response.json({ ok: false, code: "INVALID_SEASON" }, { status: 400 });
        const seasonResult = await query<SeasonRow>(`SELECT id::text,code,name,state,starts_at::text,ends_at::text,paid_spin_price,paid_spin_enabled,daily_free_spin FROM seasons WHERE id=$1::uuid`, [seasonId]);
        const season = seasonResult.rows[0];
        if (!season) return Response.json({ ok: false, code: "SEASON_NOT_FOUND" }, { status: 404 });
        const counts = await query<{ hour: string; day: string; week: string; season: string }>(`SELECT COUNT(*) FILTER (WHERE created_at>=now()-interval '1 hour')::text AS hour,COUNT(*) FILTER (WHERE created_at>=now()-interval '1 day')::text AS day,COUNT(*) FILTER (WHERE created_at>=now()-interval '7 days')::text AS week,COUNT(*)::text AS season FROM spins WHERE season_id=$1::uuid AND status='COMPLETED'`, [seasonId]);
        const row = counts.rows[0];
        const spins: SpinCounts = { hour: Number(row?.hour ?? 0), day: Number(row?.day ?? 0), week: Number(row?.week ?? 0), season: Number(row?.season ?? 0) };
        const metrics = buildEconomyMetrics({ startsAt: season.starts_at, endsAt: season.ends_at, spins });
        const prizes = await query<{ id: string; kind: string; title: string; quantity_total: number; quantity_remaining: number; amount: string; unit_cost: string; currency: string | null; metadata: Record<string, unknown> | null; is_active: boolean }>(`SELECT id::text,kind,title,quantity_total,quantity_remaining,amount::text,unit_cost::text,currency,metadata,is_active FROM prizes WHERE season_id=$1::uuid ORDER BY created_at ASC`, [seasonId]);
        const snapshots = history > 0
          ? await query<{ id: string; completed_spins: number; spins_last_hour: number; spins_last_day: number; spins_last_week: number; pace_per_day: string; projected_season_spins: string; multipliers: Record<string, number>; created_at: string }>(`SELECT id::text,completed_spins,spins_last_hour,spins_last_day,spins_last_week,pace_per_day::text,projected_season_spins::text,multipliers,created_at::text FROM season_economy_snapshots WHERE season_id=$1::uuid ORDER BY created_at DESC LIMIT $2`, [seasonId, history])
          : [];
        return Response.json({
          ok: true,
          season,
          spins,
          metrics,
          prizes: prizes.rows.map(prize => ({ id: prize.id, kind: prize.kind, title: prize.title, quantityTotal: prize.quantity_total, quantityRemaining: prize.quantity_remaining, consumed: Math.max(0, prize.quantity_total - prize.quantity_remaining), amount: Number(prize.amount), unitCost: Number(prize.unit_cost), currency: prize.currency, active: prize.is_active, multiplier: getEconomyMultiplier({ quantityTotal: prize.quantity_total, quantityRemaining: prize.quantity_remaining, elapsedFraction: metrics.elapsedFraction }), weight: Number(prize.metadata?.weight ?? 1) || 1 })),
          snapshots: snapshots.rows,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "REQUEST_FAILED";
        return Response.json({ ok: false, code }, { status: code === "SEASON_NOT_FOUND" ? 404 : 401 });
      }
    },
    POST: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: string; seasonId?: string };
        const actor = await authenticateAdmin(body.initData ?? "");
        const seasonId = (body.seasonId ?? "").trim();
        if (!seasonId) return Response.json({ ok: false, code: "INVALID_SEASON" }, { status: 400 });
        const season = await query<{ id: string; code: string; starts_at: string | null; ends_at: string | null }>(`SELECT id::text,code,starts_at::text,ends_at::text FROM seasons WHERE id=$1::uuid`, [seasonId]);
        if (!season.rows[0]) return Response.json({ ok: false, code: "SEASON_NOT_FOUND" }, { status: 404 });
        const snapshot = await writeEconomySnapshot({ query } as never, { id: seasonId, startsAt: season.rows[0].starts_at, endsAt: season.rows[0].ends_at });
        const snapshotResult = await query<{ id: string; created_at: string }>(`SELECT id::text,created_at::text FROM season_economy_snapshots WHERE season_id=$1::uuid ORDER BY created_at DESC LIMIT 1`, [seasonId]);
        if (snapshotResult.rows[0]) await query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'ECONOMY_SNAPSHOT_CREATED','season_economy_snapshot',$2,$3::jsonb)`, [actor.id, snapshotResult.rows[0].id, JSON.stringify({ seasonId, metrics: snapshot.metrics })]);
        return Response.json({ ok: true, snapshot: { id: snapshotResult.rows[0]?.id ?? null, ...snapshot } });
      } catch (error) {
        const code = error instanceof Error ? error.message : "REQUEST_FAILED";
        return Response.json({ ok: false, code }, { status: 401 });
      }
    },
  } },
});
