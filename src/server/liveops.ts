import { type PoolClient } from "pg";

import { buildEconomyMetrics } from "@/server/season-economy";

type DbExecutor = Pick<PoolClient, "query">;

type SpinMetrics = { hour: number; day: number; week: number; season: number };

type DropPrize = { kind: string; title: string; subtitle?: string | null; amount?: number; unitCost?: number; currency?: string | null; quantityTotal: number; quantityRemaining?: number; active?: boolean; imageUrl?: string | null; metadata?: Record<string, unknown> };
type DropPayload = { prizes?: DropPrize[] };

export async function collectSeasonSpinMetrics(db: DbExecutor, seasonId: string): Promise<SpinMetrics> {
  const result = await db.query<{ hour: string; day: string; week: string; season: string }>(`SELECT COUNT(*) FILTER (WHERE created_at >= now() - interval '1 hour')::text AS hour, COUNT(*) FILTER (WHERE created_at >= now() - interval '1 day')::text AS day, COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::text AS week, COUNT(*)::text AS season FROM spins WHERE season_id=$1::uuid AND status='COMPLETED'`, [seasonId]);
  const row = result.rows[0];
  return { hour: Number(row?.hour ?? 0), day: Number(row?.day ?? 0), week: Number(row?.week ?? 0), season: Number(row?.season ?? 0) };
}

export async function writeEconomySnapshot(db: DbExecutor, season: { id: string; startsAt: string | null; endsAt: string | null }) {
  const spins = await collectSeasonSpinMetrics(db, season.id);
  const metrics = buildEconomyMetrics({ startsAt: season.startsAt, endsAt: season.endsAt, spins });
  const prizes = await db.query<{ id: string; metadata: Record<string, unknown> | null }>(`SELECT id::text,metadata FROM prizes WHERE season_id=$1::uuid AND is_active=TRUE ORDER BY created_at ASC`, [season.id]);
  const multipliers: Record<string, number> = {};
  for (const prize of prizes.rows) { const value = Number(prize.metadata?.economyMultiplier ?? 1); multipliers[prize.id] = Number.isFinite(value) && value > 0 ? value : 1; }
  await db.query(`INSERT INTO season_economy_snapshots (season_id,completed_spins,spins_last_hour,spins_last_day,spins_last_week,pace_per_day,projected_season_spins,multipliers) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [season.id,metrics.completedSpins,spins.hour,spins.day,spins.week,metrics.pacePerDay,metrics.projectedSeasonSpins,JSON.stringify(multipliers)]);
  return { metrics, multipliers };
}

function parseDropPayload(value: unknown): DropPayload { if (!value || typeof value !== "object") return {}; const payload = value as DropPayload; return Array.isArray(payload.prizes) ? { prizes: payload.prizes } : {}; }
function validatePrize(prize: DropPrize) { return Boolean(prize.kind && prize.title?.trim() && Number.isInteger(prize.quantityTotal) && prize.quantityTotal >= 1 && (prize.quantityRemaining === undefined || (Number.isInteger(prize.quantityRemaining) && prize.quantityRemaining >= 0 && prize.quantityRemaining <= prize.quantityTotal))); }

export async function activateDueDrops(db: DbExecutor, seasonId: string) {
  const drops = await db.query<{ id: string; name: string; payload: unknown }>(`SELECT id::text,name,payload FROM season_drop_events WHERE season_id=$1::uuid AND status='SCHEDULED' AND ((trigger_type='AT' AND trigger_value IS NOT NULL AND trigger_value<=extract(epoch FROM now())) OR (trigger_type='SEASON_PERCENT' AND trigger_value IS NOT NULL AND trigger_value<=COALESCE((SELECT CASE WHEN ends_at>starts_at THEN 100.0*EXTRACT(EPOCH FROM (now()-starts_at))/NULLIF(EXTRACT(EPOCH FROM (ends_at-starts_at)),0) ELSE 0 END FROM seasons WHERE id=$1::uuid),0)) OR (trigger_type='SPIN_COUNT' AND trigger_value IS NOT NULL AND trigger_value<=(SELECT COUNT(*) FROM spins WHERE season_id=$1::uuid AND status='COMPLETED'))) ORDER BY created_at ASC FOR UPDATE`, [seasonId]);
  const executed: string[] = [];
  for (const drop of drops.rows) {
    const payload = parseDropPayload(drop.payload);
    if (!payload.prizes?.length || !payload.prizes.every(validatePrize)) continue;
    for (const prize of payload.prizes) {
      const quantityTotal = prize.quantityTotal;
      const quantityRemaining = prize.quantityRemaining ?? quantityTotal;
      await db.query(`INSERT INTO prizes (season_id,kind,title,subtitle,amount,unit_cost,currency,quantity_total,quantity_remaining,is_active,image_url,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`, [seasonId,prize.kind,prize.title.trim(),prize.subtitle ?? null,prize.amount ?? 0,prize.unitCost ?? 0,prize.currency ?? null,quantityTotal,quantityRemaining,prize.active !== false,prize.imageUrl ?? null,JSON.stringify({ ...(prize.metadata ?? {}), liveOpsDropId: drop.id })]);
    }
    await db.query(`UPDATE season_drop_events SET status='EXECUTED',executed_at=now(),updated_at=now() WHERE id=$1::uuid`, [drop.id]);
    executed.push(drop.id);
  }
  return executed;
}
