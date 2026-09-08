import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const envPath = path.resolve(process.cwd(), ".env");
const envText = await fs.readFile(envPath, "utf8").catch(() => "");
for (const line of envText.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const i = trimmed.indexOf("=");
  if (i > 0 && !(trimmed.slice(0, i) in process.env)) process.env[trimmed.slice(0, i)] = trimmed.slice(i + 1).replace(/^['\"]|['\"]$/g, "");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is missing in .env");
const db = new Client({ connectionString: databaseUrl });
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let admin;
let season;
let drop;

const assert = (ok, message) => { if (!ok) throw new Error(`ASSERTION FAILED: ${message}`); };

try {
  await db.connect();
  await db.query(await fs.readFile(path.resolve(process.cwd(), "db/schema.sql"), "utf8"));

  const objects = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, [["season_drop_events", "season_economy_snapshots"]]);
  assert(objects.rowCount === 2, "LiveOps and economy snapshot tables exist");

  const adminResult = await db.query(`INSERT INTO admins(telegram_id,username,role,is_active) VALUES($1,$2,'OWNER',TRUE) RETURNING id`, [880000000 + Number(String(Date.now()).slice(-7)), `liveops_${suffix}`]);
  admin = adminResult.rows[0].id;
  const seasonResult = await db.query(`INSERT INTO seasons(code,name,state,starts_at,ends_at,paid_spin_price,created_by) VALUES($1,'LiveOps CI','CLOSED',now()-interval '1 day',now()+interval '13 days',100,$2) RETURNING id`, [`LIVEOPS-${suffix}`, admin]);
  season = seasonResult.rows[0].id;

  const dropResult = await db.query(`INSERT INTO season_drop_events(season_id,name,trigger_type,trigger_value,payload,status,created_by) VALUES($1,'CI spin drop','SPIN_COUNT',100,'{"prizes":[{"kind":"STARS","title":"CI Stars","amount":10,"quantityTotal":5}]}','SCHEDULED',$2) RETURNING id,status`, [season, admin]);
  drop = dropResult.rows[0].id;
  assert(dropResult.rows[0].status === "SCHEDULED", "scheduled drop persists");

  const snapshot = await db.query(`INSERT INTO season_economy_snapshots(season_id,completed_spins,spins_last_hour,spins_last_day,spins_last_week,pace_per_day,projected_season_spins,multipliers) VALUES($1,100,10,40,80,8.5,120.5,'{"ci-prize":1.25}'::jsonb) RETURNING id,completed_spins,multipliers`, [season]);
  assert(snapshot.rows[0].completed_spins === 100, "economy snapshot persists spin metrics");
  assert(Number(snapshot.rows[0].multipliers["ci-prize"]) === 1.25, "economy snapshot persists multipliers");

  await db.query(`UPDATE season_drop_events SET status='EXECUTED',activated_at=now(),executed_at=now(),updated_at=now() WHERE id=$1`, [drop]);
  const check = await db.query(`SELECT status,activated_at,executed_at FROM season_drop_events WHERE id=$1`, [drop]);
  assert(check.rows[0]?.status === "EXECUTED" && check.rows[0]?.activated_at && check.rows[0]?.executed_at, "drop execution timestamps persist");

  console.log("✅ LiveOps/economy DB tests passed");
} finally {
  if (season) await db.query(`DELETE FROM season_economy_snapshots WHERE season_id=$1`, [season]).catch(() => {});
  if (season) await db.query(`DELETE FROM season_drop_events WHERE season_id=$1`, [season]).catch(() => {});
  if (season) await db.query(`DELETE FROM seasons WHERE id=$1`, [season]).catch(() => {});
  if (admin) await db.query(`DELETE FROM admins WHERE id=$1`, [admin]).catch(() => {});
  await db.end().catch(() => {});
}
