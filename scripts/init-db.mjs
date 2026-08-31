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
    CREATE TABLE IF NOT EXISTS user_state (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      stars_balance INTEGER NOT NULL DEFAULT 125 CHECK (stars_balance >= 0 AND stars_balance <= 500),
      is_subscribed BOOLEAN NOT NULL DEFAULT TRUE,
      is_participant BOOLEAN NOT NULL DEFAULT TRUE,
      daily_gift_claimed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    INSERT INTO user_state (user_id)
    SELECT id FROM users
    ON CONFLICT (user_id) DO NOTHING
  `);
  console.log("✅ Persistent user state is ready.");

  const ownerId = String(process.env.OWNER_TELEGRAM_ID ?? "").trim();
  const adminIds = parseTelegramIds(process.env.ADMIN_TELEGRAM_IDS);

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
