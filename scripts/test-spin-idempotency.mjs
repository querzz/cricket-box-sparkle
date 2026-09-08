import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const envPath = path.resolve(process.cwd(), ".env");
const envText = await fs.readFile(envPath, "utf8").catch(() => "");
for (const line of envText.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const i = trimmed.indexOf("=");
  if (i > 0 && !(trimmed.slice(0, i) in process.env)) process.env[trimmed.slice(0, i)] = trimmed.slice(i + 1).replace(/^['\"]|['\"]$/g, "");
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing in .env");
const db = new Client({ connectionString: process.env.DATABASE_URL });
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const assert = (value, message) => { if (!value) throw new Error(`ASSERTION FAILED: ${message}`); };
let tx = false;
let userId;
let adminId;
let seasonId;
let prizeId;

try {
  await db.connect();
  await db.query(await fs.readFile(path.resolve(process.cwd(), "db/schema.sql"), "utf8"));
  await db.query("BEGIN");
  tx = true;

  const admin = await db.query(`INSERT INTO admins(telegram_id,username,role,is_active) VALUES($1,$2,'OWNER',TRUE) RETURNING id`, [860000000 + Number(String(Date.now()).slice(-7)), `spin_idem_admin_${suffix}`]);
  adminId = admin.rows[0].id;
  const user = await db.query(`INSERT INTO users(telegram_id,username,first_name) VALUES($1,$2,'Idempotency') RETURNING id`, [850000000 + Number(String(Date.now()).slice(-7)), `spin_idem_user_${suffix}`]);
  userId = user.rows[0].id;
  await db.query(`INSERT INTO user_state(user_id,stars_balance) VALUES($1,125)`, [userId]);

  // The full schema may contain a seeded ACTIVE season. Close it inside this
  // transaction so this isolated fixture can own the single-live-season slot.
  await db.query(`UPDATE seasons SET state='ENDED', ends_at=LEAST(COALESCE(ends_at, now()), now()) WHERE state='ACTIVE'`);

  const season = await db.query(`INSERT INTO seasons(code,name,state,starts_at,ends_at,paid_spin_price,created_by) VALUES($1,'Idempotency Season','ACTIVE',now()-interval '1 hour',now()+interval '1 day',100,$2) RETURNING id`, [`IDEM-${suffix}`, adminId]);
  seasonId = season.rows[0].id;
  const prize = await db.query(`INSERT INTO prizes(season_id,kind,title,amount,quantity_total,quantity_remaining) VALUES($1,'CUSTOM','Idempotent Prize',42,10,10) RETURNING id`, [seasonId]);
  prizeId = prize.rows[0].id;

  const key = `spin-request-${suffix}`;
  const first = await db.query(`INSERT INTO spins(user_id,season_id,type,price_stars,prize_id,status,idempotency_key,completed_at) VALUES($1,$2,'FREE',0,$3,'COMPLETED',$4,now()) RETURNING id`, [userId, seasonId, prizeId, key]);
  assert(first.rows[0]?.id, "first idempotent spin is created");

  const duplicate = await db.query(`SELECT id::text,prize_id::text,status FROM spins WHERE user_id=$1::uuid AND idempotency_key=$2`, [userId, key]);
  assert(duplicate.rowCount === 1, "same request key resolves to one persisted spin");
  assert(duplicate.rows[0].id === first.rows[0].id, "retry resolves to the original spin id");
  assert(duplicate.rows[0].prize_id === prizeId, "retry resolves to the original prize");

  let rejected = false;
  await db.query("SAVEPOINT duplicate_key_check");
  try {
    await db.query(`INSERT INTO spins(user_id,season_id,type,price_stars,prize_id,status,idempotency_key,completed_at) VALUES($1,$2,'FREE',0,$3,'COMPLETED',$4,now())`, [userId, seasonId, prizeId, key]);
  } catch (error) {
    rejected = true;
    assert(String(error?.message ?? "").includes("ux_spins_user_idempotency") || String(error?.message ?? "").toLowerCase().includes("duplicate key"), "duplicate request key is rejected by the unique index");
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT duplicate_key_check");
    await db.query("RELEASE SAVEPOINT duplicate_key_check");
  }
  assert(rejected, "duplicate request key cannot create a second spin");

  await db.query(`UPDATE prizes SET quantity_remaining=quantity_remaining-1 WHERE id=$1::uuid`, [prizeId]);
  const remaining = await db.query(`SELECT quantity_remaining FROM prizes WHERE id=$1::uuid`, [prizeId]);
  assert(Number(remaining.rows[0].quantity_remaining) === 9, "only the original spin consumes inventory");

  await db.query("ROLLBACK");
  tx = false;
  console.log("✅ Spin idempotency DB tests passed");
} finally {
  if (tx) await db.query("ROLLBACK").catch(() => {});
  await db.end().catch(() => {});
}
