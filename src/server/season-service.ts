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
  is_active: boolean;
  image_url: string | null;
  metadata: Record<string, unknown>;
};

const SEASON_STATES = ["DRAFT", "SCHEDULED", "ACTIVE", "ENDING", "CLOSED", "PAYOUT", "ARCHIVED"] as const;
const PRIZE_KINDS = ["STARS", "PREMIUM", "MONEY", "NFT", "PHYSICAL", "CUSTOM", "FREE_SPIN", "EMPTY"] as const;

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
  const nextState = requestedState ?? (!patch.state && currentState === "DRAFT" && startsAt && endsAt && new Date(startsAt) > new Date() ? "SCHEDULED" : currentState);

  if (nextState === "ACTIVE" || nextState === "ENDING") {
    await db.query(`UPDATE seasons SET state = 'CLOSED', updated_at = now() WHERE id <> $1 AND state IN ('ACTIVE','ENDING')`, [id]);
  }

  const result = await db.query<DbSeason>(
    `UPDATE seasons
        SET code = COALESCE($2, code), name = COALESCE($3, name), state = $4,
            starts_at = $5, ends_at = $6, paid_spin_price = COALESCE($7, paid_spin_price),
            daily_free_spin = COALESCE($8, daily_free_spin), updated_at = now()
      WHERE id = $1
      RETURNING id, code, name, state, starts_at, ends_at, paid_spin_price, daily_free_spin`,
    [id, patch.code ?? null, patch.name ?? null, nextState, startsAt, endsAt, patch.paidSpinPrice ?? null, patch.dailyFreeSpin ?? null],
  );
  return result.rows[0];
}

export async function listPrizes(seasonId: string) {
  const result = await query<DbPrize>(
    `SELECT id, season_id, kind, title, subtitle, amount, unit_cost, currency, quantity_total, quantity_remaining,
            is_active, image_url, metadata
       FROM prizes WHERE season_id = $1 ORDER BY created_at ASC`,
    [seasonId],
  );
  return result.rows;
}

export async function upsertPrize(input: {
  id?: string;
  seasonId: string;
  kind: string;
  title: string;
  subtitle?: string | null;
  amount: number;
  unitCost: number;
  currency?: string | null;
  quantityTotal: number;
  quantityRemaining?: number;
  active?: boolean;
  imageUrl?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!PRIZE_KINDS.includes(input.kind as (typeof PRIZE_KINDS)[number])) throw new Error("INVALID_PRIZE_KIND");
  if (!input.title.trim()) throw new Error("INVALID_PRIZE_TITLE");
  if (!Number.isFinite(input.amount) || input.amount < 0) throw new Error("INVALID_PRIZE_AMOUNT");
  if (!Number.isFinite(input.unitCost) || input.unitCost < 0) throw new Error("INVALID_PRIZE_COST");
  if (!Number.isInteger(input.quantityTotal) || input.quantityTotal < 0) throw new Error("INVALID_PRIZE_QUANTITY");

  if (input.id) {
    const current = await query<{
      id: string; season_id: string; kind: string; amount: string; quantity_total: number; quantity_remaining: number; metadata: Record<string, unknown> | null; title: string;
    }>(
      `SELECT id, season_id, kind, amount::text, quantity_total, quantity_remaining, metadata, title
         FROM prizes WHERE id = $1::uuid FOR UPDATE`,
      [input.id],
    );
    if (!current.rows[0]) throw new Error("PRIZE_NOT_FOUND");
    if (current.rows[0].season_id !== input.seasonId) throw new Error("PRIZE_SEASON_MISMATCH");

    const spinCount = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM spins WHERE season_id = $1::uuid`, [input.seasonId]);
    const hasStarted = Number(spinCount.rows[0]?.count ?? 0) > 0;
    const old = current.rows[0];
    const oldWeight = Number(old.metadata?.weight ?? 1);
    const newWeight = Number(input.metadata?.weight ?? 1);
    if (hasStarted && (old.kind !== input.kind || Number(old.amount) !== input.amount || old.quantity_total !== input.quantityTotal || oldWeight !== newWeight)) {
      throw new Error("PRIZE_ECONOMICS_LOCKED");
    }

    const won = old.quantity_total - old.quantity_remaining;
    if (input.quantityTotal < won) throw new Error("PRIZE_QUANTITY_BELOW_WON");
    const requestedRemaining = input.quantityRemaining == null
      ? Math.max(old.quantity_remaining, old.quantity_remaining + (input.quantityTotal - old.quantity_total))
      : input.quantityRemaining;
    const quantityRemaining = Math.min(input.quantityTotal, Math.max(won, Math.floor(requestedRemaining)));

    const result = await query<DbPrize>(
      `UPDATE prizes
          SET kind=$2, title=$3, subtitle=$4, amount=$5, unit_cost=$6, currency=$7,
              quantity_total=$8, quantity_remaining=$9, is_active=$10, image_url=$11,
              metadata=$12, updated_at=now()
        WHERE id=$1::uuid
        RETURNING id,season_id,kind,title,subtitle,amount,unit_cost,currency,quantity_total,quantity_remaining,is_active,image_url,metadata`,
      [input.id, input.kind, input.title.trim(), input.subtitle ?? null, input.amount, input.unitCost, input.currency ?? null, input.quantityTotal, quantityRemaining, input.active !== false, input.imageUrl ?? null, input.metadata ?? {}],
    );
    return result.rows[0];
  }

  const quantityTotal = Math.floor(input.quantityTotal);
  const quantityRemaining = Math.min(quantityTotal, Math.max(0, Math.floor(input.quantityRemaining ?? quantityTotal)));
  const result = await query<DbPrize>(
    `INSERT INTO prizes (season_id,kind,title,subtitle,amount,unit_cost,currency,quantity_total,quantity_remaining,is_active,image_url,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id,season_id,kind,title,subtitle,amount,unit_cost,currency,quantity_total,quantity_remaining,is_active,image_url,metadata`,
    [input.seasonId, input.kind, input.title.trim(), input.subtitle ?? null, input.amount, input.unitCost, input.currency ?? null, quantityTotal, quantityRemaining, input.active !== false, input.imageUrl ?? null, input.metadata ?? {}],
  );
  return result.rows[0];
}
