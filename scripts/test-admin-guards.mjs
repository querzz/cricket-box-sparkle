import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

async function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  const text = await fs.readFile(envPath, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i > 0 && !(i <= 0 || trimmed.slice(0, i) in process.env)) process.env[trimmed.slice(0, i)] = trimmed.slice(i + 1).replace(/^['\"]|['\"]$/g, "");
  }
}

await loadEnv();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing in .env");

const { Client } = pg;
const { updateSeason, upsertPrize } = await import("../src/server/season-service.ts");
const db = new Client({ connectionString: process.env.DATABASE_URL });
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const assert = (condition, message) => { if (!condition) throw new Error(`ASSERTION FAILED: ${message}`); };
const expectError = async (fn, expectedCode, message) => {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error && error.message === expectedCode, `${message}: expected ${expectedCode}, got ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  throw new Error(`ASSERTION FAILED: ${message}: expected ${expectedCode}`);
};

let adminId;
let userId;
let seasonId;
let prizeId;

try {
  await db.connect();
  await db.query(await fs.readFile(path.resolve(process.cwd(), "db/schema.sql"), "utf8"));

  const admin = await db.query(`INSERT INTO admins(telegram_id,username,role,is_active,is_test) VALUES($1,$2,'OWNER',TRUE,TRUE) RETURNING id::text`, [970000000 + Number(String(Date.now()).slice(-7)), `guard_${suffix}`]);
  adminId = admin.rows[0].id;
  const user = await db.query(`INSERT INTO users(telegram_id,username,first_name,is_test) VALUES($1,$2,'Guard',TRUE) RETURNING id::text`, [960000000 + Number(String(Date.now()).slice(-7)), `guard_user_${suffix}`]);
  userId = user.rows[0].id;
  const season = await db.query(`INSERT INTO seasons(code,name,state,starts_at,ends_at,paid_spin_price,paid_spin_enabled,daily_free_spin,created_by) VALUES($1,'Guard Season','DRAFT',NULL,NULL,100,TRUE,TRUE,$2) RETURNING id::text`, [`GUARD-${suffix}`, adminId]);
  seasonId = season.rows[0].id;

  const prize = await db.query(`INSERT INTO prizes(season_id,kind,title,amount,unit_cost,currency,quantity_total,quantity_remaining,is_active,metadata) VALUES($1,'STARS','Guard Stars',20,1,'XTR',10,10,TRUE,'{"weight":1}'::jsonb) RETURNING id::text`, [seasonId]);
  prizeId = prize.rows[0].id;

  const paidPayload = `paidspin:v1:${userId}:${seasonId}:guard-price-lock`;
  await db.query(`INSERT INTO star_transactions(user_id,amount,status,payload) VALUES($1,100,'PENDING',$2::jsonb)`, [userId, JSON.stringify({ payload: paidPayload, type: "PAID_SPIN", seasonId, userId })]);
  const priceAfterPendingPayment = await updateSeason(
    seasonId,
    { paidSpinPrice: 75 },
    { query: (text, values) => db.query(text, values) },
  );
  assert(priceAfterPendingPayment?.paid_spin_price === 75, "paid spin price can change while a payment is pending");
  await db.query(`UPDATE star_transactions SET status='FAILED',processed_at=now() WHERE user_id=$1::uuid AND payload->>'payload'=$2`, [userId, paidPayload]);

  const freeSpin = await db.query(`INSERT INTO spins(user_id,season_id,type,price_stars,prize_id,status) VALUES($1,$2,'FREE',0,$3::uuid,'COMPLETED') RETURNING id`, [userId, seasonId, prizeId]);
  assert(Boolean(freeSpin.rows[0]?.id), "season has a completed spin fixture");

  const priceAfterFirstSpin = await updateSeason(
    seasonId,
    { paidSpinPrice: 90 },
    { query: (text, values) => db.query(text, values) },
  );
  assert(priceAfterFirstSpin?.paid_spin_price === 90, "paid spin price can change after a spin has completed");

  await expectError(
    () => updateSeason(seasonId, { dailyFreeSpin: false }, { query: (text, values) => db.query(text, values) }),
    "FREE_ATTEMPTS_LOCKED",
    "free attempt setting is locked after first spin",
  );

  const titleUpdate = await updateSeason(seasonId, { name: "Guard Season Renamed" }, { query: (text, values) => db.query(text, values) });
  assert(titleUpdate?.name === "Guard Season Renamed", "season cosmetic name edit remains allowed");

  await expectError(
    () => upsertPrize({ id: prizeId, seasonId, kind: "STARS", title: "Guard Stars", amount: 25, unitCost: 1, currency: "XTR", quantityTotal: 10, quantityRemaining: 9, metadata: { weight: 1 } }, { query: (text, values) => db.query(text, values) }),
    "PRIZE_ECONOMICS_LOCKED",
    "prize amount is locked after season start",
  );

  const cosmeticPrize = await upsertPrize({ id: prizeId, seasonId, kind: "STARS", title: "Guard Stars Updated", amount: 20, unitCost: 1, currency: "XTR", quantityTotal: 10, quantityRemaining: 9, metadata: { weight: 1 } }, { query: (text, values) => db.query(text, values) });
  assert(cosmeticPrize.title === "Guard Stars Updated", "prize title edit remains allowed");
  assert(cosmeticPrize.quantity_remaining === 9, "remaining quantity can follow actual won inventory floor");

  await expectError(
    () => upsertPrize({ id: prizeId, seasonId, kind: "STARS", title: "Guard Stars Updated", amount: 20, unitCost: 1, currency: "XTR", quantityTotal: 10, quantityRemaining: 9, metadata: { weight: 2 } }, { query: (text, values) => db.query(text, values) }),
    "PRIZE_ECONOMICS_LOCKED",
    "prize weight is locked by default after season start",
  );

  const overridden = await upsertPrize({
    id: prizeId,
    seasonId,
    kind: "STARS",
    title: "Guard Stars Updated",
    amount: 20,
    unitCost: 1,
    currency: "XTR",
    quantityTotal: 12,
    quantityRemaining: 11,
    metadata: { weight: 2 },
    economicOverride: true,
    economicOverrideRole: "OWNER",
    economicOverrideReason: "Adjust supply after an operator correction",
  }, { query: (text, values) => db.query(text, values) });
  assert(overridden.quantity_total === 12 && overridden.quantity_remaining === 11, "owner can explicitly change quantity with a reason");
  assert(Number(overridden.metadata?.weight) === 2, "owner can explicitly change weight with a reason");

  await expectError(
    () => upsertPrize({ id: prizeId, seasonId, kind: "STARS", title: "Guard Stars Updated", amount: 25, unitCost: 1, currency: "XTR", quantityTotal: 12, quantityRemaining: 11, metadata: { weight: 2 }, economicOverride: true, economicOverrideRole: "OWNER", economicOverrideReason: "Attempt to change the payout amount" }, { query: (text, values) => db.query(text, values) }),
    "PRIZE_ECONOMICS_LOCKED",
    "owner override cannot change payout economics such as amount",
  );

  await expectError(
    () => upsertPrize({ id: prizeId, seasonId, kind: "STARS", title: "Guard Stars Updated", amount: 20, unitCost: 1, currency: "XTR", quantityTotal: 12, quantityRemaining: 11, metadata: { weight: 3 }, economicOverride: true, economicOverrideRole: "OWNER", economicOverrideReason: "no" }, { query: (text, values) => db.query(text, values) }),
    "INVALID_OVERRIDE_REASON",
    "owner override requires a sufficiently descriptive reason",
  );

  console.log("✅ Admin guard tests passed");
} finally {
  if (userId) await db.query(`DELETE FROM stars_ledger WHERE user_id=$1::uuid`, [userId]).catch(() => {});
  if (userId) await db.query(`DELETE FROM star_transactions WHERE user_id=$1::uuid`, [userId]).catch(() => {});
  if (seasonId) await db.query(`DELETE FROM spins WHERE season_id=$1`, [seasonId]).catch(() => {});
  if (seasonId) await db.query(`DELETE FROM prizes WHERE season_id=$1`, [seasonId]).catch(() => {});
  if (seasonId) await db.query(`DELETE FROM seasons WHERE id=$1::uuid`, [seasonId]).catch(() => {});
  if (userId) await db.query(`DELETE FROM user_state WHERE user_id=$1::uuid`, [userId]).catch(() => {});
  if (userId) await db.query(`DELETE FROM users WHERE id=$1::uuid`, [userId]).catch(() => {});
  if (adminId) await db.query(`DELETE FROM admins WHERE id=$1::uuid`, [adminId]).catch(() => {});
  await db.end().catch(() => {});
}
