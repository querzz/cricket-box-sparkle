import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query } from "@/server/db";

export const Route = createFileRoute("/api/admin/statistics")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const url = new URL(request.url);
        await authenticateAdmin(url.searchParams.get("initData") ?? "");
        const scope = url.searchParams.get("scope") === "all" ? "all" : "current";
        const requestedSeasonId = (url.searchParams.get("seasonId") ?? "").trim();
        const rawDays = Number(url.searchParams.get("days") ?? 7);
        const days = rawDays === 1 || rawDays === 30 ? rawDays : 7;
        const seriesStart = days === 1 ? "current_date" : "current_date - interval '" + String(days - 1) + " days'";
        const spinDateFilter = days === 1
          ? "AND s.created_at >= current_date"
          : "AND s.created_at >= current_date - interval '" + String(days - 1) + " days'";
        const ledgerDateFilter = days === 1
          ? "AND sl.created_at >= current_date"
          : "AND sl.created_at >= current_date - interval '" + String(days - 1) + " days'";
        const transactionDateFilter = days === 1
          ? "AND st.created_at >= current_date"
          : "AND st.created_at >= current_date - interval '" + String(days - 1) + " days'";
        const payoutDateFilter = days === 1
          ? "AND py.created_at >= current_date"
          : "AND py.created_at >= current_date - interval '" + String(days - 1) + " days'";
        const withdrawalDateFilter = days === 1
          ? "AND p.created_at >= current_date"
          : "AND p.created_at >= current_date - interval '" + String(days - 1) + " days'";
        let seasonId: string | null = requestedSeasonId || null;
        if (!seasonId && scope === "current") {
          const season = await query<{ id: string }>(`SELECT id::text FROM seasons
           WHERE state IN ('ACTIVE','ENDING','CLOSED','PAYOUT','ARCHIVED')
           ORDER BY CASE
             WHEN state='ACTIVE' THEN 0
             WHEN state='ENDING' THEN 1
             WHEN state='PAYOUT' THEN 2
             WHEN state='CLOSED' THEN 3
             WHEN state='ARCHIVED' THEN 4
             ELSE 5
           END, created_at DESC
           LIMIT 1`);
          seasonId = season.rows[0]?.id ?? null;
        }
        const seasonFilter = seasonId ? `AND s.season_id = $1::uuid` : "";
        const params = seasonId ? [seasonId] : [];
        const spinSeasonPredicate = seasonId ? `AND s.season_id=$1::uuid` : "";
        const payoutSeasonPredicate = seasonId ? `AND sp.season_id=$1::uuid` : "";

        const users = await query<{ value: string }>(`SELECT COUNT(DISTINCT s.user_id)::text AS value FROM spins s JOIN users u ON u.id=s.user_id WHERE s.status='COMPLETED' AND u.is_test=FALSE ${seasonFilter} ${spinDateFilter}`, params);
        const spins = await query<{ total: string; attempted: string; free: string; paid: string }>(`SELECT COUNT(*) FILTER (WHERE s.status='COMPLETED')::text AS total, COUNT(*)::text AS attempted, COUNT(*) FILTER (WHERE s.status='COMPLETED' AND s.type='FREE')::text AS free, COUNT(*) FILTER (WHERE s.status='COMPLETED' AND s.type='PAID')::text AS paid FROM spins s JOIN users u ON u.id=s.user_id WHERE u.is_test=FALSE ${seasonFilter} ${spinDateFilter}`, params);
        const wins = await query<{ value: string }>(`SELECT COUNT(*)::text AS value FROM spins s JOIN users u ON u.id=s.user_id LEFT JOIN prizes p ON p.id=s.prize_id WHERE s.status='COMPLETED' AND p.kind<>'EMPTY' AND u.is_test=FALSE ${seasonFilter} ${spinDateFilter}`, params);
        const prizeStars = await query<{ value: string }>(`SELECT COALESCE(SUM(sl.amount),0)::text AS value FROM stars_ledger sl JOIN users u ON u.id=sl.user_id WHERE sl.type='REWARD' AND sl.spin_id IS NOT NULL AND u.is_test=FALSE ${ledgerDateFilter} ${seasonId ? `AND sl.season_id=$1::uuid` : ""}`, params);
        const payoutPending = await query<{ value: string }>(`SELECT COUNT(*)::text AS value FROM payouts py LEFT JOIN spins sp ON sp.id=py.spin_id JOIN users u ON u.id=py.user_id WHERE py.status IN ('PENDING','REVIEW') AND u.is_test=FALSE ${payoutDateFilter} AND NOT (py.kind='STARS' AND py.note NOT LIKE 'WITHDRAWAL_REQUEST%') ${seasonId ? `AND (sp.season_id=$1::uuid OR py.note LIKE 'WITHDRAWAL_REQUEST%')` : ""}`, params);
        const withdrawalFilter = seasonId ? `AND (EXISTS (SELECT 1 FROM spins sp WHERE sp.id=p.spin_id AND sp.season_id=$1::uuid) OR p.note='WITHDRAWAL_REQUEST')` : "";
        const withdrawals = await query<{ total: string; paid: string }>(`SELECT COUNT(*) FILTER (WHERE p.note='WITHDRAWAL_REQUEST')::text AS total, COUNT(*) FILTER (WHERE p.note='WITHDRAWAL_REQUEST' AND p.status='PAID')::text AS paid FROM payouts p JOIN users u ON u.id=p.user_id AND u.is_test=FALSE WHERE TRUE ${withdrawalFilter} ${withdrawalDateFilter}`, params);
        const revenue = await query<{ value: string }>(`SELECT COALESCE(SUM(amount),0)::text AS value FROM star_transactions st JOIN users u ON u.id=st.user_id WHERE st.status='SUCCESS' AND st.payload->>'type'='PAID_SPIN' AND u.is_test=FALSE ${transactionDateFilter} ${seasonId ? `AND st.payload->>'seasonId'=$1` : ""}`, params);
        const newUsers = await query<{ day: string; value: string }>("SELECT to_char(d.day,'DD.MM') AS day, COUNT(u.id)::text AS value FROM generate_series(" + seriesStart + ", current_date, interval '1 day') d(day) LEFT JOIN users u ON u.is_test=FALSE AND u.created_at >= d.day AND u.created_at < d.day + interval '1 day' GROUP BY d.day ORDER BY d.day");
        const spinDays = await query<{ day: string; value: string; free: string; paid: string; bonus: string }>("SELECT to_char(d.day,'DD.MM') AS day, COUNT(s.id) FILTER (WHERE s.status='COMPLETED')::text AS value, COUNT(s.id) FILTER (WHERE s.status='COMPLETED' AND s.type='FREE')::text AS free, COUNT(s.id) FILTER (WHERE s.status='COMPLETED' AND s.type='PAID')::text AS paid, COUNT(s.id) FILTER (WHERE s.status='COMPLETED' AND s.type IN ('ACTIVITY_BONUS','VETERAN_BONUS','OWNER_GIFT'))::text AS bonus FROM generate_series(" + seriesStart + ", current_date, interval '1 day') d(day) LEFT JOIN spins s ON s.created_at >= d.day AND s.created_at < d.day + interval '1 day' AND s.status='COMPLETED' AND EXISTS (SELECT 1 FROM users u WHERE u.id=s.user_id AND u.is_test=FALSE) " + (seasonId ? "AND s.season_id=$1::uuid" : "") + " GROUP BY d.day ORDER BY d.day", params);
        const participantsToday = await query<{ value: string }>(`SELECT COUNT(DISTINCT s.user_id)::text AS value FROM spins s JOIN users u ON u.id=s.user_id WHERE s.status='COMPLETED' AND u.is_test=FALSE AND s.created_at >= current_date ${seasonId ? `AND s.season_id=$1::uuid` : ""}`, params);

        const registered = await query<{ value: string }>(`SELECT COUNT(*)::text AS value FROM users WHERE is_test=FALSE`);
        const repeatUsers = await query<{ value: string }>(`SELECT COUNT(*)::text AS value FROM (SELECT s.user_id FROM spins s JOIN users u ON u.id=s.user_id WHERE s.status='COMPLETED' AND u.is_test=FALSE ${spinSeasonPredicate} ${spinDateFilter} GROUP BY s.user_id HAVING COUNT(*)>=2) x`, params);
        const paidUsers = await query<{ value: string }>(`SELECT COUNT(DISTINCT s.user_id)::text AS value FROM spins s JOIN users u ON u.id=s.user_id WHERE s.status='COMPLETED' AND s.type='PAID' AND u.is_test=FALSE ${spinSeasonPredicate} ${spinDateFilter}`, params);
        const failedSpins = await query<{ value: string }>(`SELECT COUNT(*)::text AS value FROM spins s JOIN users u ON u.id=s.user_id WHERE s.status='FAILED' AND u.is_test=FALSE ${seasonFilter} ${spinDateFilter}`, params);
        const cohortRetention = await query<{ eligible_d1: string; retained_d1: string; eligible_d7: string; retained_d7: string }>(`
          WITH first_spins AS (
            SELECT s.user_id, MIN(s.created_at::date) AS cohort_day
            FROM spins s
            JOIN users u ON u.id=s.user_id AND u.is_test=FALSE
            WHERE s.status='COMPLETED' ${spinSeasonPredicate}
            GROUP BY s.user_id
          ),
          retention AS (
            SELECT f.user_id, f.cohort_day,
              EXISTS(SELECT 1 FROM spins s1 WHERE s1.user_id=f.user_id AND s1.status='COMPLETED' ${seasonId ? `AND s1.season_id=$1::uuid` : ""} AND s1.created_at::date=f.cohort_day+1) AS d1,
              EXISTS(SELECT 1 FROM spins s7 WHERE s7.user_id=f.user_id AND s7.status='COMPLETED' ${seasonId ? `AND s7.season_id=$1::uuid` : ""} AND s7.created_at::date=f.cohort_day+7) AS d7
            FROM first_spins f
          )
          SELECT
            COUNT(*) FILTER (WHERE cohort_day <= current_date-1)::text AS eligible_d1,
            COUNT(*) FILTER (WHERE cohort_day <= current_date-1 AND d1)::text AS retained_d1,
            COUNT(*) FILTER (WHERE cohort_day <= current_date-7)::text AS eligible_d7,
            COUNT(*) FILTER (WHERE cohort_day <= current_date-7 AND d7)::text AS retained_d7
          FROM retention`, params);

        const metricParticipants = Number(users.rows[0]?.value ?? 0);
        const totalSpins = Number(spins.rows[0]?.total ?? 0);
        const attemptedSpins = Number(spins.rows[0]?.attempted ?? 0);
        const winCount = Number(wins.rows[0]?.value ?? 0);
        const repeatCount = Number(repeatUsers.rows[0]?.value ?? 0);
        const paidUserCount = Number(paidUsers.rows[0]?.value ?? 0);
        const failedSpinCount = Number(failedSpins.rows[0]?.value ?? 0);
        const registeredUsers = Number(registered.rows[0]?.value ?? 0);
        const eligibleD1 = Number(cohortRetention.rows[0]?.eligible_d1 ?? 0);
        const retainedD1 = Number(cohortRetention.rows[0]?.retained_d1 ?? 0);
        const eligibleD7 = Number(cohortRetention.rows[0]?.eligible_d7 ?? 0);
        const retainedD7 = Number(cohortRetention.rows[0]?.retained_d7 ?? 0);

        return Response.json({
          ok: true,
          scope,
          seasonId,
          metrics: {
            participants: metricParticipants,
            spins: totalSpins,
            attemptedSpins,
            failedSpins: failedSpinCount,
            freeSpins: Number(spins.rows[0]?.free ?? 0),
            paidSpins: Number(spins.rows[0]?.paid ?? 0),
            wins: winCount,
            starsRevenue: Number(revenue.rows[0]?.value ?? 0),
            starsPrizeValue: Number(prizeStars.rows[0]?.value ?? 0),
            pendingPayouts: Number(payoutPending.rows[0]?.value ?? 0),
            withdrawalRequests: Number(withdrawals.rows[0]?.total ?? 0),
            completedWithdrawals: Number(withdrawals.rows[0]?.paid ?? 0),
            dailyActiveToday: Number(participantsToday.rows[0]?.value ?? 0),
            funnel: {
              registeredUsers,
              participants: metricParticipants,
              participantRate: registeredUsers ? metricParticipants / registeredUsers : 0,
              spinCompletionRate: attemptedSpins ? totalSpins / attemptedSpins : 0,
              winnerRate: totalSpins ? winCount / totalSpins : 0,
              paidUsers: paidUserCount,
              paidConversionRate: metricParticipants ? paidUserCount / metricParticipants : 0,
              repeatUsers: repeatCount,
              repeatRate: metricParticipants ? repeatCount / metricParticipants : 0,
            },
            retention: {
              d1Eligible: eligibleD1,
              d1Retained: retainedD1,
              d1Rate: eligibleD1 ? retainedD1 / eligibleD1 : 0,
              d7Eligible: eligibleD7,
              d7Retained: retainedD7,
              d7Rate: eligibleD7 ? retainedD7 / eligibleD7 : 0,
            },
          },
          days,
          daily: {
            users: newUsers.rows.map((r) => Number(r.value)),
            userLabels: newUsers.rows.map((r) => r.day),
            spins: spinDays.rows.map((r) => Number(r.value)),
            freeSpins: spinDays.rows.map((r) => Number(r.free)),
            paidSpins: spinDays.rows.map((r) => Number(r.paid)),
            bonusSpins: spinDays.rows.map((r) => Number(r.bonus)),
          },
        });
      } catch (error) {
        console.error("Admin statistics API failed:", error instanceof Error ? error.message : error);
        return Response.json({ ok: false, code: "STATISTICS_FAILED" }, { status: 400 });
      }
    },
  }},
});
