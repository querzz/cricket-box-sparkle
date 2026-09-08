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

if (process.env.SEED_DEMO !== "true") {
  console.error("Refusing to seed demo data. Set SEED_DEMO=true explicitly.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing in .env");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
const code = process.env.DEMO_SEASON_CODE?.trim() || "DEMO-2026";
const name = process.env.DEMO_SEASON_NAME?.trim() || "Cricket Box Demo";
const price = Number(process.env.DEMO_SPIN_PRICE ?? 100);

if (!Number.isSafeInteger(price) || price <= 0) {
  console.error("DEMO_SPIN_PRICE must be a positive integer.");
  process.exit(1);
}

try {
  await client.connect();

  const adminId = process.env.OWNER_TELEGRAM_ID?.trim();
  let creatorId = null;
  if (adminId && /^\d+$/.test(adminId)) {
    const admin = await client.query(
      `INSERT INTO admins (telegram_id, role, is_active)
       VALUES ($1, 'OWNER', TRUE)
       ON CONFLICT (telegram_id) DO UPDATE SET role='OWNER', is_active=TRUE, updated_at=now()
       RETURNING id`,
      [adminId],
    );
    creatorId = admin.rows[0]?.id ?? null;
  }

  const season = await client.query(
    `INSERT INTO seasons (code, name, state, paid_spin_price, daily_free_spin, created_by)
     VALUES ($1, $2, 'DRAFT', $3, TRUE, $4)
     ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, paid_spin_price=EXCLUDED.paid_spin_price, updated_at=now()
     RETURNING id, code, state`,
    [code, name, price, creatorId],
  );
  const seasonId = season.rows[0].id;

  const prizes = [
    ["EMPTY", "Ничего", "Попробуй ещё раз", 0, 0, null, 100, 100, 1],
    ["STARS", "25 Stars", "Stars на баланс", 25, 0, "XTR", 50, 50, 4],
    ["STARS", "100 Stars", "Stars на баланс", 100, 0, "XTR", 20, 20, 2],
    ["FREE_SPIN", "Бесплатный спин", "Ещё одна попытка", 1, 0, null, 25, 25, 3],
    ["MONEY", "10 EUR", "Demo reward", 10, 10, "EUR", 10, 10, 1],
  ];

  for (const [kind, title, subtitle, amount, unitCost, currency, quantityTotal, quantityRemaining, weight] of prizes) {
    await client.query(
      `INSERT INTO prizes
        (season_id, kind, title, subtitle, amount, unit_cost, currency, quantity_total, quantity_remaining, is_active, metadata)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, jsonb_build_object('weight', $10::numeric)
       WHERE NOT EXISTS (
         SELECT 1 FROM prizes WHERE season_id=$1 AND title=$3
       )`,
      [seasonId, kind, title, subtitle, amount, unitCost, currency, quantityTotal, quantityRemaining, weight],
    );
  }

  console.log(`✅ Demo season ready: ${season.rows[0].code} (${season.rows[0].state})`);
  console.log(`   Season ID: ${seasonId}`);
  console.log("   Activate it from the admin panel before testing spins.");
} catch (error) {
  console.error("❌ Demo seed failed:", error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
