import { Pool, type PoolClient, type QueryResultRow } from "pg";

const connectionString = process.env.DATABASE_URL;

let pool: Pool | null = null;

export function getDb() {
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing. Add it to the server environment before using the database.");
  }

  pool ??= new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return getDb().query<T>(text, values);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function healthCheck() {
  const result = await query<{ ok: number }>("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
