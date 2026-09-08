import type { PoolClient } from "pg";

import { query } from "@/server/db";

type DbExecutor = Pick<PoolClient, "query">;
let ensured: Promise<void> | null = null;

async function ensureTable() {
  if (!ensured) {
    ensured = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS api_rate_limit_buckets (bucket_key TEXT NOT NULL,bucket_start TIMESTAMPTZ NOT NULL,hits INTEGER NOT NULL DEFAULT 0,PRIMARY KEY (bucket_key,bucket_start))`);
      await query(`CREATE INDEX IF NOT EXISTS idx_api_rate_limit_buckets_time ON api_rate_limit_buckets(bucket_start)`);
    })().catch((error) => {
      ensured = null;
      throw error;
    });
  }
  return ensured;
}

function nextMinuteSeconds() {
  return Math.max(1, 60 - Math.floor((Date.now() / 1000) % 60));
}

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("RATE_LIMITED");
    this.name = "RateLimitError";
    this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
  }
}

export async function enforceRateLimit(key: string, limit: number, executor?: DbExecutor): Promise<void> {
  const normalizedKey = key.trim().slice(0, 180);
  const safeLimit = Math.max(1, Math.floor(limit));
  if (!normalizedKey) throw new Error("RATE_LIMIT_KEY_MISSING");

  await ensureTable();
  const db = executor ?? ({ query: query.bind(null) } as DbExecutor);
  const result = await db.query<{ hits: number }>(
    `INSERT INTO api_rate_limit_buckets(bucket_key,bucket_start,hits)
     VALUES($1,date_trunc('minute',now()),1)
     ON CONFLICT(bucket_key,bucket_start)
     DO UPDATE SET hits=api_rate_limit_buckets.hits+1
     RETURNING hits`,
    [normalizedKey],
  );
  const hits = Number(result.rows[0]?.hits ?? 1);
  if (hits > safeLimit) throw new RateLimitError(nextMinuteSeconds());
  if (hits % 100 === 0) {
    void db.query(`DELETE FROM api_rate_limit_buckets WHERE bucket_start < now()-interval '2 hours'`).catch(() => {});
  }
}
