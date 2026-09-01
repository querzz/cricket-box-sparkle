import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const schema = await fs.readFile(path.resolve(process.cwd(), "db/schema.sql"), "utf8");
const db = new Client({ connectionString: databaseUrl });

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function expectReject(fn, message) {
  try { await fn(); } catch { return; }
  throw new Error(`ASSERTION FAILED: ${message}`);
}

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let seasonA; let seasonB; let userA; let userB; let userC; let admin;

try {
  await db.connect();
  await db.query(schema);

  const objects = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[]) ORDER BY table_name`, [["users","user_state","admins","seasons","prizes","spins","payouts","daily_gift_claims","owner_gifts","channel_activity","audit_logs","star_transactions","stars_ledger"]]);
  assert(objects.rowCount === 13, "all core tables including stars_ledger exist");
  const view = await db.query(`SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='season_leaderboard'`);
  assert(view.rowCount === 1, "season_leaderboard view exists");

  const adminResult = await db.query(`INSERT INTO admins (telegram_id, username, role, is_active) VALUES ($1,$2,'OWNER',TRUE) RETURNING id`, [900000000 + Number(String(suffix).replace(/\D/g, "").slice(-5) || 1), `ci_${suffix}`]);
  admin = adminResult.rows[0].id;
  const seasons = await db.query(`INSERT INTO seasons (code,name,state,paid_spin_price,daily_free_spin,created_by) VALUES ($1,'CI Season A','ACTIVE',100,TRUE,$3),($2,'CI Season B','CLOSED',100,TRUE,$3) RETURNING id,code`, [`CI-${suffix}-A`,`CI-${suffix}-B`,admin]);
  seasonA = seasons.rows.find((r) => r.code.endsWith("-A")).id; seasonB = seasons.rows.find((r) => r.code.endsWith("-B")).id;

  const users = await db.query(`INSERT INTO users (telegram_id,username,first_name) VALUES ($1,'ci_a','A'),($2,'ci_b','B'),($3,'ci_c','C') RETURNING id,username`, [910000001,910000002,910000003]);
  userA = users.rows.find((r) => r.username === "ci_a").id; userB = users.rows.find((r) => r.username === "ci_b").id; userC = users.rows.find((r) => r.username === "ci_c").id;
  await db.query(`INSERT INTO user_state (user_id,stars_balance) VALUES ($1,480),($2,500),($3,100)`, [userA,userB,userC]);

  const openings = await db.query(`SELECT user_id,amount FROM stars_ledger WHERE user_id=ANY($1::uuid[]) AND type='OPENING_BALANCE'`, [[userA,userB,userC]]);
  assert(openings.rowCount === 3, "new user states seed opening ledger entries");

  const prize = await db.query(`INSERT INTO prizes (season_id,kind,title,subtitle,amount,unit_cost,currency,quantity_total,quantity_remaining,is_active,image_url,metadata) VALUES ($1,'MONEY','Custom 1375 UAH','CI test',1375,1000,'UAH',7,7,TRUE,'https://example.com/prize.png',$2) RETURNING id,amount,quantity_total,quantity_remaining,is_active,metadata`, [seasonA,JSON.stringify({weight:2.5})]);
  assert(Number(prize.rows[0].amount) === 1375, "arbitrary money amount persists");
  assert(prize.rows[0].quantity_total === 7 && prize.rows[0].quantity_remaining === 7, "quantity persists");
  assert(prize.rows[0].is_active === true, "active flag persists");
  assert(Number(prize.rows[0].metadata.weight) === 2.5, "weight persists");
  const starsPrize = await db.query(`INSERT INTO prizes (season_id,kind,title,amount,quantity_total,quantity_remaining,is_active,metadata) VALUES ($1,'STARS','Custom 137 Stars',137,3,3,TRUE,$2) RETURNING id,amount`, [seasonA,JSON.stringify({weight:4})]);
  assert(Number(starsPrize.rows[0].amount) === 137, "arbitrary Stars amount persists");
  const inactivePrize = await db.query(`INSERT INTO prizes (season_id,kind,title,amount,quantity_total,quantity_remaining,is_active) VALUES ($1,'MONEY','Inactive',999,20,20,FALSE) RETURNING id`, [seasonA]);
  const eligible = await db.query(`SELECT COUNT(*)::int AS n FROM prizes WHERE season_id=$1 AND quantity_remaining>0 AND is_active=TRUE`, [seasonA]);
  assert(eligible.rows[0].n === 2, "inactive rewards are excluded from eligible pool");
  assert(inactivePrize.rows[0].id !== prize.rows[0].id, "test created distinct inactive prize");

  await expectReject(() => db.query(`UPDATE user_state SET stars_balance=501 WHERE user_id=$1`, [userA]), "Stars balance above 500 is rejected");

  const beforeStars = await db.query(`SELECT stars_balance FROM user_state WHERE user_id=$1`, [userA]);
  const requestedReward = 50;
  const room = 500 - Number(beforeStars.rows[0].stars_balance);
  const credited = Math.min(room, requestedReward);
  const overflow = requestedReward - credited;
  await db.query(`INSERT INTO stars_ledger (user_id,season_id,type,amount,idempotency_key,metadata) VALUES ($1,$2,'REWARD',$3,$4,$5::jsonb)`, [userA,seasonA,requestedReward,`ci-reward:${suffix}`,JSON.stringify({requestedAmount:requestedReward,creditedAmount:credited,overflowAmount:overflow})]);
  await db.query(`UPDATE user_state SET stars_balance=stars_balance+$2 WHERE user_id=$1`, [userA,credited]);
  if (overflow > 0) await db.query(`INSERT INTO stars_ledger (user_id,season_id,type,amount,idempotency_key,metadata) VALUES ($1,$2,'CAPPED_OVERFLOW_BURNED',$3,$4,$5::jsonb)`, [userA,seasonA,-overflow,`ci-overflow:${suffix}`,JSON.stringify({requestedAmount:requestedReward,creditedAmount:credited,overflowAmount:overflow})]);
  const afterStars = await db.query(`SELECT stars_balance FROM user_state WHERE user_id=$1`, [userA]);
  assert(Number(afterStars.rows[0].stars_balance) === 500, "Stars credit respects 500 cap");
  assert(overflow === 30, "overflow is deterministic");
  const ledgerSum = await db.query(`SELECT COALESCE(SUM(amount),0)::int AS balance FROM stars_ledger WHERE user_id=$1`, [userA]);
  assert(Number(ledgerSum.rows[0].balance) === Number(afterStars.rows[0].stars_balance), "ledger sum reconciles to cached Stars balance");
  await expectReject(() => db.query(`UPDATE stars_ledger SET amount=999 WHERE id=(SELECT id FROM stars_ledger WHERE idempotency_key=$1)`, [`ci-reward:${suffix}`]), "Stars ledger is append-only");
  await expectReject(() => db.query(`DELETE FROM stars_ledger WHERE idempotency_key=$1`, [`ci-reward:${suffix}`]), "Stars ledger rows cannot be deleted");

  const payload = `paidspin:v1:${userA}:${seasonA}:ci-${suffix}`;
  await db.query(`INSERT INTO star_transactions (user_id,amount,status,payload) VALUES ($1,100,'PENDING',$2)`, [userA,JSON.stringify({payload,type:"PAID_SPIN",seasonId:seasonA,userId:userA})]);
  await expectReject(() => db.query(`INSERT INTO star_transactions (user_id,amount,status,payload) VALUES ($1,100,'PENDING',$2)`, [userA,JSON.stringify({payload:`paidspin:v1:${userA}:${seasonA}:ci-${suffix}-duplicate`,type:"PAID_SPIN",seasonId:seasonA,userId:userA})]), "one pending paid spin per user and season is enforced");
  await db.query(`UPDATE star_transactions SET status='SUCCESS',processed_at=now() WHERE user_id=$1 AND status='PENDING'`, [userA]);
  await db.query(`INSERT INTO star_transactions (user_id,amount,status,payload) VALUES ($1,100,'PENDING',$2)`, [userA,JSON.stringify({payload:`paidspin:v1:${userA}:${seasonA}:ci-${suffix}-2`,type:"PAID_SPIN",seasonId:seasonA,userId:userA})]);

  const spin1 = await db.query(`INSERT INTO spins (user_id,season_id,type,price_stars,status,completed_at) VALUES ($1,$3,'FREE',0,'COMPLETED',now()),($1,$3,'FREE',0,'COMPLETED',now()),($2,$3,'FREE',0,'COMPLETED',now()) RETURNING id,user_id`, [userA,userB,seasonA]);
  await db.query(`INSERT INTO payouts (spin_id,user_id,prize_id,kind,amount,currency,status) VALUES ($1,$2,$3,'STARS',137,'XTR','PAID')`, [spin1.rows[0].id,userA,starsPrize.rows[0].id]);
  const board = await db.query(`SELECT u.username,l.season_id,l.spins_count,l.wins_count,l.stars_won,l.rank FROM season_leaderboard l JOIN users u ON u.id=l.user_id WHERE l.season_id=$1 ORDER BY l.rank`, [seasonA]);
  assert(board.rowCount === 2, "leaderboard contains only users with completed spins in season");
  assert(board.rows[0].username === "ci_a", "leaderboard ranks top user correctly");
  assert(board.rows[0].spins_count === 2 && board.rows[0].wins_count === 1 && Number(board.rows[0].stars_won) === 137, "leaderboard metrics are correct");

  await db.query(`INSERT INTO spins (user_id,season_id,type,price_stars,status,completed_at) VALUES ($1,$2,'FREE',0,'COMPLETED',now())`, [userC,seasonB]);
  const boardAAfter = await db.query(`SELECT COUNT(*)::int AS n FROM season_leaderboard WHERE season_id=$1`, [seasonA]);
  assert(boardAAfter.rows[0].n === 2, "season A leaderboard is isolated from season B");

  const racePrize = await db.query(`INSERT INTO prizes (season_id,kind,title,amount,quantity_total,quantity_remaining,is_active) VALUES ($1,'MONEY','Race Prize',10,1,1,TRUE) RETURNING id`, [seasonA]);
  const claim = async () => {
    const c = new Client({ connectionString:databaseUrl }); await c.connect();
    try { await c.query('BEGIN'); const locked = await c.query(`SELECT quantity_remaining FROM prizes WHERE id=$1 FOR UPDATE`, [racePrize.rows[0].id]); let won=false; if (Number(locked.rows[0]?.quantity_remaining ?? 0)>0) { await c.query(`UPDATE prizes SET quantity_remaining=quantity_remaining-1 WHERE id=$1`, [racePrize.rows[0].id]); won=true; } await c.query('COMMIT'); return won; }
    catch (error) { await c.query('ROLLBACK').catch(()=>{}); throw error; } finally { await c.end(); }
  };
  const race = await Promise.all([claim(),claim()]);
  assert(race.filter(Boolean).length === 1, "concurrent inventory claims produce exactly one winner");
  const remaining = await db.query(`SELECT quantity_remaining FROM prizes WHERE id=$1`, [racePrize.rows[0].id]);
  assert(Number(remaining.rows[0].quantity_remaining) === 0, "inventory cannot become negative or remain consumed twice");

  console.log("✅ DB integration tests passed");
} finally {
  if (admin || seasonA || seasonB || userA || userB || userC) {
    const users = [userA,userB,userC].filter(Boolean); const seasons = [seasonA,seasonB].filter(Boolean);
    await db.query(`DELETE FROM star_transactions WHERE user_id=ANY($1::uuid[])`, [users]);
    await db.query(`DELETE FROM payouts WHERE user_id=ANY($1::uuid[])`, [users]);
    await db.query(`DELETE FROM spins WHERE user_id=ANY($1::uuid[])`, [users]);
    await db.query(`DELETE FROM prizes WHERE season_id=ANY($1::uuid[])`, [seasons]);
    await db.query(`TRUNCATE TABLE stars_ledger`);
    await db.query(`DELETE FROM user_state WHERE user_id=ANY($1::uuid[])`, [users]);
    await db.query(`DELETE FROM users WHERE id=ANY($1::uuid[])`, [users]);
    await db.query(`DELETE FROM seasons WHERE id=ANY($1::uuid[])`, [seasons]);
    if (admin) await db.query(`DELETE FROM admins WHERE id=$1`, [admin]);
  }
  await db.end();
}
