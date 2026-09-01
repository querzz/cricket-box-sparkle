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
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_file_id TEXT;
    ALTER TABLE prizes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE prizes ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE prizes DROP CONSTRAINT IF EXISTS prizes_kind_check;
    ALTER TABLE prizes ADD CONSTRAINT prizes_kind_check CHECK (kind IN ('STARS','PREMIUM','MONEY','NFT','PHYSICAL','CUSTOM','FREE_SPIN','EMPTY'));
    ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_kind_check;
    ALTER TABLE payouts ADD CONSTRAINT payouts_kind_check CHECK (kind IN ('STARS','PREMIUM','MONEY','NFT','PHYSICAL','CUSTOM','FREE_SPIN','EMPTY'));
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
  await client.query(`CREATE INDEX IF NOT EXISTS idx_daily_gift_claims_user_time ON daily_gift_claims(user_id, created_at DESC)`);

  await client.query(`
    WITH ranked AS (
      SELECT id,
             row_number() OVER (
               PARTITION BY user_id, payload->>'seasonId'
               ORDER BY created_at DESC, id DESC
             ) AS rn
        FROM star_transactions
       WHERE status='PENDING' AND payload->>'type'='PAID_SPIN'
    )
    UPDATE star_transactions st SET status='FAILED', processed_at=now()
      FROM ranked r WHERE st.id=r.id AND r.rn>1
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_paid_spin_user_season
      ON star_transactions (user_id, (payload->>'seasonId'))
      WHERE status='PENDING' AND payload->>'type'='PAID_SPIN'
  `);

  await client.query(`
    -- Backfill the append-only Stars ledger without changing existing balances.
    INSERT INTO stars_ledger (user_id, type, amount, idempotency_key, metadata)
    SELECT us.user_id, 'OPENING_BALANCE', us.stars_balance, 'opening:' || us.user_id::text,
           jsonb_build_object('source','legacy_user_state_migration')
      FROM user_state us
     WHERE NOT EXISTS (
       SELECT 1 FROM stars_ledger sl WHERE sl.idempotency_key='opening:' || us.user_id::text
     )
    ON CONFLICT (idempotency_key) DO NOTHING
  `);

  await client.query(`
    CREATE OR REPLACE VIEW season_leaderboard AS
    WITH spin_stats AS (
      SELECT season_id, user_id, COUNT(*)::int AS spins_count
      FROM spins WHERE status='COMPLETED' GROUP BY season_id, user_id
    ),
    win_stats AS (
      SELECT s.season_id, py.user_id, COUNT(*)::int AS wins_count,
             COALESCE(SUM(CASE WHEN py.kind='STARS' THEN py.amount ELSE 0 END),0)::numeric AS stars_won
      FROM payouts py JOIN spins s ON s.id=py.spin_id
      WHERE py.prize_id IS NOT NULL AND py.kind<>'EMPTY'
      GROUP BY s.season_id, py.user_id
    ),
    base AS (
      SELECT ss.season_id, ss.user_id, ss.spins_count,
             COALESCE(ws.wins_count,0)::int AS wins_count,
             COALESCE(ws.stars_won,0)::numeric AS stars_won
      FROM spin_stats ss
      LEFT JOIN win_stats ws ON ws.season_id=ss.season_id AND ws.user_id=ss.user_id
    )
    SELECT season_id,user_id,spins_count,wins_count,stars_won,
           RANK() OVER (PARTITION BY season_id ORDER BY spins_count DESC,wins_count DESC,stars_won DESC,user_id)::int AS rank
    FROM base;
  `);

  await client.query(`INSERT INTO user_state (user_id) SELECT id FROM users ON CONFLICT (user_id) DO NOTHING`);

  const ownerId = String(process.env.OWNER_TELEGRAM_ID ?? "").trim();
  const adminIds = parseTelegramIds(process.env.ADMIN_TELEGRAM_IDS ?? "6537228449");
  if (ownerId) {
    await client.query(`INSERT INTO admins (telegram_id,username,role,is_active) VALUES ($1,NULL,'OWNER',TRUE) ON CONFLICT (telegram_id) DO UPDATE SET role='OWNER',is_active=TRUE,updated_at=now()`, [ownerId]);
    console.log("✅ Owner access seeded from OWNER_TELEGRAM_ID.");
  }
  for (const adminId of adminIds) {
    if (adminId === ownerId) continue;
    await client.query(`INSERT INTO admins (telegram_id,username,role,is_active) VALUES ($1,NULL,'ADMIN',TRUE) ON CONFLICT (telegram_id) DO UPDATE SET role='ADMIN',is_active=TRUE,updated_at=now()`, [adminId]);
  }
  if (adminIds.length > 0) console.log(`✅ Seeded ${adminIds.length} admin access record(s).`);
  console.log("✅ Stars ledger migration/backfill, payment idempotency guard, prize controls, avatar storage and leaderboard view are ready.");
} catch (error) {
  console.error("❌ Database initialization failed:", error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
