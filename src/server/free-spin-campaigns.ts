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
