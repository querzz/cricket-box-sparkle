import { requireBotToken } from "@/server/config";
import { query } from "@/server/db";

const REFUND_PENDING_MIN_AGE_MS = 60_000;
const MAX_BATCH = 25;

type Candidate = {
  id: string;
  userId: string;
  telegramId: string;
  chargeId: string;
  reason: string;
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

async function markRefunded(candidate: Candidate) {
  const updated = await query<{ id: string }>(
    `UPDATE star_transactions
        SET status='REFUNDED',processed_at=now(),payload=payload||$2::jsonb
      WHERE id=$1::uuid AND status='REFUND_PENDING'
      RETURNING id::text`,
    [candidate.id, JSON.stringify({ refundRecoveredAt: new Date().toISOString() })],
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
        SET payload=payload||$2::jsonb
      WHERE id=$1::uuid AND status='REFUND_PENDING'`,
    [candidate.id, JSON.stringify({ refundLastAttemptAt: new Date().toISOString(), refundLastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) })],
  );
}

export async function reconcilePendingPaymentRefunds() {
  const cutoff = new Date(Date.now() - REFUND_PENDING_MIN_AGE_MS);
  const rows = await query<Candidate>(
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
      ORDER BY st.created_at ASC
      LIMIT $2`,
    [cutoff, MAX_BATCH],
  );

  if (!rows.rows.length) return { found: 0, refunded: 0, pending: 0 };

  let refunded = 0;
  let pending = 0;
  const results = await Promise.allSettled(rows.rows.map(async candidate => {
    try {
      const refundAccepted = await refundTelegramStars(candidate);
      if (!refundAccepted) return "PENDING" as const;
      const marked = await markRefunded(candidate);
      return marked ? "REFUNDED" as const : "PENDING" as const;
    } catch (error) {
      await recordRefundFailure(candidate, error);
      return "PENDING" as const;
    }
  }));

  for (const result of results) {
    if (result.status === "fulfilled" && result.value === "REFUNDED") refunded += 1;
    else pending += 1;
  }

  return { found: rows.rows.length, refunded, pending };
}
