import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";
import { appendStarsLedger, STARS_MAX_BALANCE } from "@/server/stars-ledger";

type ActionBody = { initData?: unknown; userId?: unknown; telegramId?: unknown; action?: unknown; amount?: unknown; random?: unknown; reason?: unknown };

export const Route = createFileRoute("/api/admin/balances")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
        const url = new URL(request.url);
        const search = (url.searchParams.get("search") ?? "").trim();
        const filter = url.searchParams.get("filter") ?? "all";
        const sort = url.searchParams.get("sort") ?? "balance_desc";
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
        const pattern = "%" + search.replaceAll("%", "\\%").replaceAll("_", "\\_") + "%";
        const orderBy = sort === "balance_asc"
          ? "COALESCE(us.stars_balance,0) ASC, u.created_at DESC"
          : sort === "recent"
            ? "u.last_seen_at DESC"
            : "COALESCE(us.stars_balance,0) DESC, u.last_seen_at DESC";
        const filterSql = filter === "positive"
          ? "AND COALESCE(us.stars_balance,0) > 0"
          : filter === "zero"
            ? "AND COALESCE(us.stars_balance,0) = 0"
            : "";

        const rows = await query(
          "SELECT u.id::text,u.telegram_id::text,u.username,u.first_name,u.last_name," +
          "COALESCE(us.stars_balance,0)::int AS stars_balance,COALESCE(sp.spins,0)::int AS spins," +
          "COALESCE(sp.wins,0)::int AS wins,COALESCE(pp.pending_stars,0)::text AS pending_stars,u.last_seen_at::text " +
          "FROM users u " +
          "LEFT JOIN user_state us ON us.user_id=u.id " +
          "LEFT JOIN (SELECT s.user_id,COUNT(*) FILTER (WHERE s.status='COMPLETED')::int AS spins," +
          "COUNT(*) FILTER (WHERE s.status='COMPLETED' AND p.prize_id IS NOT NULL AND p.kind<>'EMPTY')::int AS wins " +
          "FROM spins s LEFT JOIN payouts p ON p.spin_id=s.id GROUP BY s.user_id) sp ON sp.user_id=u.id " +
          "LEFT JOIN (SELECT user_id,COALESCE(SUM(amount) FILTER (WHERE kind='STARS' AND status IN ('PENDING','REVIEW')),0) AS pending_stars " +
          "FROM payouts GROUP BY user_id) pp ON pp.user_id=u.id " +
          "WHERE u.is_test=FALSE " + filterSql +
          " AND ($2='' OR u.telegram_id::text ILIKE $1 OR COALESCE(u.username,'') ILIKE $1 OR u.first_name ILIKE $1 OR COALESCE(u.last_name,'') ILIKE $1) " +
          "ORDER BY " + orderBy + " LIMIT $3",
          [pattern, search, limit],
        );

        const summary = await query(
          "SELECT COALESCE(SUM(COALESCE(us.stars_balance,0)),0)::text AS total_stars," +
          "COUNT(*) FILTER (WHERE COALESCE(us.stars_balance,0)>0)::text AS users_with_balance," +
          "COUNT(*)::text AS users_total FROM users u LEFT JOIN user_state us ON us.user_id=u.id " +
          "WHERE u.is_test=FALSE",
        );

        return Response.json({
          ok: true,
          users: rows.rows.map((row: any) => ({
            id: row.id,
            telegramId: row.telegram_id,
            username: row.username ? "@" + row.username.replace(/^@/,"") : "—",
            name: [row.first_name,row.last_name].filter(Boolean).join(" "),
            balance: Math.max(0, Math.min(STARS_MAX_BALANCE, Number(row.stars_balance) || 0)),
            spins: Number(row.spins) || 0,
            wins: Number(row.wins) || 0,
            pendingStars: Number(row.pending_stars) || 0,
            lastSeen: row.last_seen_at,
          })),
          summary: {
            totalStars: Number(summary.rows[0]?.total_stars ?? 0),
            usersWithBalance: Number(summary.rows[0]?.users_with_balance ?? 0),
            usersTotal: Number(summary.rows[0]?.users_total ?? 0),
          },
        });
      } catch (error) {
        console.error("Admin balances GET failed:", error instanceof Error ? error.message : error);
        return Response.json({ ok:false, code:"BALANCES_FAILED" }, { status:500 });
      }
    },

    POST: async ({ request }) => {
      try {
        const body = await request.json() as ActionBody;
        const admin = await authenticateAdmin(typeof body.initData === "string" ? body.initData : "");
        const action = String(body.action ?? "");
        const userId = String(body.userId ?? "").trim();
        const telegramId = String(body.telegramId ?? "").replace(/\D/g,"");
        const reason = String(body.reason ?? "").trim().slice(0,500);
        let amount = Number(body.amount);
        const random = body.random === true;

        if (!["STAR_ADJUST","FREE_SPIN_GRANT"].includes(action)) return Response.json({ok:false,code:"INVALID_ACTION"},{status:400});
        if (!reason) return Response.json({ok:false,code:"REASON_REQUIRED"},{status:400});
        if (action === "FREE_SPIN_GRANT" && random) amount = 1 + Math.floor(Math.random() * 5);

        const result = await withTransaction(async client => {
          const user = await client.query<{id:string;telegram_id:string;username:string|null}>(
            "SELECT id::text,telegram_id::text,username FROM users " +
            "WHERE is_test=FALSE AND ((NULLIF($1,'')::uuid IS NOT NULL AND id=NULLIF($1,'')::uuid) OR ($2<>'' AND telegram_id::text=$2)) " +
            "LIMIT 1 FOR UPDATE",
            [userId,telegramId],
          );
          if (!user.rows[0]) throw new Error("USER_NOT_FOUND");

          if (action === "STAR_ADJUST") {
            if (!Number.isSafeInteger(amount) || amount === 0 || amount < -STARS_MAX_BALANCE || amount > STARS_MAX_BALANCE) {
              throw new Error("INVALID_STARS_AMOUNT");
            }
            const state = await client.query<{stars_balance:number}>(
              "SELECT stars_balance FROM user_state WHERE user_id=$1::uuid FOR UPDATE",
              [user.rows[0].id],
            );
            const currentBalance = Number(state.rows[0]?.stars_balance ?? 0);
            const nextBalance = currentBalance + amount;
            if (nextBalance < 0 || nextBalance > STARS_MAX_BALANCE) throw new Error("STARS_BALANCE_LIMIT");

            await appendStarsLedger(client, {
              userId:user.rows[0].id,
              type:"ADMIN_CORRECTION",
              amount,
              balanceDelta:amount,
              idempotencyKey:"admin-balance:" + crypto.randomUUID(),
              referenceId:admin.id,
              metadata:{reason,source:"ADMIN_BALANCE_PANEL",adminId:admin.id},
            });
            await client.query(
              "INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data) VALUES($1::uuid,'ADMIN_STARS_BALANCE_ADJUSTED','user_state',$2,$3::jsonb,$4::jsonb)",
              [admin.id,user.rows[0].id,JSON.stringify({balance:currentBalance}),JSON.stringify({balance:nextBalance,delta:amount,reason})],
            );
            return { kind:"STARS", userId:user.rows[0].id, telegramId:user.rows[0].telegram_id,
              username:user.rows[0].username ? "@" + user.rows[0].username : "—", amount, balance:nextBalance };
          }

          if (!Number.isSafeInteger(amount) || amount < 1 || amount > 20) throw new Error("INVALID_FREE_SPIN_AMOUNT");
          const state = await client.query<{bonus_free_spins:number}>(
            "SELECT bonus_free_spins FROM user_state WHERE user_id=$1::uuid FOR UPDATE",
            [user.rows[0].id],
          );
          const currentBonus = Math.max(0, Number(state.rows[0]?.bonus_free_spins ?? 0));
          if (currentBonus + amount > 1000) throw new Error("BONUS_SPIN_LIMIT");

          await client.query("UPDATE user_state SET bonus_free_spins=bonus_free_spins+$2,updated_at=now() WHERE user_id=$1::uuid",[user.rows[0].id,amount]);
          await client.query(
            "INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'ADMIN_FREE_SPINS_GRANTED','user_state',$2,$3::jsonb)",
            [admin.id,user.rows[0].id,JSON.stringify({amount,random,reason})],
          );
          return { kind:"FREE_SPIN", userId:user.rows[0].id, telegramId:user.rows[0].telegram_id,
            username:user.rows[0].username ? "@" + user.rows[0].username : "—", amount, balance:currentBonus+amount };
        });

        return Response.json({ok:true,result});
      } catch (error) {
        const code = error instanceof Error ? error.message : "BALANCE_ACTION_FAILED";
        const status = code === "USER_NOT_FOUND" ? 404 : ["STARS_BALANCE_LIMIT","BONUS_SPIN_LIMIT"].includes(code) ? 409 : 400;
        console.error("Admin balances POST failed:",code);
        return Response.json({ok:false,code},{status});
      }
    },
  }},
});
