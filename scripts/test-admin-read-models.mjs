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

const db = new Client({ connectionString: process.env.DATABASE_URL });
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const assert = (condition, message) => {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
};

try {
  await db.connect();
  await db.query(await fs.readFile(path.resolve(process.cwd(), "db/schema.sql"), "utf8"));
  await db.query("BEGIN");

  const season = await db.query(
    `INSERT INTO seasons (code,name,state,paid_spin_price,daily_free_spin)
     VALUES ($1,'Admin Read Model CI','ACTIVE',100,TRUE) RETURNING id`,
    [`CI-READ-${suffix}`],
  );
  const seasonId = season.rows[0].id;

  const users = await db.query(
    `INSERT INTO users (telegram_id,username,first_name,last_name)
     VALUES ($1,$2,'Read','Model'),($3,$4,'Read','Model 2') RETURNING id,telegram_id`,
    [920000000 + Number(String(Date.now()).slice(-6)), `ci_read_${suffix}`, 930000000 + Number(String(Date.now()).slice(-6)), `ci_read_2_${suffix}`],
  );
  const userA = users.rows[0].id;
  const userB = users.rows[1].id;
  const prize = await db.query(
    `INSERT INTO prizes (season_id,kind,title,amount,quantity_total,quantity_remaining,is_active)
     VALUES ($1,'PREMIUM','CI Premium',0,1,1,TRUE) RETURNING id`,
    [seasonId],
  );

  const spins = await db.query(
    `INSERT INTO spins (user_id,season_id,type,price_stars,prize_id,status,completed_at)
     VALUES ($1,$3,'FREE',0,$4,'COMPLETED',now()),($1,$3,'FREE',0,$4,'COMPLETED',now()),($2,$3,'FREE',0,$4,'COMPLETED',now())
     RETURNING id`,
    [userA, userB, seasonId, prize.rows[0].id],
  );
  await db.query(
    `INSERT INTO payouts (spin_id,user_id,prize_id,kind,amount,status)
     VALUES ($1,$2,$3,'PREMIUM',0,'PENDING')`,
    [spins.rows[0].id, userA, prize.rows[0].id],
  );

  const participantRows = await db.query(
    `WITH current_season AS (
       SELECT COALESCE($3::uuid, (SELECT id FROM seasons ORDER BY CASE WHEN state='ACTIVE' THEN 0 WHEN state='ENDING' THEN 1 ELSE 2 END, created_at DESC LIMIT 1)) AS id
     ),
     spin_stats AS (
       SELECT user_id,
              COUNT(*) FILTER (WHERE status='COMPLETED')::int AS spins,
              COUNT(*) FILTER (WHERE status='COMPLETED' AND type='FREE')::int AS free_spins,
              COUNT(*) FILTER (WHERE status='COMPLETED' AND type='PAID')::int AS paid_spins,
              MAX(created_at) AS last_activity
         FROM spins
        WHERE season_id=(SELECT id FROM current_season)
        GROUP BY user_id
     ),
     reward_stats AS (
       SELECT py.user_id, COUNT(*) FILTER (WHERE py.prize_id IS NOT NULL AND py.kind<>'EMPTY')::int AS rewards,
              COALESCE(SUM(CASE WHEN py.kind='STARS' AND py.prize_id IS NOT NULL THEN py.amount ELSE 0 END),0)::int AS stars
         FROM payouts py JOIN spins s ON s.id=py.spin_id
        WHERE s.season_id=(SELECT id FROM current_season)
          AND py.status IN ('PENDING','REVIEW','PAID')
        GROUP BY py.user_id
     )
     SELECT u.id::text, u.created_at::text, u.last_seen_at::text, ss.last_activity::text,
            COALESCE(ss.spins,0)::int AS spins, COALESCE(rs.rewards,0)::int AS rewards
       FROM users u
       LEFT JOIN spin_stats ss ON ss.user_id=u.id
       LEFT JOIN reward_stats rs ON rs.user_id=u.id
      WHERE ($2='' OR u.telegram_id::text ILIKE $1 OR COALESCE(u.username,'') ILIKE $1 OR u.first_name ILIKE $1 OR COALESCE(u.last_name,'') ILIKE $1)
      ORDER BY COALESCE(ss.last_activity,u.last_seen_at) DESC
      LIMIT $4`,
    [`%ci_read_%`, ``, seasonId, 50],
  );
  assert(participantRows.rowCount === 1 || participantRows.rowCount === 2, "participants query executes and returns CI users");
  assert(participantRows.rows.some((row) => row.spins === 2 && row.rewards === 1), "participants query aggregates spins and rewards");

  const statsRows = await db.query(
    `SELECT COUNT(*)::text AS value
       FROM (
         SELECT s.user_id
           FROM spins s
          WHERE s.status='COMPLETED' AND s.season_id=$1::uuid
          GROUP BY s.user_id
         HAVING COUNT(*)>=2
       ) x`,
    [seasonId],
  );
  assert(Number(statsRows.rows[0]?.value ?? 0) === 1, "repeat-user statistics query uses the correct spins alias");

  await db.query("ROLLBACK");
  console.log("✅ Admin read model regression tests passed");
} catch (error) {
  await db.query("ROLLBACK").catch(() => {});
  console.error("❌ Admin read model regression failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
