import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is missing in DATABASE_URL");
process.env.TELEGRAM_BOT_TOKEN ??= "payment-recovery-test-token";

const { reconcilePendingPaymentRefunds } = await import("../src/server/payment-recovery.ts");

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const db = new Client({ connectionString: databaseUrl });
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let userId;
let seasonId;
let adminId;

const originalFetch = globalThis.fetch;
let refundCalls = 0;
let failNextRefund = false;
globalThis.fetch = async () => {
  refundCalls += 1;
  if (failNextRefund) {
    failNextRefund = false;
    throw new Error("SIMULATED_TELEGRAM_REFUND_FAILURE");
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  return new Response(JSON.stringify({ ok: true, result: true }), { status: 200, headers: { "content-type": "application/json" } });
};

try {
  await db.connect();
  await db.query(await fs.readFile(path.resolve(process.cwd(), "db/schema.sql"), "utf8"));

  const admin = await db.query(`INSERT INTO admins(telegram_id,username,role,is_active,is_test) VALUES($1,$2,'OWNER',TRUE,TRUE) RETURNING id::text`, [940000000 + Number(String(Date.now()).slice(-7)), `recovery_${suffix}`]);
  adminId = admin.rows[0].id;
  const user = await db.query(`INSERT INTO users(telegram_id,username,first_name,is_test) VALUES($1,$2,'Recovery',TRUE) RETURNING id::text`, [950000000 + Number(String(Date.now()).slice(-7)), `recovery_${suffix}`]);
  userId = user.rows[0].id;
  const season = await db.query(`INSERT INTO seasons(code,name,state,paid_spin_price,created_by) VALUES($1,'Recovery Test','DRAFT',100,$2) RETURNING id::text`, [`RECOVERY-${suffix}`, adminId]);
  seasonId = season.rows[0].id;

  const chargeId = `recovery-charge-${suffix}`;
  const inserted = await db.query(
    `INSERT INTO star_transactions(user_id,amount,status,telegram_charge_id,payload,created_at)
     VALUES($1,100,'REFUND_PENDING',$2,$3::jsonb,now()-interval '10 minutes') RETURNING id::text`,
    [userId, chargeId, JSON.stringify({ type: "DUPLICATE_CHARGE_REFUND", seasonId, userId, refundReason: "TEST_CONCURRENT_RECOVERY", refundPending: true })],
  );

  const concurrent = await Promise.all([reconcilePendingPaymentRefunds(), reconcilePendingPaymentRefunds()]);
  assert(concurrent.reduce((sum, result) => sum + result.refunded, 0) === 1, "concurrent recovery runs refund one obligation exactly once");
  assert(concurrent.reduce((sum, result) => sum + result.found, 0) === 1, "concurrent recovery runs claim one obligation exactly once");
  assert(refundCalls === 1, "concurrent recovery runs call Telegram refund exactly once");

  const settled = await db.query(`SELECT status,payload->>'refundRecoveryLockToken' AS lock_token,payload->>'refundRecoveryLockExpiresAt' AS lock_expires FROM star_transactions WHERE id=$1::uuid`, [inserted.rows[0].id]);
  assert(settled.rows[0]?.status === "REFUNDED", "successful recovery marks the transaction refunded");
  assert(!settled.rows[0]?.lock_token && !settled.rows[0]?.lock_expires, "successful recovery removes its temporary claim lock");

  const retry = await db.query(
    `INSERT INTO star_transactions(user_id,amount,status,telegram_charge_id,payload,created_at)
     VALUES($1,100,'REFUND_PENDING',$2,$3::jsonb,now()-interval '10 minutes') RETURNING id::text`,
    [userId, `recovery-retry-${suffix}`, JSON.stringify({ type: "DUPLICATE_CHARGE_REFUND", seasonId, userId, refundReason: "TEST_RETRY", refundPending: true })],
  );
  failNextRefund = true;
  const firstRetry = await reconcilePendingPaymentRefunds();
  assert(firstRetry.pending === 1 && firstRetry.refunded === 0, "failed Telegram refund stays pending");
  const afterFailure = await db.query(`SELECT status,payload->>'refundRecoveryLockToken' AS lock_token,payload->>'refundLastError' AS last_error FROM star_transactions WHERE id=$1::uuid`, [retry.rows[0].id]);
  assert(afterFailure.rows[0]?.status === "REFUND_PENDING", "failed recovery keeps refund obligation pending");
  assert(!afterFailure.rows[0]?.lock_token, "failed recovery releases its temporary claim lock");
  assert(afterFailure.rows[0]?.last_error === "SIMULATED_TELEGRAM_REFUND_FAILURE", "failed recovery records the last Telegram error");

  const secondRetry = await reconcilePendingPaymentRefunds();
  assert(secondRetry.refunded === 1, "next recovery retries a previously failed refund");
  const retried = await db.query(`SELECT status FROM star_transactions WHERE id=$1::uuid`, [retry.rows[0].id]);
  assert(retried.rows[0]?.status === "REFUNDED", "retried refund ends in REFUNDED state");

  console.log("✅ Payment recovery concurrency tests passed");
} finally {
  globalThis.fetch = originalFetch;
  if (adminId || userId || seasonId) {
    await db.query(`DELETE FROM star_transactions WHERE user_id=$1::uuid OR telegram_charge_id LIKE $2`, [userId, `recovery-%${suffix}`]).catch(() => {});
    if (userId) await db.query(`DELETE FROM user_state WHERE user_id=$1::uuid`, [userId]).catch(() => {});
    if (userId) await db.query(`DELETE FROM users WHERE id=$1::uuid`, [userId]).catch(() => {});
    if (seasonId) await db.query(`DELETE FROM seasons WHERE id=$1::uuid`, [seasonId]).catch(() => {});
    if (adminId) await db.query(`DELETE FROM admins WHERE id=$1::uuid`, [adminId]).catch(() => {});
  }
  await db.end().catch(() => {});
}
