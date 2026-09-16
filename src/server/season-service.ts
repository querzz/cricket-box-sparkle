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
  paid_spin_enabled: boolean;
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
type SeasonState = (typeof SEASON_STATES)[number];
const ALLOWED_TRANSITIONS: Record<SeasonState, readonly SeasonState[]> = {
  DRAFT: ["DRAFT", "SCHEDULED", "ACTIVE", "CLOSED"],
  SCHEDULED: ["SCHEDULED", "DRAFT", "ACTIVE", "CLOSED"],
  ACTIVE: ["ACTIVE", "ENDING", "CLOSED"],
  ENDING: ["ENDING", "CLOSED"],
  CLOSED: ["CLOSED", "PAYOUT", "ARCHIVED"],
  PAYOUT: ["PAYOUT", "ARCHIVED"],
  ARCHIVED: ["ARCHIVED"],
};
const PRIZE_KINDS = ["STARS", "PREMIUM", "MONEY", "NFT", "PHYSICAL", "CUSTOM", "FREE_SPIN", "EMPTY"] as const;

type DbExecutor = Pick<PoolClient, "query">;
type PrizeMetadata = Record<string, unknown>;

function validatePrizeWeight(metadata: PrizeMetadata | undefined | null) {
  const raw = metadata?.weight;
  if (raw === undefined || raw === null || raw === "") return 1;

  const weight = Number(raw);
  if (!Number.isFinite(weight) || weight < 0) throw new Error("INVALID_PRIZE_WEIGHT");
  return weight;
}

async function ensurePlayablePrizePool(db: DbExecutor, seasonId: string) {
  const result = await db.query<{ kind: string; quantity_remaining: number; metadata: PrizeMetadata | null; is_active: boolean }>(
    `SELECT kind, quantity_remaining, metadata, is_active
       FROM prizes
      WHERE season_id = $1::uuid`,
    [seasonId],
  );

  const playable = result.rows.some((prize) => {
    if (!prize.is_active || prize.quantity_remaining <= 0) return false;
    const weight = validatePrizeWeight(prize.metadata);
    return weight > 0;
  });

  if (!playable) throw new Error("SEASON_PRIZE_POOL_INVALID");
}

export async function listSeasons() {
  const result = await query<DbSeason>(`SELECT id, code, name, state, starts_at, ends_at, paid_spin_price, paid_spin_enabled, daily_free_spin FROM seasons ORDER BY created_at DESC`);
  return result.rows;
}

export async function createSeason(input: { code: string; name: string; paidSpinPrice: number; paidSpinEnabled?: boolean; dailyFreeSpin: boolean; adminId: string }) {
  if (!Number.isSafeInteger(input.paidSpinPrice) || input.paidSpinPrice <= 0) throw new Error("INVALID_PAID_SPIN_PRICE");
  const result = await query<DbSeason>(`INSERT INTO seasons (code, name, paid_spin_price, paid_spin_enabled, daily_free_spin, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, code, name, state, starts_at, ends_at, paid_spin_price, paid_spin_enabled, daily_free_spin`, [input.code, input.name, input.paidSpinPrice, input.paidSpinEnabled !== false, input.dailyFreeSpin, input.adminId]);
  return result.rows[0];
}

export async function updateSeason(id: string, patch: Partial<{ code: string; name: string; state: DbSeason["state"]; startsAt: string | null; endsAt: string | null; paidSpinPrice: number; paidSpinEnabled: boolean; dailyFreeSpin: boolean }>, executor?: DbExecutor) {
  const db: DbExecutor = executor ?? ({ query: (text: string, values?: unknown[]) => query(text, values) } as DbExecutor);
  const currentResult = await db.query<DbSeason>(`SELECT id, code, name, state, starts_at, ends_at, paid_spin_price, paid_spin_enabled, daily_free_spin FROM seasons WHERE id = $1 FOR UPDATE`, [id]);
  if (!currentResult.rows[0]) return undefined;

  const current = currentResult.rows[0];
  const requestedState = patch.state;
  if (requestedState && !SEASON_STATES.includes(requestedState)) throw new Error("INVALID_STATE");
  const nextState = requestedState ?? current.state;
  if (!ALLOWED_TRANSITIONS[current.state].includes(nextState)) throw new Error("INVALID_SEASON_TRANSITION");

  const startsAt = patch.startsAt === undefined ? current.starts_at : patch.startsAt;
  const endsAt = patch.endsAt === undefined ? current.ends_at : patch.endsAt;
  const currentStart = current.starts_at ? new Date(current.starts_at) : null;
  const currentEnd = current.ends_at ? new Date(current.ends_at) : null;
  const now = new Date();
  const parsedStart = startsAt ? new Date(startsAt) : null;
  const parsedEnd = endsAt ? new Date(endsAt) : null;
  if (startsAt && (!parsedStart || Number.isNaN(parsedStart.getTime()))) throw new Error("INVALID_START_DATE");
  if (endsAt && (!parsedEnd || Number.isNaN(parsedEnd.getTime()))) throw new Error("INVALID_END_DATE");
  if (parsedStart && parsedEnd && parsedStart >= parsedEnd) throw new Error("INVALID_SEASON_DATES");

  const hasStarted = current.state !== "DRAFT" && current.state !== "SCHEDULED" || Boolean(currentStart && currentStart <= now);
  const startChanged = parsedStart && currentStart
    ? parsedStart.getTime() !== currentStart.getTime()
    : parsedStart !== currentStart;
  if (hasStarted && startChanged) throw new Error("SEASON_START_LOCKED");
  if (hasStarted && currentEnd && parsedEnd && parsedEnd < currentEnd) throw new Error("SEASON_END_CANNOT_BE_SHORTENED");
  if (hasStarted && currentEnd && endsAt === null) throw new Error("SEASON_END_CANNOT_BE_REMOVED");
  if (nextState === "SCHEDULED" && (!parsedStart || parsedStart <= now)) throw new Error("SCHEDULED_START_MUST_BE_FUTURE");
  if (["ACTIVE", "ENDING"].includes(nextState) && (!parsedStart || parsedStart > now)) throw new Error("ACTIVE_START_MUST_BE_NOW_OR_PAST");
  if (["ACTIVE", "ENDING"].includes(nextState) && parsedEnd && parsedEnd <= now) throw new Error("SEASON_END_ALREADY_PASSED");

  const requestedPrice = patch.paidSpinPrice;
  if (requestedPrice !== undefined && (!Number.isSafeInteger(requestedPrice) || requestedPrice <= 0)) throw new Error("INVALID_PAID_SPIN_PRICE");

  const paidSpinHasStartedResult = await db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM spins WHERE season_id = $1::uuid AND type = 'PAID'`, [id]);
  const paidSpinHasStarted = Number(paidSpinHasStartedResult.rows[0]?.count ?? 0) > 0;
  if (paidSpinHasStarted && requestedPrice !== undefined && requestedPrice !== current.paid_spin_price) throw new Error("PAID_SPIN_PRICE_LOCKED");
  if (hasStarted && patch.paidSpinEnabled === true && current.paid_spin_enabled === false) throw new Error("PAID_SPIN_REENABLE_LOCKED");

  if (nextState === "ACTIVE" || nextState === "ENDING") {
    await ensurePlayablePrizePool(db, id);
    await db.query(`UPDATE seasons SET state = 'CLOSED', updated_at = now() WHERE id <> $1 AND state IN ('ACTIVE','ENDING')`, [id]);
  }

  const result = await db.query<DbSeason>(
    `UPDATE seasons SET code = COALESCE($2, code), name = COALESCE($3, name), state = $4, starts_at = $5, ends_at = $6, paid_spin_price = COALESCE($7, paid_spin_price), paid_spin_enabled = COALESCE($8, paid_spin_enabled), daily_free_spin = COALESCE($9, daily_free_spin), updated_at = now() WHERE id = $1 RETURNING id, code, name, state, starts_at, ends_at, paid_spin_price, paid_spin_enabled, daily_free_spin`,
    [id, patch.code ?? null, patch.name ?? null, nextState, startsAt, endsAt, requestedPrice ?? null, patch.paidSpinEnabled ?? null, patch.dailyFreeSpin ?? null],
  );
  return result.rows[0];
}

export async function listPrizes(seasonId: string) {
  const result = await query<DbPrize>(`SELECT id, season_id, kind, title, subtitle, amount, unit_cost, currency, quantity_total, quantity_remaining, is_active, image_url, metadata FROM prizes WHERE season_id = $1 ORDER BY created_at ASC`, [seasonId]);
  return result.rows;
}

export async function upsertPrize(input: { id?: string; seasonId: string; kind: string; title: string; subtitle?: string | null; amount: number; unitCost: number; currency?: string | null; quantityTotal: number; quantityRemaining?: number; active?: boolean; imageUrl?: string | null; metadata?: Record<string, unknown> }) {
  if (!PRIZE_KINDS.includes(input.kind as (typeof PRIZE_KINDS)[number])) throw new Error("INVALID_PRIZE_KIND");
  if (!input.title.trim()) throw new Error("INVALID_PRIZE_TITLE");
  if (!Number.isFinite(input.amount) || input.amount < 0) throw new Error("INVALID_PRIZE_AMOUNT");
  if (!Number.isFinite(input.unitCost) || input.unitCost < 0) throw new Error("INVALID_PRIZE_COST");
  if (!Number.isInteger(input.quantityTotal) || input.quantityTotal < 0) throw new Error("INVALID_PRIZE_QUANTITY");
  validatePrizeWeight(input.metadata);

  if (input.id) {
    const current = await query<{ id: string; season_id: string; kind: string; amount: string; unit_cost: string; currency: string | null; quantity_total: number; quantity_remaining: number; metadata: Record<string, unknown> | null; title: string }>(`SELECT id, season_id, kind, amount::text, unit_cost::text, currency, quantity_total, quantity_remaining, metadata, title FROM prizes WHERE id = $1::uuid FOR UPDATE`, [input.id]);
    if (!current.rows[0]) throw new Error("PRIZE_NOT_FOUND");
    if (current.rows[0].season_id !== input.seasonId) throw new Error("PRIZE_SEASON_MISMATCH");

    const seasonState = await query<{ state: SeasonState }>(`SELECT state FROM seasons WHERE id = $1::uuid FOR UPDATE`, [input.seasonId]);
    if (!seasonState.rows[0]) throw new Error("SEASON_NOT_FOUND");
    const spinCount = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM spins WHERE season_id = $1::uuid`, [input.seasonId]);
    const hasStarted = seasonState.rows[0].state === "ACTIVE" || seasonState.rows[0].state === "ENDING" || Number(spinCount.rows[0]?.count ?? 0) > 0;
    const old = current.rows[0];
    const oldWeight = validatePrizeWeight(old.metadata);
    const newWeight = validatePrizeWeight(input.metadata);
    const oldUnitCost = Number(old.unit_cost);
    const newUnitCost = input.unitCost;
    const oldCurrency = old.currency ?? null;
    const newCurrency = input.currency ?? null;
    if (hasStarted && (old.kind !== input.kind || Number(old.amount) !== input.amount || oldUnitCost !== newUnitCost || oldCurrency !== newCurrency || old.quantity_total !== input.quantityTotal || oldWeight !== newWeight)) throw new Error("PRIZE_ECONOMICS_LOCKED");

    const won = old.quantity_total - old.quantity_remaining;
    if (input.quantityTotal < won) throw new Error("PRIZE_QUANTITY_BELOW_WON");
    const requestedRemaining = input.quantityRemaining == null ? Math.max(old.quantity_remaining, old.quantity_remaining + (input.quantityTotal - old.quantity_total)) : input.quantityRemaining;
    const quantityRemaining = Math.min(input.quantityTotal, Math.max(won, Math.floor(requestedRemaining)));

    const result = await query<DbPrize>(`UPDATE prizes SET kind=$2, title=$3, subtitle=$4, amount=$5, unit_cost=$6, currency=$7, quantity_total=$8, quantity_remaining=$9, is_active=$10, image_url=$11, metadata=$12, updated_at=now() WHERE id=$1::uuid RETURNING id,season_id,kind,title,subtitle,amount,unit_cost,currency,quantity_total,quantity_remaining,is_active,image_url,metadata`, [input.id, input.kind, input.title.trim(), input.subtitle ?? null, input.amount, input.unitCost, input.currency ?? null, input.quantityTotal, quantityRemaining, input.active !== false, input.imageUrl ?? null, input.metadata ?? {}]);
    return result.rows[0];
  }

  const quantityTotal = Math.floor(input.quantityTotal);
  const quantityRemaining = Math.min(quantityTotal, Math.max(0, Math.floor(input.quantityRemaining ?? quantityTotal)));
  const result = await query<DbPrize>(`INSERT INTO prizes (season_id,kind,title,subtitle,amount,unit_cost,currency,quantity_total,quantity_remaining,is_active,image_url,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,season_id,kind,title,subtitle,amount,unit_cost,currency,quantity_total,quantity_remaining,is_active,image_url,metadata`, [input.seasonId, input.kind, input.title.trim(), input.subtitle ?? null, input.amount, input.unitCost, input.currency ?? null, quantityTotal, quantityRemaining, input.active !== false, input.imageUrl ?? null, input.metadata ?? {}]);
  return result.rows[0];
}
