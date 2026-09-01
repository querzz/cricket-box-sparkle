import { createFileRoute } from "@tanstack/react-router";
import type { PoolClient } from "pg";
import { authenticateAdmin } from "@/server/auth/access";
import { withTransaction, query } from "@/server/db";

type PayoutRow = {
  id: string;
  created_at: string;
  telegram_id: string;
  username: string | null;
  kind: "STARS" | "PREMIUM" | "MONEY" | "NFT" | "PHYSICAL" | "CUSTOM" | "FREE_SPIN";
  amount: string;
  currency: string | null;
  status: "PENDING" | "REVIEW" | "PAID" | "FAILED" | "CANCELLED";
  note: string | null;
  prize_title: string | null;
  prize_subtitle: string | null;
};

type Status = PayoutRow["status"];

async function changePayout(client: PoolClient, adminId: string, id: string, nextStatus: Status) {
  const payout = await client.query<{ user_id: string; kind: string; amount: string; status: Status; note: string | null }>(
    `SELECT user_id::text, kind, amount::text, status, note FROM payouts WHERE id=$1::uuid FOR UPDATE`, [id],
  );
  if (!payout.rows[0]) throw new Error("NOT_FOUND");
  const before = payout.rows[0];
  if (before.status === nextStatus) return false;

  const valid =
    (before.status === "PENDING" && ["REVIEW", "FAILED", "CANCELLED"].includes(nextStatus)) ||
    (before.status === "REVIEW" && ["PAID", "FAILED", "CANCELLED"].includes(nextStatus));
  if (!valid) throw new Error("INVALID_TRANSITION");

  await client.query(
    `UPDATE payouts
        SET status=$2, operator_admin_id=$3::uuid,
            paid_at=CASE WHEN $2='PAID' THEN COALESCE(paid_at, now()) ELSE paid_at END,
            updated_at=now()
      WHERE id=$1::uuid`,
    [id, nextStatus, adminId],
  );

  const isWithdrawal = before.note === "WITHDRAWAL_REQUEST" && before.kind === "STARS";
  if (isWithdrawal && ["FAILED", "CANCELLED"].includes(nextStatus) && ["PENDING", "REVIEW"].includes(before.status)) {
    await client.query(
      `UPDATE user_state SET stars_balance = LEAST(500, stars_balance + $2), updated_at = now() WHERE user_id = $1::uuid`,
      [before.user_id, Number(before.amount)],
    );
    await client.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, after_data)
       VALUES ($1::uuid,'WITHDRAWAL_REFUNDED','payout',$2,$3::jsonb)`,
      [adminId, id, JSON.stringify({ amount: Number(before.amount), reason: nextStatus })],
    );
  }

  await client.query(
    `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, before_data, after_data)
     VALUES ($1::uuid,'PAYOUT_STATUS_CHANGED','payout',$2,$3::jsonb,$4::jsonb)`,
    [adminId, id, JSON.stringify(before), JSON.stringify({ status: nextStatus })],
  );
  return true;
}

export const Route = createFileRoute("/api/admin/payouts")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const url = new URL(request.url);
        const initData = url.searchParams.get("initData") ?? "";
        const search = (url.searchParams.get("search") ?? "").trim();
        const status = (url.searchParams.get("status") ?? "") as Status | "";
        await authenticateAdmin(initData);
        const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        const result = await query<PayoutRow>(
          `SELECT py.id::text, py.created_at::text, u.telegram_id::text, u.username,
                  py.kind, py.amount::text, py.currency, py.status, py.note,
                  p.title AS prize_title, p.subtitle AS prize_subtitle
             FROM payouts py
             JOIN users u ON u.id = py.user_id
             LEFT JOIN prizes p ON p.id = py.prize_id
            WHERE ($2 = '' OR py.id::text ILIKE $1 OR u.telegram_id::text ILIKE $1 OR COALESCE(u.username,'') ILIKE $1 OR COALESCE(p.title,'') ILIKE $1)
              AND ($3 = '' OR py.status = $3)
            ORDER BY py.created_at DESC LIMIT 200`,
          [pattern, search, status],
        );
        const counts = await query<{ pending: string; review: string; paid: string; failed: string; cancelled: string }>(
          `SELECT COUNT(*) FILTER (WHERE status='PENDING')::text AS pending,
                  COUNT(*) FILTER (WHERE status='REVIEW')::text AS review,
                  COUNT(*) FILTER (WHERE status='PAID')::text AS paid,
                  COUNT(*) FILTER (WHERE status='FAILED')::text AS failed,
                  COUNT(*) FILTER (WHERE status='CANCELLED')::text AS cancelled
             FROM payouts`,
        );
        return Response.json({
          ok: true,
          counts: {
            pending: Number(counts.rows[0]?.pending ?? 0),
            review: Number(counts.rows[0]?.review ?? 0),
            paid: Number(counts.rows[0]?.paid ?? 0),
            failed: Number(counts.rows[0]?.failed ?? 0),
            cancelled: Number(counts.rows[0]?.cancelled ?? 0),
          },
          payouts: result.rows.map((row) => ({
            id: row.id,
            time: row.created_at,
            username: row.username ? `@${row.username.replace(/^@/, "")}` : "—",
            telegramId: row.telegram_id,
            prize: row.prize_title ? [row.prize_title, row.prize_subtitle].filter(Boolean).join(" · ") : (row.note === "WITHDRAWAL_REQUEST" ? "Вывод Stars" : "Без привязанного приза"),
            type: row.kind === "STARS" ? "Stars" : row.kind === "PREMIUM" ? "Premium" : "Деньги",
            amount: row.kind === "STARS" ? `${row.amount} ⭐` : `${row.amount} ${row.currency ?? ""}`.trim(),
            status: row.status === "PENDING" ? "Ожидает" : row.status === "REVIEW" ? "На проверке" : row.status === "PAID" ? "Выдан" : row.status === "CANCELLED" ? "Отменён" : "Ошибка",
          })),
        });
      } catch (error) {
        console.error("Payouts API failed:", error instanceof Error ? error.message : error);
        return Response.json({ ok: false, code: "PAYOUTS_FAILED" }, { status: 401 });
      }
    },

    PATCH: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: unknown; id?: unknown; status?: unknown };
        const admin = await authenticateAdmin(typeof body.initData === "string" ? body.initData : "");
        const id = typeof body.id === "string" ? body.id : "";
        const nextStatus = typeof body.status === "string" ? body.status as Status : "" as Status;
        if (!id || !["PENDING", "REVIEW", "PAID", "FAILED", "CANCELLED"].includes(nextStatus)) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
        await withTransaction(async (client) => { await changePayout(client, admin.id, id, nextStatus); });
        return Response.json({ ok: true });
      } catch (error) {
        console.error("Payout update failed:", error instanceof Error ? error.message : error);
        const code = error instanceof Error ? error.message : "PAYOUT_UPDATE_FAILED";
        return Response.json({ ok: false, code }, { status: code === "NOT_FOUND" ? 404 : code === "INVALID_TRANSITION" ? 409 : 400 });
      }
    },

    POST: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: unknown; ids?: unknown; status?: unknown };
        const admin = await authenticateAdmin(typeof body.initData === "string" ? body.initData : "");
        const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];
        const nextStatus = typeof body.status === "string" ? body.status as Status : "" as Status;
        if (!ids.length || !["REVIEW", "PAID", "FAILED", "CANCELLED"].includes(nextStatus) || ids.length > 100) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
        const uniqueIds = [...new Set(ids)];
        await withTransaction(async (client) => {
          for (const id of uniqueIds) await changePayout(client, admin.id, id, nextStatus);
        });
        return Response.json({ ok: true, count: uniqueIds.length });
      } catch (error) {
        console.error("Bulk payout update failed:", error instanceof Error ? error.message : error);
        const code = error instanceof Error ? error.message : "PAYOUT_BULK_FAILED";
        return Response.json({ ok: false, code }, { status: code === "NOT_FOUND" ? 404 : code === "INVALID_TRANSITION" ? 409 : 400 });
      }
    },
  }}
});
