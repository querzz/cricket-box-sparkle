import { type PoolClient } from "pg";

type DbExecutor = Pick<PoolClient, "query">;

export async function grantActiveFreeSpinCampaigns(
  db: DbExecutor,
  userId: string,
  seasonId: string,
  isParticipant: boolean,
  isSubscribed: boolean,
) {
  if (!isParticipant || !isSubscribed) return 0;

  const campaigns = await db.query<{ id:string; name:string; spins_per_user:number }>(
    "SELECT id::text,name,spins_per_user FROM free_spin_campaigns WHERE season_id=$1::uuid AND enabled=TRUE AND starts_at<=now() AND ends_at>now() ORDER BY starts_at ASC",
    [seasonId],
  );

  let granted = 0;
  for (const campaign of campaigns.rows) {
    const claim = await db.query<{ amount:number }>(
      "INSERT INTO free_spin_campaign_claims(campaign_id,user_id,amount) VALUES($1::uuid,$2::uuid,$3) ON CONFLICT(campaign_id,user_id) DO NOTHING RETURNING amount",
      [campaign.id,userId,campaign.spins_per_user],
    );
    if (!claim.rows[0]) continue;

    const amount = Math.max(0, Number(claim.rows[0].amount) || 0);
    if (amount <= 0) continue;
    await db.query(
      "UPDATE user_state SET bonus_free_spins=LEAST(1000,bonus_free_spins+$2),updated_at=now() WHERE user_id=$1::uuid",
      [userId,amount],
    );
    granted += amount;
    await db.query(
      "INSERT INTO audit_logs(action,entity_type,entity_id,after_data) VALUES('GLOBAL_FREE_SPIN_CAMPAIGN_GRANTED','free_spin_campaign',$1,$2::jsonb)",
      [campaign.id,JSON.stringify({userId,seasonId,campaignName:campaign.name,amount})],
    );
  }

  return granted;
}


export async function grantFreeSpinCampaignToCurrentParticipants(
  db: DbExecutor,
  campaignId: string,
  seasonId: string,
) {
  const campaign = await db.query<{ id:string; name:string; spins_per_user:number; starts_at:Date; ends_at:Date; enabled:boolean }>(
    "SELECT id::text,name,spins_per_user,starts_at,ends_at,enabled FROM free_spin_campaigns WHERE id=$1::uuid AND season_id=$2::uuid FOR UPDATE",
    [campaignId, seasonId],
  );
  const row = campaign.rows[0];
  if (!row || !row.enabled || new Date(row.starts_at).getTime() > Date.now() || new Date(row.ends_at).getTime() <= Date.now()) return 0;

  const users = await db.query<{ id:string }>(
    `SELECT u.id::text
       FROM users u
       JOIN user_state us ON us.user_id=u.id
      WHERE u.is_test=FALSE
        AND us.is_participant=TRUE
        AND us.is_subscribed=TRUE
      ORDER BY u.created_at ASC`,
  );

  let grantedUsers = 0;
  for (const user of users.rows) {
    const claim = await db.query<{ amount:number }>(
      "INSERT INTO free_spin_campaign_claims(campaign_id,user_id,amount) VALUES($1::uuid,$2::uuid,$3) ON CONFLICT(campaign_id,user_id) DO NOTHING RETURNING amount",
      [campaignId, user.id, row.spins_per_user],
    );
    if (!claim.rows[0]) continue;
    const amount = Math.max(0, Number(claim.rows[0].amount) || 0);
    if (!amount) continue;
    await db.query(
      "UPDATE user_state SET bonus_free_spins=LEAST(1000,bonus_free_spins+$2),updated_at=now() WHERE user_id=$1::uuid",
      [user.id, amount],
    );
    grantedUsers += 1;
  }

  if (grantedUsers > 0) {
    await db.query(
      "INSERT INTO audit_logs(action,entity_type,entity_id,after_data) VALUES('GLOBAL_FREE_SPIN_CAMPAIGN_INITIAL_GRANT','free_spin_campaign',$1,$2::jsonb)",
      [campaignId, JSON.stringify({ seasonId, campaignName: row.name, spinsPerUser: row.spins_per_user, grantedUsers })],
    );
  }

  return grantedUsers;
}
