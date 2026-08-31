import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  return fs.readFile(envPath, "utf8").then((text) => {
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  });
}

await loadEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing in .env");
  process.exit(1);
}

const schemaPath = path.resolve(process.cwd(), "db/schema.sql");
const schema = await fs.readFile(schemaPath, "utf8");
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(schema);
  console.log("✅ Cricket Box database schema is ready.");
} catch (error) {
  console.error("❌ Database initialization failed:", error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
