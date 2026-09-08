import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const loadEnv = async () => {
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
};

const assert = (condition, message) => {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
};

await loadEnv();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing in .env");

const db = new Client({ connectionString: process.env.DATABASE_URL });
const key = `rate-test:${Date.now()}:${Math.floor(Math.random() * 1e9)}`;

try {
  await db.connect();
  await db.query(`
    CREATE TABLE IF NOT EXISTS api_rate_limit_buckets (
      bucket_key TEXT NOT NULL,
      bucket_start TIMESTAMPTZ NOT NULL,
      hits INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (bucket_key, bucket_start)
    )
  `);

  const consume = async (limit) => {
    const result = await db.query(
      `INSERT INTO api_rate_limit_buckets(bucket_key,bucket_start,hits)
       VALUES($1,date_trunc('minute',now()),1)
       ON CONFLICT(bucket_key,bucket_start)
       DO UPDATE SET hits=api_rate_limit_buckets.hits+1
       RETURNING hits`,
      [key],
    );
    const hits = Number(result.rows[0].hits);
    return { hits, allowed: hits <= limit };
  };

  const first = await consume(3);
  const second = await consume(3);
  const third = await consume(3);
  const fourth = await consume(3);

  assert(first.allowed && first.hits === 1, "first request is allowed");
  assert(second.allowed && second.hits === 2, "second request is allowed");
  assert(third.allowed && third.hits === 3, "third request is allowed");
  assert(!fourth.allowed && fourth.hits === 4, "fourth request is blocked");

  const bucket = await db.query(
    `SELECT hits FROM api_rate_limit_buckets WHERE bucket_key=$1 AND bucket_start=date_trunc('minute',now())`,
    [key],
  );
  assert(Number(bucket.rows[0]?.hits) === 4, "counter is atomic and persisted in PostgreSQL");

  console.log("✅ Rate-limit PostgreSQL tests passed");
} finally {
  await db.query(`DELETE FROM api_rate_limit_buckets WHERE bucket_key=$1`, [key]).catch(() => {});
  await db.end().catch(() => {});
}
