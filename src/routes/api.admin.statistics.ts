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
        let seasonId: string | null = null;
        if (scope === "current") {
          const season = await query<{ id: string }>(`SELECT id::text FROM seasons ORDER BY CASE WHEN state='ACTIVE' THEN 0 WHEN state='ENDING' THEN 1 ELSE 2 END, created_at DESC LIMIT 1`);
          seasonId = season.rows[0]?.id ?? null;
        }

        const seasonFilter = seasonId ? `AND s.season_id = $1::uuid` : "";
        const params = seasonId ? [seasonId] : [];
        const users = await query<{ value: string }>(`SELECT COUNT(DISTINCT s.user_id)::text AS value FROM spins s WHERE s.status='COMPLETED' ${seasonFilter}`, params);
        const spins = await query<{ total: string; free: string; paid: string }>(`SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE type='FREE')::text AS free, COUNT(*) FILTER (WHERE type='PAID')::text AS paid FROM spins s WHERE s.status='COMPLETED' ${seasonFilter}`, params);
        const wins = await query<{ value: string }>(`SELECT COUNT(*)::text AS value FROM payouts py LEFT JOIN spins s ON s.id=py.spin_id WHERE py.prize_id IS NOT NULL ${seasonFilter ? `AND s.season_id = $1::uuid` : ""}`, params);
        const prizeStars = await query<{ value: string }>(`SELECT COALESCE(SUM(py.amount),0)::text AS value FROM payouts py LEFT JOIN spins s ON s.id=py.spin_id WHERE py.kind='STARS' AND py.prize_id IS NOT NULL ${seasonFilter ? `AND s.season_id = $1::uuid` : ""}`, params);
        const payoutPending = await query<{ value: string }>(`SELECT COUNT(*)::text AS value FROM payouts py LEFT JOIN spins s ON s.id=py.spin_id WHERE py.status IN ('PENDING','REVIEW') ${seasonFilter ? `AND (s.season_id = $1::uuid OR py.note='WITHDRAWAL_REQUEST')` : ""}`, params);
        const withdrawals = await query<{ total: string; paid: string }>(`SELECT COUNT(*) FILTER (WHERE note='WITHDRAWAL_REQUEST')::text AS total, COUNT(*) FILTER (WHERE note='WITHDRAWAL_REQUEST' AND status='PAID')::text AS paid FROM payouts`, []);
        const revenue = await query<{ value: string }>(`SELECT COALESCE(SUM(amount),0)::text AS value FROM star_transactions WHERE status='SUCCESS'`);
        const newUsers = await query<{ day: string; value: string }>(`SELECT to_char(d.day,'DD.MM') AS day, COUNT(u.id)::text AS value FROM generate_series(current_date - interval '6 days', current_date, interval '1 day') d(day) LEFT JOIN users u ON u.created_at >= d.day AND u.created_at < d.day + interval '1 day' GROUP BY d.day ORDER BY d.day`);
        const spinDays = await query<{ day: string; value: string }>(`SELECT to_char(d.day,'DD.MM') AS day, COUNT(s.id)::text AS value FROM generate_series(current_date - interval '6 days', current_date, interval '1 day') d(day) LEFT JOIN spins s ON s.created_at >= d.day AND s.created_at < d.day + interval '1 day' AND s.status='COMPLETED' ${seasonId ? `AND s.season_id=$1::uuid` : ""} GROUP BY d.day ORDER BY d.day`, params);
        const participantsToday = await query<{ value: string }>(`SELECT COUNT(DISTINCT user_id)::text AS value FROM spins WHERE status='COMPLETED' AND created_at >= current_date ${seasonId ? `AND season_id=$1::uuid` : ""}`, params);
        return Response.json({
          ok: true,
          scope,
          seasonId,
          metrics: {
            participants: Number(users.rows[0]?.value ?? 0),
            spins: Number(spins.rows[0]?.total ?? 0),
            freeSpins: Number(spins.rows[0]?.free ?? 0),
            paidSpins: Number(spins.rows[0]?.paid ?? 0),
            wins: Number(wins.rows[0]?.value ?? 0),
            starsRevenue: Number(revenue.rows[0]?.value ?? 0),
            starsPrizeValue: Number(prizeStars.rows[0]?.value ?? 0),
            pendingPayouts: Number(payoutPending.rows[0]?.value ?? 0),
            withdrawalRequests: Number(withdrawals.rows[0]?.total ?? 0),
            completedWithdrawals: Number(withdrawals.rows[0]?.paid ?? 0),
            dailyActiveToday: Number(participantsToday.rows[0]?.value ?? 0),
          },
          daily: {
            users: newUsers.rows.map((r) => Number(r.value)),
            userLabels: newUsers.rows.map((r) => r.day),
            spins: spinDays.rows.map((r) => Number(r.value)),
          },
        });
      } catch (error) {
        console.error("Admin statistics API failed:", error instanceof Error ? error.message : error);
        return Response.json({ ok: false, code: "STATISTICS_FAILED" }, { status: 400 });
      }
    },
  }},
});
