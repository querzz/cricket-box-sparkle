import { randomUUID } from "node:crypto";

import { requireBotToken } from "./config";
import { query, withTransaction } from "./db";

const REFUND_PENDING_MIN_AGE_MS = 60_000;
const REFUND_CLAIM_TTL_MS = 60_000;
const MAX_BATCH = 25;

type Candidate = {
  id: string;
  userId: string;
  telegramId: string;
  chargeId: string;
  reason: string;
  lockToken: string;
};

async function refundTelegramStars(candidate: Candidate) {
  const response = await fetch(`https://api.telegram.org/bot${requireBotToken()}/refundStarPayment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: candidate.telegramId, telegram_payment_charge_id: candidate.chargeId }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json() as { ok?: boolean; description?: string };
  if (data.ok || data.description?.toUpperCase().includes("CHARGE_ALREADY_REFUNDED")) return true;
  throw new Error(data.description ?? "TELEGRAM_REFUND_FAILED");
}

async function claimRefundBatch() {
  const lockToken = randomUUID();
  const lockExpiresAt = new Date(Date.now() + REFUND_CLAIM_TTL_MS);
  const cutoff = new Date(Date.now() - REFUND_PENDING_MIN_AGE_MS);

  return withTransaction(async client => {
    const rows = await client.query<{ id:string; userId:string; telegramId:string; chargeId:string; reason:string }>(
      `SELECT st.id::text,
              st.user_id::text AS "userId",
              u.telegram_id::text AS "telegramId",
              st.telegram_charge_id AS "chargeId",
              COALESCE(st.payload->>'refundReason','UNKNOWN') AS reason
         FROM star_transactions st
         JOIN users u ON u.id=st.user_id
        WHERE st.status='REFUND_PENDING'
          AND st.telegram_charge_id IS NOT NULL
          AND st.created_at < $1
          AND (
            st.payload->>'refundRecoveryLockExpiresAt' IS NULL
            OR (st.payload->>'refundRecoveryLockExpiresAt')::timestamptz <= now()
          )
        ORDER BY st.created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [cutoff, MAX_BATCH],
    );

    const claimed: Candidate[] = [];
    for (const row of rows.rows) {
      const updated = await client.query<{ id:string }>(
        `UPDATE star_transactions
            SET payload=payload||$2::jsonb
          WHERE id=$1::uuid
            AND status='REFUND_PENDING'
        RETURNING id::text`,
        [row.id, JSON.stringify({ refundRecoveryLockToken: lockToken, refundRecoveryLockExpiresAt: lockExpiresAt.toISOString() })],
      );
      if (updated.rows[0]) claimed.push({ ...row, lockToken });
    }
    return claimed;
  });
}

async function markRefunded(candidate: Candidate) {
  const updated = await query<{ id: string }>(
    `UPDATE star_transactions
        SET status='REFUNDED',processed_at=now(),payload=(payload||$3::jsonb)-'refundRecoveryLockToken'-'refundRecoveryLockExpiresAt'
      WHERE id=$1::uuid
        AND status='REFUND_PENDING'
        AND payload->>'refundRecoveryLockToken'=$2
    RETURNING id::text`,
    [candidate.id, candidate.lockToken, JSON.stringify({ refundRecoveredAt: new Date().toISOString() })],
  );
  if (!updated.rows[0]) return false;

  await query(
    `INSERT INTO audit_logs(action,entity_type,entity_id,after_data)
     VALUES('PAID_SPIN_REFUND_RECOVERED','star_transaction',$1,$2::jsonb)`,
    [candidate.id, JSON.stringify({ userId: candidate.userId, telegramId: candidate.telegramId, chargeId: candidate.chargeId, reason: candidate.reason })],
  );
  return true;
}

async function recordRefundFailure(candidate: Candidate, error: unknown) {
  await query(
    `UPDATE star_transactions
        SET payload=((payload||$2::jsonb)-'refundRecoveryLockToken'-'refundRecoveryLockExpiresAt')
      WHERE id=$1::uuid
        AND status='REFUND_PENDING'
        AND payload->>'refundRecoveryLockToken'=$3`,
    [candidate.id, JSON.stringify({ refundLastAttemptAt: new Date().toISOString(), refundLastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) }), candidate.lockToken],
  );
}

export async function reconcilePendingPaymentRefunds() {
  const candidates = await claimRefundBatch();
  if (!candidates.length) return { found: 0, refunded: 0, pending: 0 };

  let refunded = 0;
  let pending = 0;
  const results = await Promise.allSettled(candidates.map(async candidate => {
    try {
      await refundTelegramStars(candidate);
      return (await markRefunded(candidate)) ? "REFUNDED" as const : "PENDING" as const;
    } catch (error) {
      await recordRefundFailure(candidate, error);
      return "PENDING" as const;
    }
  }));

  for (const result of results) {
    if (result.status === "fulfilled" && result.value === "REFUNDED") refunded += 1;
    else pending += 1;
  }

  return { found: candidates.length, refunded, pending };
}
