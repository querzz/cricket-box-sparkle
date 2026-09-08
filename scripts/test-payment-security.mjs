import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

async function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  const text = await fs.readFile(envPath, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function expectReject(fn, message) {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(`ASSERTION FAILED: ${message}`);
}

await loadEnv();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is missing in .env");

const db = new Client({ connectionString: databaseUrl });
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let admin;
let user;
let season;

try {
  await db.connect();
  await db.query(await fs.readFile(path.resolve(process.cwd(), "db/schema.sql"), "utf8"));
  await db.query("BEGIN");

  const adminResult = await db.query(
    `INSERT INTO admins(telegram_id,username,role,is_active)
     VALUES($1,$2,'OWNER',TRUE) RETURNING id`,
    [980000000 + Number(String(Date.now()).slice(-7)), `payment_security_${suffix}`],
  );
  admin = adminResult.rows[0].id;

  const userResult = await db.query(
    `INSERT INTO users(telegram_id,username,first_name)
     VALUES($1,$2,'Security') RETURNING id`,
    [990000000 + Number(String(Date.now()).slice(-7)), `payment_security_${suffix}`],
  );
  user = userResult.rows[0].id;
  await db.query(`INSERT INTO user_state(user_id,stars_balance) VALUES($1,125)`, [user]);

  // The payment-security assertions below exercise transaction/idempotency invariants,
  // not season activation. Keep the fixture non-live so the test can run safely against
  // a development database that already has an ACTIVE/ENDING season protected by
  // ux_one_live_season.
  const seasonResult = await db.query(
    `INSERT INTO seasons(code,name,state,starts_at,ends_at,paid_spin_price,created_by)
     VALUES($1,'Payment Security','DRAFT',NULL,NULL,100,$2) RETURNING id`,
    [`PAYSEC-${suffix}`, admin],
  );
  season = seasonResult.rows[0].id;

  const payload = `paidspin:v1:${user}:${season}:security`;
  const chargeId = `security-charge-${suffix}`;
  const first = await db.query(
    `INSERT INTO star_transactions(user_id,amount,status,payload,telegram_charge_id)
     VALUES($1,100,'PENDING',$2,$3) RETURNING id`,
    [user, JSON.stringify({ payload, type: "PAID_SPIN", seasonId: season, userId: user }), chargeId],
  );

  await expectReject(
    () => db.query(
      `INSERT INTO star_transactions(user_id,amount,status,payload,telegram_charge_id)
       VALUES($1,100,'PENDING',$2,$3)`,
      [user,  JSON.stringify({ payload: `${payload}:replay`, type: "PAID_SPIN", seasonId: season, userId: user }), chargeId],
    ),
    "replayed Telegram charge id cannot create a second transaction",
  );

  await db.query(
    `UPDATE star_transactions SET status='SUCCESS',processed_at=now(),spin_id=NULL WHERE id=$1`,
    [first.rows[0].id],
  );

  await db.query(
    `INSERT INTO star_transactions(user_id,amount,status,payload)
     VALUES($1,100,'PENDING',$2)`,
    [user, JSON.stringify({ payload: `${payload}:second`, type: "PAID_SPIN", seasonId: season, userId: user })],
  );

  await expectReject(
    () => db.query(
      `INSERT INTO star_transactions(user_id,amount,status,payload)
       VALUES($1,100,'PENDING',$2)`,
      [user, JSON.stringify({ payload: `${payload}:third`, type: "PAID_SPIN", seasonId: season, userId: user })],
    ),
    "double-click cannot create two pending paid spins for one user and season",
  );

  const ledgerKey = `payment-security:${suffix}`;
  await db.query(
    `INSERT INTO stars_ledger(user_id,season_id,type,amount,idempotency_key,metadata)
     VALUES($1,$2,'ADJUSTMENT',0,$3,'{}'::jsonb)`,
    [user, season, ledgerKey],
  );
  await expectReject(
    () => db.query(
      `INSERT INTO stars_ledger(user_id,season_id,type,amount,idempotency_key,metadata)
       VALUES($1,$2,'ADJUSTMENT',0,$3,'{}'::jsonb)`,
      [user, season, ledgerKey],
    ),
    "replayed settlement cannot duplicate a ledger idempotency key",
  );

  const raceChargeId = `security-race-${suffix}`;
  const racePayload = `${payload}:race`;
  const insertCharge = async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO star_transactions(user_id,amount,status,payload,telegram_charge_id)
         VALUES($1,100,'PENDING',$2,$3) RETURNING id`,
        [user, 100, JSON.stringify({ payload: racePayload, type: "PAID_SPIN", seasonId: season, userId: user }), raceChargeId],
      );
      await client.query("COMMIT");
      return { ok: true, id: result.rows[0].id };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      return { ok: false, error };
    } finally {
      await client.end();
    }
  };

  await db.query(`UPDATE star_transactions SET status='SUCCESS',processed_at=now() WHERE user_id=$1 AND status='PENDING'`, [user]);
  const race = await Promise.all([insertCharge(), insertCharge()]);
  assert(race.filter((item) => item.ok).length === 1, "concurrent replay of one Telegram charge has exactly one winner");

  const duplicateCount = await db.query(`SELECT COUNT(*)::int AS count FROM star_transactions WHERE telegram_charge_id=$1`, [raceChargeId]);
  assert(Number(duplicateCount.rows[0].count) === 1, "Telegram charge id remains globally unique");

  await db.query("ROLLBACK");
  console.log("✅ Payment security DB tests passed");
} finally {
  if (admin || user || season) {
    await db.query("ROLLBACK").catch(() => {});
  }
  await db.end().catch(() => {});
}
