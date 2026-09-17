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
    if (i > 0) process.env[trimmed.slice(0, i)] = process.env[trimmed.slice(0, i)] ?? trimmed.slice(i + 1).replace(/^['\"]|['\"]$/g, "");
  }
}

await loadEnv();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing in .env");

const { Client } = pg;
const { appendStarsLedger } = await import("../src/server/stars-ledger.ts");
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

let userId;

try {
  await db.connect();
  await db.query(await fs.readFile(path.resolve(process.cwd(), "db/schema.sql"), "utf8"));
  const user = await db.query(`INSERT INTO users(telegram_id,username,first_name) VALUES($1,$2,'Ledger') RETURNING id::text`, [950000000 + Number(String(Date.now()).slice(-7)), `ledger_${suffix}`]);
  userId = user.rows[0].id;

  await db.query("BEGIN");
  const first = await appendStarsLedger(db, {
    userId,
    amount: 20,
    type: "ADJUSTMENT",
    idempotencyKey: `ledger-test:${suffix}`,
    referenceId: "reference-a",
    metadata: { source: "test" },
  });
  assert(first.inserted === true && first.balance === 145, "first ledger entry inserts and updates opening balance");

  const replay = await appendStarsLedger(db, {
    userId,
    amount: 20,
    type: "ADJUSTMENT",
    idempotencyKey: `ledger-test:${suffix}`,
    referenceId: "reference-a",
    metadata: { source: "test" },
  });
  assert(replay.inserted === false && replay.balance === 145, "identical idempotent replay does not change balance");

  await expectError(
    () => appendStarsLedger(db, {
      userId,
      amount: 21,
      type: "ADJUSTMENT",
      idempotencyKey: `ledger-test:${suffix}`,
      referenceId: "reference-a",
    }),
    "STARS_LEDGER_IDEMPOTENCY_MISMATCH",
    "reusing an idempotency key with another amount is rejected",
  );

  const balance = await db.query(`SELECT stars_balance FROM user_state WHERE user_id=$1::uuid`, [userId]);
  const entries = await db.query(`SELECT COUNT(*)::int AS count FROM stars_ledger WHERE user_id=$1::uuid AND idempotency_key=$2`, [userId, `ledger-test:${suffix}`]);
  assert(Number(balance.rows[0].stars_balance) === 145, "balance remains unchanged after mismatched replay");
  assert(Number(entries.rows[0].count) === 1, "mismatched replay does not create another ledger row");
  await db.query("ROLLBACK");

  console.log("✅ Stars ledger tests passed");
} finally {
  if (userId) {
    await db.query(`DELETE FROM stars_ledger WHERE user_id=$1::uuid`, [userId]).catch(() => {});
    await db.query(`DELETE FROM user_state WHERE user_id=$1::uuid`, [userId]).catch(() => {});
    await db.query(`DELETE FROM users WHERE id=$1::uuid`, [userId]).catch(() => {});
  }
  await db.query("ROLLBACK").catch(() => {});
  await db.end().catch(() => {});
}
