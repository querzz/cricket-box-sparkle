import fs from "node:fs/promises";
import path from "node:path";
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
let transactionStarted = false;

const assert = (ok, message) => { if (!ok) throw new Error(`ASSERTION FAILED: ${message}`); };

try {
  await db.connect();
  await db.query(await fs.readFile(path.resolve(process.cwd(), "db/schema.sql"), "utf8"));

  const objects = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, [["season_drop_events", "season_economy_snapshots"]]);
  assert(objects.rowCount === 2, "LiveOps and economy snapshot tables exist");

  await db.query("BEGIN");
  transactionStarted = true;
  await db.query(`UPDATE seasons SET state='CLOSED',updated_at=now() WHERE state IN ('ACTIVE','ENDING')`);

  const adminResult = await db.query(`INSERT INTO admins(telegram_id,username,role,is_active) VALUES($1,$2,'OWNER',TRUE) RETURNING id`, [880000000 + Number(String(Date.now()).slice(-7)), `liveops_${suffix}`]);
  const admin = adminResult.rows[0].id;
  const userResult = await db.query(`INSERT INTO users(telegram_id,username,first_name) VALUES($1,$2,'LiveOps') RETURNING id`, [870000000 + Number(String(Date.now()).slice(-7)), `liveops_user_${suffix}`]);
  const user = userResult.rows[0].id;
  await db.query(`INSERT INTO user_state(user_id,stars_balance) VALUES($1,125)`, [user]);

  const seasonResult = await db.query(`INSERT INTO seasons(code,name,state,starts_at,ends_at,paid_spin_price,created_by) VALUES($1,'LiveOps CI','CLOSED',now()-interval '1 day',now()+interval '13 days',100,$2) RETURNING id`, [`LIVEOPS-${suffix}`, admin]);
  const season = seasonResult.rows[0].id;

  const dropResult = await db.query(`INSERT INTO season_drop_events(season_id,name,trigger_type,trigger_value,payload,status,created_by) VALUES($1,'CI spin drop','SPIN_COUNT',100,'{\"prizes\":[{\"kind\":\"STARS\",\"title\":\"CI Stars\",\"amount\":10,\"quantityTotal\":5}]}','SCHEDULED',$2) RETURNING id,status`, [season, admin]);
  const drop = dropResult.rows[0].id;
  assert(dropResult.rows[0].status === "SCHEDULED", "scheduled drop persists");

  const snapshot = await db.query(`INSERT INTO season_economy_snapshots(season_id,completed_spins,spins_last_hour,spins_last_day,spins_last_week,pace_per_day,projected_season_spins,multipliers) VALUES($1,100,10,40,80,8.5,120.5,'{\"ci-prize\":1.25}'::jsonb) RETURNING id,completed_spins,multipliers`, [season]);
  assert(snapshot.rows[0].completed_spins === 100, "economy snapshot persists spin metrics");
  assert(Number(snapshot.rows[0].multipliers["ci-prize"]) === 1.25, "economy snapshot persists multipliers");

  // Test the same state-reconciliation ordering used by liveops.ts:
  // expired ENDING seasons are closed before a due SCHEDULED season is activated.
  const dueSeasonResult = await db.query(`INSERT INTO seasons(code,name,state,starts_at,ends_at,paid_spin_price,created_by) VALUES($1,'Due Season','SCHEDULED',now()-interval '1 minute',now()+interval '1 day',100,$2) RETURNING id,state`, [`DUE-${suffix}`, admin]);
  const dueSeason = dueSeasonResult.rows[0].id;
  const endingSeasonResult = await db.query(`INSERT INTO seasons(code,name,state,starts_at,ends_at,paid_spin_price,created_by) VALUES($1,'Ending Season','ENDING',now()-interval '2 days',now()-interval '1 minute',100,$2) RETURNING id,state`, [`ENDING-${suffix}`, admin]);
  const endingSeason = endingSeasonResult.rows[0].id;

  const closedEnding = await db.query(`UPDATE seasons SET state='CLOSED',updated_at=now() WHERE state='ENDING' AND ends_at IS NOT NULL AND ends_at<=now() RETURNING id::text,code`);
  assert(closedEnding.rows.some(row => row.id === endingSeason), "expired ending season becomes closed");

  await db.query(`UPDATE seasons SET state='CLOSED',updated_at=now() WHERE state IN ('ACTIVE','ENDING') AND id<>$1::uuid`, [dueSeason]);
  const activated = await db.query(`UPDATE seasons SET state='ACTIVE',updated_at=now() WHERE id=$1::uuid AND state='SCHEDULED' RETURNING id::text,state`, [dueSeason]);
  assert(activated.rows[0]?.state === "ACTIVE", "scheduled season becomes active");

  const stateCheck = await db.query(`SELECT id,state FROM seasons WHERE id = ANY($1::uuid[])`, [[dueSeason, endingSeason]]);
  const stateById = new Map(stateCheck.rows.map(row => [row.id, row.state]));
  assert(stateById.get(dueSeason) === "ACTIVE", "active season state persisted");
  assert(stateById.get(endingSeason) === "CLOSED", "expired ending season state persisted");

  // Closed seasons enter payout immediately. Any pending/review payout keeps the season
  // in PAYOUT; terminal payout states permit archival on the next lifecycle pass.
  const payoutSeasonResult = await db.query(`INSERT INTO seasons(code,name,state,starts_at,ends_at,paid_spin_price,created_by) VALUES($1,'Payout Gate','CLOSED',now()-interval '5 days',now()-interval '1 day',100,$2) RETURNING id`, [`PAYOUT-${suffix}`, admin]);
  const payoutSeason = payoutSeasonResult.rows[0].id;
  const spinResult = await db.query(`INSERT INTO spins(user_id,season_id,type,price_stars,status) VALUES($1,$2,'FREE',0,'COMPLETED') RETURNING id`, [user, payoutSeason]);
  const payoutSpin = spinResult.rows[0].id;
  const payoutResult = await db.query(`INSERT INTO payouts(spin_id,user_id,kind,amount,currency,status,note) VALUES($1,$2,'PREMIUM',1,NULL,'PENDING','SEASON_REWARD') RETURNING id`, [payoutSpin, user]);
  const payoutId = payoutResult.rows[0].id;

  const payoutTransition = await db.query(`UPDATE seasons SET state='PAYOUT',updated_at=now() WHERE state='CLOSED' AND id=$1::uuid RETURNING id::text,state`, [payoutSeason]);
  assert(payoutTransition.rows[0]?.state === "PAYOUT", "closed season enters payout phase");

  const blockedArchive = await db.query(`SELECT COUNT(*)::int AS count FROM seasons s WHERE s.id=$1::uuid AND s.state='PAYOUT' AND NOT EXISTS (SELECT 1 FROM payouts p WHERE p.id IS NOT NULL AND p.user_id IS NOT NULL AND p.spin_id IN (SELECT id FROM spins WHERE season_id=s.id) AND p.status IN ('PENDING','REVIEW'))`, [payoutSeason]);
  assert(blockedArchive.rows[0].count === 0, "pending payout blocks season archival");

  await db.query(`UPDATE payouts SET status='PAID',paid_at=now(),updated_at=now() WHERE id=$1::uuid`, [payoutId]);
  const canArchive = await db.query(`SELECT COUNT(*)::int AS count FROM seasons s WHERE s.id=$1::uuid AND s.state='PAYOUT' AND NOT EXISTS (SELECT 1 FROM payouts p WHERE p.id IS NOT NULL AND p.user_id IS NOT NULL AND p.spin_id IN (SELECT id FROM spins WHERE season_id=s.id) AND p.status IN ('PENDING','REVIEW'))`, [payoutSeason]);
  assert(canArchive.rows[0].count === 1, "terminal payouts permit season archival");

  const archived = await db.query(`UPDATE seasons SET state='ARCHIVED',updated_at=now() WHERE id=$1::uuid AND state='PAYOUT' AND NOT EXISTS (SELECT 1 FROM payouts p WHERE p.id IS NOT NULL AND p.user_id IS NOT NULL AND p.spin_id IN (SELECT id FROM spins WHERE season_id=$1::uuid) AND p.status IN ('PENDING','REVIEW')) RETURNING id::text,state`, [payoutSeason]);
  assert(archived.rows[0]?.state === "ARCHIVED", "season archives after payouts become terminal");

  const audit = await db.query(`INSERT INTO audit_logs(action,entity_type,entity_id,before_data,after_data) VALUES('SEASON_STATE_AUTO_TRANSITION','season',$1,'{\"state\":\"PAYOUT\"}'::jsonb,'{\"state\":\"ARCHIVED\",\"source\":\"liveops\"}'::jsonb) RETURNING id`, [payoutSeason]);
  assert(Boolean(audit.rows[0]?.id), "season lifecycle transition can be audited");

  await db.query(`UPDATE season_drop_events SET status='EXECUTED',activated_at=now(),executed_at=now(),updated_at=now() WHERE id=$1`, [drop]);
  const check = await db.query(`SELECT status,activated_at,executed_at FROM season_drop_events WHERE id=$1`, [drop]);
  assert(check.rows[0]?.status === "EXECUTED" && check.rows[0]?.activated_at && check.rows[0]?.executed_at, "drop execution timestamps persist");

  await db.query("ROLLBACK");
  transactionStarted = false;
  console.log("✅ LiveOps/economy DB tests passed");
} finally {
  if (transactionStarted) await db.query("ROLLBACK").catch(() => {});
  await db.end().catch(() => {});
}
