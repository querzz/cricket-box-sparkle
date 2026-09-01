import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

async function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!(await fs.stat(envPath).catch(() => null))) return;
  const text = await fs.readFile(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

await loadEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing in .env");
  process.exit(1);
}

const schemaPath = path.resolve(process.cwd(), "db/schema.sql");
const schema = await fs.readFile(schemaPath, "utf8");
const client = new Client({ connectionString: process.env.DATABASE_URL });

function parseTelegramIds(value) {
  return String(value ?? "")
    .split(/[ ,]+/)
    .map((id) => id.trim())
    .filter(Boolean)
    .filter((id) => /^\d+$/.test(id));
}

try {
  await client.connect();
  await client.query(schema);

  await client.query(`
    ALTER TABLE user_state
      ADD COLUMN IF NOT EXISTS bonus_free_spins INTEGER NOT NULL DEFAULT 0;
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS daily_gift_claims (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('NOTHING','STARS','FREE_SPIN','XP')),
      amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
      title TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_daily_gift_claims_user_time
      ON daily_gift_claims(user_id, created_at DESC)
  `);

  // Keep only the newest open paid-spin transaction per user/season before
  // adding the database guard. Older duplicates cannot later be completed.
  await client.query(`
    WITH ranked AS (
      SELECT id,
             row_number() OVER (
               PARTITION BY user_id, payload->>'seasonId'
               ORDER BY created_at DESC, id DESC
             ) AS rn
        FROM star_transactions
       WHERE status = 'PENDING'
         AND payload->>'type' = 'PAID_SPIN'
    )
    UPDATE star_transactions st
       SET status = 'FAILED', processed_at = now()
      FROM ranked r
     WHERE st.id = r.id
       AND r.rn > 1
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_paid_spin_user_season
      ON star_transactions (user_id, (payload->>'seasonId'))
      WHERE status = 'PENDING' AND payload->>'type' = 'PAID_SPIN'
  `);
  console.log("✅ Payment idempotency/index guard is ready.");
  console.log("✅ Persistent user state and daily gift storage are ready.");

  await client.query(`
    INSERT INTO user_state (user_id)
    SELECT id FROM users
    ON CONFLICT (user_id) DO NOTHING
  `);

  const ownerId = String(process.env.OWNER_TELEGRAM_ID ?? "").trim();
  const adminIds = parseTelegramIds(process.env.ADMIN_TELEGRAM_IDS ?? "6537228449");

  if (ownerId) {
    await client.query(
      `INSERT INTO admins (telegram_id, username, role, is_active)
       VALUES ($1, NULL, 'OWNER', TRUE)
       ON CONFLICT (telegram_id) DO UPDATE SET role = 'OWNER', is_active = TRUE, updated_at = now()`,
      [ownerId],
    );
    console.log("✅ Owner access seeded from OWNER_TELEGRAM_ID.");
  }

  for (const adminId of adminIds) {
    if (adminId === ownerId) continue;
    await client.query(
      `INSERT INTO admins (telegram_id, username, role, is_active)
       VALUES ($1, NULL, 'ADMIN', TRUE)
       ON CONFLICT (telegram_id) DO UPDATE SET role = 'ADMIN', is_active = TRUE, updated_at = now()`,
      [adminId],
    );
  }

  if (adminIds.length > 0) console.log(`✅ Seeded ${adminIds.length} admin access record(s).`);
  console.log("✅ Cricket Box database schema is ready.");
} catch (error) {
  console.error("❌ Database initialization failed:", error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
