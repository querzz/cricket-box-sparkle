import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query } from "@/server/db";

type NumRow = Record<string, string | number | null>;

export const Route = createFileRoute("/api/admin/season-report")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const url = new URL(request.url);
        await authenticateAdmin(url.searchParams.get("initData") ?? "");
        const seasonId = (url.searchParams.get("seasonId") ?? "").trim();

        const seasons = await query<{
          id:string; code:string; name:string; state:string; starts_at:string|null; ends_at:string|null; is_paused:boolean; paused_at:string|null; paid_spin_price:number; paid_spin_enabled:boolean;
        }>(
          "SELECT id::text,code,name,state,starts_at::text,ends_at::text,is_paused,paused_at::text,paid_spin_price,paid_spin_enabled FROM seasons " +
          (seasonId ? "WHERE id=$1::uuid" : "ORDER BY created_at DESC LIMIT 1"),
          seasonId ? [seasonId] : [],
        );
        const season = seasons.rows[0];
        if (!season) return Response.json({ok:false,code:"SEASON_NOT_FOUND"},{status:404});

        const id = season.id;
        const params = [id];

        const overview = await query<NumRow>(
          "SELECT " +
          "COUNT(DISTINCT s.user_id) FILTER (WHERE s.status='COMPLETED')::text AS participants," +
          "COUNT(*)::text AS attempted," +
          "COUNT(*) FILTER (WHERE s.status='COMPLETED')::text AS completed," +
          "COUNT(*) FILTER (WHERE s.status='FAILED')::text AS failed," +
          "COUNT(*) FILTER (WHERE s.status='REFUNDED')::text AS refunded," +
          "COUNT(*) FILTER (WHERE s.status='COMPLETED' AND s.type='FREE')::text AS free_spins," +
          "COUNT(*) FILTER (WHERE s.status='COMPLETED' AND s.type='PAID')::text AS paid_spins," +
          "COUNT(*) FILTER (WHERE s.status='COMPLETED' AND s.type='OWNER_GIFT')::text AS owner_gift_spins," +
          "COUNT(*) FILTER (WHERE s.status='COMPLETED' AND s.type='ACTIVITY_BONUS')::text AS activity_spins," +
          "COUNT(*) FILTER (WHERE s.status='COMPLETED' AND s.type='VETERAN_BONUS')::text AS veteran_spins " +
          "FROM spins s WHERE s.season_id=$1::uuid", params);

        const rewards = await query<NumRow>(
          "SELECT " +
          "COUNT(*) FILTER (WHERE s.status='COMPLETED' AND p.kind='EMPTY')::text AS empty_spins," +
          "COUNT(*) FILTER (WHERE s.status='COMPLETED' AND p.kind<>'EMPTY')::text AS wins," +
          "COUNT(*) FILTER (WHERE s.status='COMPLETED')::text AS resolved " +
          "FROM spins s LEFT JOIN prizes p ON p.id=s.prize_id WHERE s.season_id=$1::uuid", params);

        const paid = await query<NumRow>(
          "SELECT " +
          "COUNT(DISTINCT user_id)::text AS paid_users," +
          "COUNT(*)::text AS payments," +
          "COALESCE(SUM(amount),0)::text AS revenue " +
          "FROM star_transactions WHERE status='SUCCESS' AND payload->>'type'='PAID_SPIN' AND payload->>'seasonId'=$1", params);

        const payout = await query<NumRow>(
          "SELECT " +
          "COUNT(*) FILTER (WHERE p.status IN ('PENDING','REVIEW'))::text AS pending_count," +
          "COUNT(*) FILTER (WHERE p.status='PAID')::text AS paid_count," +
          "COUNT(*) FILTER (WHERE p.kind<>'EMPTY' AND p.status IN ('PENDING','REVIEW'))::text AS pending_rewards," +
          "COALESCE(SUM(p.amount) FILTER (WHERE p.kind='STARS' AND p.status IN ('PENDING','REVIEW')),0)::text AS pending_stars," +
          "COALESCE(SUM(p.amount) FILTER (WHERE p.kind='STARS' AND p.status='PAID'),0)::text AS paid_stars," +
          "COALESCE(SUM(p.amount) FILTER (WHERE p.kind='MONEY' AND p.status IN ('PENDING','REVIEW')),0)::text AS pending_money " +
          "FROM payouts p JOIN spins s ON s.id=p.spin_id WHERE s.season_id=$1::uuid", params);

        const withdrawals = await query<NumRow>(
          "SELECT COUNT(*)::text AS requests, COUNT(*) FILTER (WHERE p.status='PAID')::text AS paid, " +
          "COALESCE(SUM(p.amount),0)::text AS requested_stars, COALESCE(SUM(p.amount) FILTER (WHERE p.status='PAID'),0)::text AS paid_stars " +
          "FROM payouts p WHERE p.note='WITHDRAWAL_REQUEST' AND p.user_id IS NOT NULL " +
          "AND EXISTS (SELECT 1 FROM stars_ledger sl WHERE sl.user_id=p.user_id AND sl.type='WITHDRAWAL' AND sl.season_id=$1::uuid)", params);

        const gifts = await query<NumRow>(
          "SELECT COUNT(*)::text AS claims, COUNT(DISTINCT user_id)::text AS users, " +
          "COUNT(*) FILTER (WHERE kind='STARS')::text AS stars_claims, " +
          "COALESCE(SUM(amount) FILTER (WHERE kind='STARS'),0)::text AS stars_awarded, " +
          "COUNT(*) FILTER (WHERE kind='FREE_SPIN')::text AS spin_claims, " +
          "COALESCE(SUM(amount) FILTER (WHERE kind='FREE_SPIN'),0)::text AS spins_awarded, " +
          "COUNT(*) FILTER (WHERE kind='XP')::text AS xp_claims, COALESCE(SUM(amount) FILTER (WHERE kind='XP'),0)::text AS xp_awarded " +
          "FROM daily_gift_claims WHERE season_id=$1::uuid", params);

        const streak = await query<NumRow>(
          "WITH season_days AS (" +
          " SELECT GREATEST(1,CEIL(EXTRACT(EPOCH FROM (COALESCE(s.ends_at,s.starts_at+interval '1 day')-s.starts_at))/86400.0))::int AS total_days FROM seasons s WHERE s.id=$1::uuid" +
          "), by_user AS (" +
          " SELECT c.user_id,COUNT(DISTINCT c.day_index)::int AS visited,MAX(c.day_index)::int AS max_day " +
          " FROM season_daily_checkins c WHERE c.season_id=$1::uuid GROUP BY c.user_id" +
          ") SELECT (SELECT total_days FROM season_days)::text AS total_days," +
          "COUNT(*)::text AS checkin_users," +
          "COUNT(*) FILTER (WHERE visited=(SELECT total_days FROM season_days))::text AS perfect_users," +
          "COALESCE(SUM(visited),0)::text AS checkins FROM by_user", params);

        const activity = await query<NumRow>(
          "SELECT COUNT(DISTINCT telegram_user_id)::text AS users,COUNT(*)::text AS events,COALESCE(SUM(activity_points),0)::text AS points " +
          "FROM channel_activity a JOIN users u ON u.telegram_id=a.telegram_user_id " +
          "WHERE u.is_test=FALSE AND a.occurred_at >= COALESCE((SELECT starts_at FROM seasons WHERE id=$1::uuid),now()) " +
          "AND a.occurred_at <= COALESCE((SELECT ends_at FROM seasons WHERE id=$1::uuid),now())", params);

        const prizes = await query<NumRow>(
          "WITH won AS (" +
          " SELECT s.prize_id,COUNT(*)::int AS won FROM spins s WHERE s.season_id=$1::uuid AND s.status='COMPLETED' AND s.prize_id IS NOT NULL GROUP BY s.prize_id" +
          ") SELECT p.id::text,p.kind,p.title,p.subtitle,p.amount::text,p.unit_cost::text,p.quantity_total::text,p.quantity_remaining::text,COALESCE(w.won,0)::text AS won," +
          "CASE WHEN p.quantity_total>0 THEN ROUND(100.0*(p.quantity_total-p.quantity_remaining)/p.quantity_total,1) ELSE 0 END::text AS consumed_pct " +
          "FROM prizes p LEFT JOIN won w ON w.prize_id=p.id WHERE p.season_id=$1::uuid ORDER BY COALESCE(w.won,0) DESC,p.quantity_total DESC,p.created_at ASC", params);

        const topUsers = await query<NumRow>(
          "SELECT u.id::text,u.username,u.first_name,u.last_name," +
          "COUNT(s.id) FILTER (WHERE s.status='COMPLETED')::text AS spins," +
          "COUNT(s.id) FILTER (WHERE s.status='COMPLETED' AND p.kind<>'EMPTY')::text AS wins," +
          "COUNT(s.id) FILTER (WHERE s.status='COMPLETED' AND s.type='PAID')::text AS paid_spins," +
          "COALESCE(SUM(p.amount) FILTER (WHERE s.status='COMPLETED' AND p.kind='STARS'),0)::text AS stars_won " +
          "FROM users u JOIN spins s ON s.user_id=u.id LEFT JOIN prizes p ON p.id=s.prize_id " +
          "WHERE s.season_id=$1::uuid AND u.is_test=FALSE GROUP BY u.id,u.username,u.first_name,u.last_name " +
          "ORDER BY COUNT(s.id) FILTER (WHERE s.status='COMPLETED') DESC,COUNT(s.id) FILTER (WHERE s.status='COMPLETED' AND p.kind<>'EMPTY') DESC,stars_won DESC LIMIT 10", params);

        const daily = await query<NumRow>(
          "SELECT TO_CHAR(d.day,'DD.MM') AS day," +
          "COUNT(s.id) FILTER (WHERE s.status='COMPLETED')::text AS spins," +
          "COUNT(s.id) FILTER (WHERE s.status='COMPLETED' AND s.type='FREE')::text AS free," +
          "COUNT(s.id) FILTER (WHERE s.status='COMPLETED' AND s.type='PAID')::text AS paid," +
          "COUNT(s.id) FILTER (WHERE s.status='COMPLETED' AND s.type IN ('OWNER_GIFT','ACTIVITY_BONUS','VETERAN_BONUS'))::text AS bonus," +
          "COUNT(DISTINCT s.user_id) FILTER (WHERE s.status='COMPLETED')::text AS active_users " +
          "FROM generate_series(" +
          "COALESCE((SELECT date_trunc('day',starts_at) FROM seasons WHERE id=$1::uuid),current_date)," +
          "COALESCE(date_trunc('day',(SELECT ends_at FROM seasons WHERE id=$1::uuid)),current_date)," +
          "interval '1 day') d(day) " +
          "LEFT JOIN spins s ON s.season_id=$1::uuid AND s.created_at>=d.day AND s.created_at<d.day+interval '1 day' " +
          "GROUP BY d.day ORDER BY d.day", params);

        const ranks = await query<NumRow>(
          "SELECT COALESCE(u.veteran_tier_override,'ROOKIE') AS tier,COUNT(DISTINCT s.user_id)::text AS users " +
          "FROM spins s JOIN users u ON u.id=s.user_id WHERE s.season_id=$1::uuid AND u.is_test=FALSE GROUP BY COALESCE(u.veteran_tier_override,'ROOKIE') ORDER BY users DESC", params);

        const totalDays = Number(streak.rows[0]?.total_days ?? 1);
        const completed = Number(overview.rows[0]?.completed ?? 0);
        const wins = Number(rewards.rows[0]?.wins ?? 0);
        const empty = Number(rewards.rows[0]?.empty_spins ?? 0);
        const revenue = Number(paid.rows[0]?.revenue ?? 0);
        const paidSpins = Number(overview.rows[0]?.paid_spins ?? 0);
        const paidUsers = Number(paid.rows[0]?.paid_users ?? 0);
        const pendingStars = Number(payout.rows[0]?.pending_stars ?? 0);
        const paidPrizeStars = Number(payout.rows[0]?.paid_stars ?? 0);
        const avgSpins = Number(overview.rows[0]?.participants ?? 0) ? completed / Number(overview.rows[0]?.participants ?? 0) : 0;
        const avgPaid = paidUsers ? revenue / paidUsers : 0;
        const durationHours = season.starts_at && season.ends_at ? Math.max(1, (new Date(season.ends_at).getTime()-new Date(season.starts_at).getTime())/3600000) : 0;

        return Response.json({
          ok:true,
          season:{
            id:season.id,code:season.code,name:season.name,state:season.state,startsAt:season.starts_at,endsAt:season.ends_at,
            isPaused:season.is_paused,pausedAt:season.paused_at,paidSpinPrice:Number(season.paid_spin_price),
            durationDays:season.starts_at&&season.ends_at?Math.max(1,(new Date(season.ends_at).getTime()-new Date(season.starts_at).getTime())/86400000):null
          },
          kpis:{
            participants:Number(overview.rows[0]?.participants??0),
            completedSpins:completed,attemptedSpins:Number(overview.rows[0]?.attempted??0),failedSpins:Number(overview.rows[0]?.failed??0),refundedSpins:Number(overview.rows[0]?.refunded??0),
            freeSpins:Number(overview.rows[0]?.free_spins??0),paidSpins,paidUsers,paidRevenueStars:revenue,avgSpinsPerParticipant:Number(avgSpins.toFixed(2)),avgPaidRevenuePerPayer:Number(avgPaid.toFixed(2)),
            wins,emptySpins:empty,winRate:completed?wins/completed:0,emptyRate:completed?empty/completed:0,repeatUsers:topUsers.rows.length,
          },
          bonusSpins:{ownerGift:Number(overview.rows[0]?.owner_gift_spins??0),activity:Number(overview.rows[0]?.activity_spins??0),veteran:Number(overview.rows[0]?.veteran_spins??0)},
          payouts:{
            pendingCount:Number(payout.rows[0]?.pending_count??0),paidCount:Number(payout.rows[0]?.paid_count??0),pendingRewards:Number(payout.rows[0]?.pending_rewards??0),
            pendingStars,payedStars:paidPrizeStars,pendingMoney:Number(payout.rows[0]?.pending_money??0)
          },
          withdrawals:{requests:Number(withdrawals.rows[0]?.requests??0),paid:Number(withdrawals.rows[0]?.paid??0),requestedStars:Number(withdrawals.rows[0]?.requested_stars??0),paidStars:Number(withdrawals.rows[0]?.paid_stars??0)},
          dailyGift:{claims:Number(gifts.rows[0]?.claims??0),users:Number(gifts.rows[0]?.users??0),starsClaims:Number(gifts.rows[0]?.stars_claims??0),starsAwarded:Number(gifts.rows[0]?.stars_awarded??0),spinClaims:Number(gifts.rows[0]?.spin_claims??0),spinsAwarded:Number(gifts.rows[0]?.spins_awarded??0),xpClaims:Number(gifts.rows[0]?.xp_claims??0),xpAwarded:Number(gifts.rows[0]?.xp_awarded??0)},
          streak:{totalDays,users:Number(streak.rows[0]?.checkin_users??0),perfectUsers:Number(streak.rows[0]?.perfect_users??0),checkins:Number(streak.rows[0]?.checkins??0),perfectRate:Number(streak.rows[0]?.checkin_users??0)?Number(streak.rows[0]?.perfect_users??0)/Number(streak.rows[0]?.checkin_users??0):0},
          activity:{users:Number(activity.rows[0]?.users??0),events:Number(activity.rows[0]?.events??0),points:Number(activity.rows[0]?.points??0)},
          prizes:prizes.rows,
          topUsers:topUsers.rows,
          ranks:ranks.rows,
          daily:daily.rows,
          meta:{durationHours,generatedAt:new Date().toISOString()}
        });
      } catch(error) {
        console.error("Season report API failed:",error instanceof Error?error.message:error);
        return Response.json({ok:false,code:error instanceof Error?error.message:"SEASON_REPORT_FAILED"},{status:400});
      }
    },
  }},
});
