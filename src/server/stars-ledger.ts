import type { PoolClient } from "pg";

export const STARS_MAX_BALANCE = 500;

export type StarsLedgerEntryType =
  | "OPENING_BALANCE"
  | "REWARD"
  | "DAILY_GIFT"
  | "SPIN_SPEND"
  | "WITHDRAWAL"
  | "REFUND_REVERSAL"
  | "CAPPED_OVERFLOW_BURNED"
  | "ADMIN_CORRECTION"
  | "ADJUSTMENT";

type StarsLedgerInput = {
  userId: string;
  amount: number;
  balanceDelta?: number;
  type: StarsLedgerEntryType;
  idempotencyKey: string;
  seasonId?: string | null;
  spinId?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function appendStarsLedger(client: PoolClient, input: StarsLedgerInput) {
  if (!Number.isInteger(input.amount)) throw new Error("INVALID_STARS_LEDGER_AMOUNT");
  if (!Number.isInteger(input.balanceDelta ?? input.amount)) throw new Error("INVALID_STARS_BALANCE_DELTA");
  if (!input.idempotencyKey.trim()) throw new Error("INVALID_STARS_IDEMPOTENCY_KEY");

  await client.query(
    `INSERT INTO user_state (user_id)
     VALUES ($1::uuid)
     ON CONFLICT (user_id) DO NOTHING`,
    [input.userId],
  );

  const state = await client.query<{ stars_balance: number }>(
    `SELECT stars_balance
       FROM user_state
      WHERE user_id = $1::uuid
      FOR UPDATE`,
    [input.userId],
  );
  const currentBalance = Number(state.rows[0]?.stars_balance ?? 0);

  const balanceDelta = input.balanceDelta ?? input.amount;
  const nextBalance = currentBalance + balanceDelta;
  if (nextBalance < 0 || nextBalance > STARS_MAX_BALANCE) throw new Error("STARS_BALANCE_LIMIT");

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO stars_ledger
      (user_id, season_id, spin_id, type, amount, reference_id, idempotency_key, metadata)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id::text`,
    [
      input.userId,
      input.seasonId ?? null,
      input.spinId ?? null,
      input.type,
      input.amount,
      input.referenceId ?? null,
      input.idempotencyKey,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  if (!inserted.rows[0]) {
    const latest = await client.query<{ stars_balance: number }>(
      `SELECT stars_balance
         FROM user_state
        WHERE user_id = $1::uuid
        FOR UPDATE`,
      [input.userId],
    );
    return { inserted: false, balance: Number(latest.rows[0]?.stars_balance ?? 0) };
  }

  if (balanceDelta !== 0) {
    await client.query(
      `UPDATE user_state
          SET stars_balance = $2, updated_at = now()
        WHERE user_id = $1::uuid`,
      [input.userId, nextBalance],
    );
  } else {
    await client.query(`UPDATE user_state SET updated_at = now() WHERE user_id = $1::uuid`, [input.userId]);
  }

  return { inserted: true, balance: nextBalance };
}
