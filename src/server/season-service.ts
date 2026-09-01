import { type PoolClient } from "pg";
import { query } from "@/server/db";

export type DbSeason = {
  id: string;
  code: string;
  name: string;
  state: "DRAFT" | "SCHEDULED" | "ACTIVE" | "ENDING" | "CLOSED" | "PAYOUT" | "ARCHIVED";
  starts_at: string | null;
  ends_at: string | null;
  paid_spin_price: number;
  daily_free_spin: boolean;
};

export type DbPrize = {
  id: string;
  season_id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  amount: string;
  unit_cost: string;
  currency: string | null;
  quantity_total: number;
  quantity_remaining: number;
  metadata: Record<string, unknown>;
};

const SEASON_STATES = ["DRAFT", "SCHEDULED", "ACTIVE", "ENDING", "CLOSED", "PAYOUT", "ARCHIVED"] as const;

type DbExecutor = Pick<PoolClient, "query">;

export async function listSeasons() {
  const result = await query<DbSeason>(`SELECT id, code, name, state, starts_at, ends_at, paid_spin_price, daily_free_spin FROM seasons ORDER BY created_at DESC`);
  return result.rows;
}

export async function createSeason(input: { code: string; name: string; paidSpinPrice: number; dailyFreeSpin: boolean; adminId: string }) {
  const result = await query<DbSeason>(`INSERT INTO seasons (code, name, paid_spin_price, daily_free_spin, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, code, name, state, starts_at, ends_at, paid_spin_price, daily_free_spin`, [input.code, input.name, input.paidSpinPrice, input.dailyFreeSpin, input.adminId]);
  return result.rows[0];
}

export async function updateSeason(id: string, patch: Partial<{ code: string; name: string; state: DbSeason["state"]; startsAt: string | null; endsAt: string | null; paidSpinPrice: number; dailyFreeSpin: boolean }>, executor?: DbExecutor) {
  const db = executor ?? { query };
  const currentResult = await db.query<{ state: DbSeason["state"] }>(`SELECT state FROM seasons WHERE id = $1 FOR UPDATE`, [id]);
  if (!currentResult.rows[0]) return undefined;

  const requestedState = patch.state;
  if (requestedState && !SEASON_STATES.includes(requestedState)) throw new Error("INVALID_STATE");

  const currentState = currentResult.rows[0].state;
  const startsAt = patch.startsAt ?? null;
  const endsAt = patch.endsAt ?? null;

  // An explicitly selected admin state always wins over date-based inference.
  const nextState = requestedState ?? (
    !patch.state && currentState === "DRAFT" && startsAt && endsAt
      ? (new Date(startsAt) > new Date() ? "SCHEDULED" : currentState)
      : currentState
  );

  if (nextState === "ACTIVE" || nextState === "ENDING") {
    await db.query(`UPDATE seasons SET state = 'CLOSED', updated_at = now() WHERE id <> $1 AND state IN ('ACTIVE','ENDING')`, [id]);
  }

  const result = await db.query<DbSeason>(
    `UPDATE seasons
        SET code = COALESCE($2, code),
            name = COALESCE($3, name),
            state = $4,
            starts_at = $5,
            ends_at = $6,
            paid_spin_price = COALESCE($7, paid_spin_price),
            daily_free_spin = COALESCE($8, daily_free_spin),
            updated_at = now()
      WHERE id = $1
      RETURNING id, code, name, state, starts_at, ends_at, paid_spin_price, daily_free_spin`,
    [id, patch.code ?? null, patch.name ?? null, nextState, startsAt, endsAt, patch.paidSpinPrice ?? null, patch.dailyFreeSpin ?? null],
  );
  return result.rows[0];
}

export async function listPrizes(seasonId: string) {
  const result = await query<DbPrize>(`SELECT id, season_id, kind, title, subtitle, amount, unit_cost, currency, quantity_total, quantity_remaining, metadata FROM prizes WHERE season_id = $1 ORDER BY created_at ASC`, [seasonId]);
  return result.rows;
}

export async function upsertPrize(input: { id?: string; seasonId: string; kind: string; title: string; subtitle?: string | null; amount: number; unitCost: number; currency?: string | null; quantityTotal: number; quantityRemaining?: number; metadata?: Record<string, unknown> }) {
  if (input.id) {
    const result = await query<DbPrize>(`UPDATE prizes SET kind=$2,title=$3,subtitle=$4,amount=$5,unit_cost=$6,currency=$7,quantity_total=$8,quantity_remaining=$9,metadata=$10,updated_at=now() WHERE id=$1 RETURNING id,season_id,kind,title,subtitle,amount,unit_cost,currency,quantity_total,quantity_remaining,metadata`, [input.id,input.kind,input.title,input.subtitle ?? null,input.amount,input.unitCost,input.currency ?? null,input.quantityTotal,input.quantityRemaining ?? input.quantityTotal,input.metadata ?? {}]);
    return result.rows[0];
  }
  const result = await query<DbPrize>(`INSERT INTO prizes (season_id,kind,title,subtitle,amount,unit_cost,currency,quantity_total,quantity_remaining,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,season_id,kind,title,subtitle,amount,unit_cost,currency,quantity_total,quantity_remaining,metadata`, [input.seasonId,input.kind,input.title,input.subtitle ?? null,input.amount,input.unitCost,input.currency ?? null,input.quantityTotal,input.quantityRemaining ?? input.quantityTotal,input.metadata ?? {}]);
  return result.rows[0];
}