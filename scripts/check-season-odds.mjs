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

const client = new Client({ connectionString: process.env.DATABASE_URL });

function configuredWeight(metadata) {
  const raw = metadata?.weight;
  if (raw === undefined || raw === null || raw === "") return 1;
  const weight = Number(raw);
  if (!Number.isFinite(weight) || weight < 0) throw new Error("INVALID_PRIZE_WEIGHT");
  return weight;
}

try {
  await client.connect();

  const season = await client.query(`
    SELECT id::text, code, name, state, starts_at::text, ends_at::text
    FROM seasons
    WHERE state IN ('ACTIVE','ENDING')
    ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1
  `);
  if (!season.rows[0]) {
    console.error("No ACTIVE/ENDING season found.");
    process.exitCode = 2;
  } else {
    const current = season.rows[0];
    const prizes = await client.query(`
      SELECT id::text, kind, title, amount::text, currency,
             quantity_total, quantity_remaining, is_active, metadata
      FROM prizes
      WHERE season_id=$1::uuid
      ORDER BY created_at ASC
    `, [current.id]);

    const eligible = prizes.rows
      .map((prize) => ({ ...prize, weight: configuredWeight(prize.metadata) }))
      .filter((prize) => prize.is_active && prize.quantity_remaining > 0);
    const totalWeight = eligible.reduce((sum, prize) => sum + prize.weight * prize.quantity_remaining, 0);

    console.log(`Season: ${current.code} — ${current.name} [${current.state}]`);
    console.log(`Season ID: ${current.id}`);
    console.log(`Eligible effective weight: ${totalWeight}`);
    console.table(prizes.rows.map((prize) => {
      const weight = configuredWeight(prize.metadata);
      const effectiveWeight = prize.is_active && prize.quantity_remaining > 0 ? weight * prize.quantity_remaining : 0;
      return {
        kind: prize.kind,
        title: prize.title,
        remaining: prize.quantity_remaining,
        total: prize.quantity_total,
        weight,
        effectiveWeight,
        chancePct: totalWeight > 0 ? `${((effectiveWeight / totalWeight) * 100).toFixed(6)}%` : "0%",
        active: prize.is_active,
        amount: prize.amount,
        currency: prize.currency ?? "",
      };
    }));

    console.log("\nModel: finite-pool-v1 = configured weight × remaining inventory.");
    console.log("These are baseline pool odds before the per-user 500 Stars eligibility filter.");
  }
} catch (error) {
  console.error("Season odds check failed:", error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
