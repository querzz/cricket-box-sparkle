import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const envPath = path.resolve(process.cwd(), ".env");
const env = await fs.readFile(envPath, "utf8").catch(() => "");
for (const line of env.split(/\r?\n/)) {
  const value = line.trim();
  if (!value || value.startsWith("#")) continue;
  const i = value.indexOf("=");
  if (i > 0 && !(value.slice(0, i).trim() in process.env)) process.env[value.slice(0, i).trim()] = value.slice(i + 1).trim().replace(/^['\"]|['\"]$/g, "");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is missing in .env");
const db = new Client({ connectionString: databaseUrl });
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let adminId;
let userId;
let seasonId;
let spinId;
let payoutId;
function assert(condition, message) { if (!condition) throw new Error(`ASSERTION FAILED: ${message}`); }

try {
  await db.connect();
  await db.query(await fs.readFile(path.resolve(process.cwd(), "db/schema.sql"), "utf8"));
  const admin = await db.query(`INSERT INTO admins(telegram_id,username,role,is_active) VALUES($1,$2,'OWNER',TRUE) RETURNING id`, [960000000 + Number(String(Date.now()).slice(-7)), `payout_test_${suffix}`]);
  adminId = admin.rows[0].id;
  const user = await db.query(`INSERT INTO users(telegram_id,username,first_name) VALUES($1,$2,'Payout') RETURNING id`, [970000000 + Number(String(Date.now()).slice(-7)), `payout_user_${suffix}`]);
  userId = user.rows[0].id;
  const season = await db.query(`INSERT INTO seasons(code,name,state,paid_spin_price,created_by) VALUES($1,'Payout Test','CLOSED',100,$2) RETURNING id`, [`PAYOUT-${suffix}`, adminId]);
  seasonId = season.rows[0].id;
  const prize = await db.query(`INSERT INTO prizes(season_id,kind,title,amount,quantity_total,quantity_remaining,is_active) VALUES($1,'NFT','Test NFT',0,1,1,TRUE) RETURNING id`, [seasonId]);
  const spin = await db.query(`INSERT INTO spins(user_id,season_id,type,price_stars,prize_id,status,completed_at) VALUES($1,$2,'FREE',0,$3,'COMPLETED',now()) RETURNING id`, [userId, seasonId, prize.rows[0].id]);
  spinId = spin.rows[0].id;
  const payout = await db.query(`INSERT INTO payouts(spin_id,user_id,prize_id,kind,amount,status,note,fulfillment_provider) VALUES($1,$2,$3,'NFT',0,'PENDING','Награда ожидает ручной выдачи администратором.','MANUAL') RETURNING id`, [spinId, userId, prize.rows[0].id]);
  payoutId = payout.rows[0].id;
  const pending = await db.query(`SELECT status,fulfillment_provider,fulfillment_reference,fulfillment_note,fulfillment_metadata FROM payouts WHERE id=$1`, [payoutId]);
  assert(pending.rows[0]?.status === "PENDING", "new payout starts pending");
  assert(pending.rows[0]?.fulfillment_provider === "MANUAL", "manual provider is explicit");

  await db.query(`UPDATE payouts SET status='REVIEW',operator_admin_id=$2,updated_at=now() WHERE id=$1`, [payoutId, adminId]);
  await db.query(`UPDATE payouts SET status='PAID',operator_admin_id=$2,fulfillment_reference=$3,fulfillment_note=$4,fulfillment_metadata=$5::jsonb,paid_at=now(),updated_at=now() WHERE id=$1`, [payoutId, adminId, `tx:${suffix}`, "Sent to winner", JSON.stringify({ provider: "MANUAL", channel: "test" })]);
  const paid = await db.query(`SELECT status,operator_admin_id::text AS operator_admin_id,fulfillment_provider,fulfillment_reference,fulfillment_note,fulfillment_metadata,paid_at FROM payouts WHERE id=$1`, [payoutId]);
  assert(paid.rows[0]?.status === "PAID", "payout can be completed");
  assert(paid.rows[0]?.operator_admin_id === adminId, "operator is persisted");
  assert(paid.rows[0]?.fulfillment_provider === "MANUAL", "provider is persisted");
  assert(paid.rows[0]?.fulfillment_reference === `tx:${suffix}`, "fulfillment reference is persisted");
  assert(paid.rows[0]?.fulfillment_note === "Sent to winner", "fulfillment note is persisted");
  assert(paid.rows[0]?.fulfillment_metadata?.channel === "test", "provider metadata is persisted");
  assert(paid.rows[0]?.paid_at, "paid timestamp is recorded");

  await db.query(`DELETE FROM payouts WHERE id=$1`, [payoutId]);
  const removed = await db.query(`SELECT 1 FROM payouts WHERE id=$1`, [payoutId]);
  assert(removed.rowCount === 0, "test payout cleanup succeeds");
  console.log("✅ Payout lifecycle tests passed");
} finally {
  await db.query(`DELETE FROM payouts WHERE id=$1`, [payoutId]).catch(() => {});
  await db.query(`DELETE FROM spins WHERE id=$1`, [spinId]).catch(() => {});
  await db.query(`DELETE FROM prizes WHERE season_id=$1`, [seasonId]).catch(() => {});
  await db.query(`DELETE FROM seasons WHERE id=$1`, [seasonId]).catch(() => {});
  await db.query(`DELETE FROM user_state WHERE user_id=$1`, [userId]).catch(() => {});
  await db.query(`DELETE FROM users WHERE id=$1`, [userId]).catch(() => {});
  await db.query(`DELETE FROM admins WHERE id=$1`, [adminId]).catch(() => {});
  await db.end().catch(() => {});
}
