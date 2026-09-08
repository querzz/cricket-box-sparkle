import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { query } from "@/server/db";
import { enforceRateLimit, RateLimitError } from "@/server/rate-limit";

export const Route = createFileRoute("/api/payment/status")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const url = new URL(request.url);
        const initData = (url.searchParams.get("initData") ?? "").trim();
        const payload = (url.searchParams.get("payload") ?? "").trim();
        if (!initData) return Response.json({ ok: false, code: "INIT_DATA_MISSING" }, { status: 400 });
        if (!payload || !payload.startsWith("paidspin:v1:")) return Response.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 });

        const validated = await validateTelegramInitData(initData, requireBotToken());
        const telegramId = validated.user?.id;
        if (!telegramId) return Response.json({ ok: false, code: "TELEGRAM_USER_MISSING" }, { status: 400 });
        await enforceRateLimit(`payment-status:${telegramId}`, 60);

        const user = await query<{ id: string }>(`SELECT id::text FROM users WHERE telegram_id=$1 LIMIT 1`, [telegramId]);
        if (!user.rows[0]) return Response.json({ ok: false, code: "USER_NOT_FOUND" }, { status: 404 });

        const transaction = await query<{
          status: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
          amount: string;
          spin_id: string | null;
          telegram_charge_id: string | null;
          processed_at: string | null;
          created_at: string;
        }>(
          `SELECT status,amount::text,spin_id::text,telegram_charge_id,processed_at::text,created_at::text
             FROM star_transactions
            WHERE user_id=$1::uuid
              AND payload->>'payload'=$2
              AND payload->>'type'='PAID_SPIN'
            ORDER BY created_at DESC,id DESC
            LIMIT 1`,
          [user.rows[0].id, payload],
        );
        const tx = transaction.rows[0];
        if (!tx) return Response.json({ ok: false, code: "PAYMENT_NOT_FOUND" }, { status: 404 });

        let spin: { id: string; prize_kind: string; prize_title: string; prize_subtitle: string | null; prize_amount: string; payout_status: string | null } | null = null;
        if (tx.spin_id) {
          const spinResult = await query<{ id: string; prize_kind: string; prize_title: string; prize_subtitle: string | null; prize_amount: string; payout_status: string | null }>(
            `SELECT s.id::text,p.kind AS prize_kind,p.title AS prize_title,p.subtitle AS prize_subtitle,p.amount::text AS prize_amount,py.status AS payout_status
               FROM spins s
               JOIN prizes p ON p.id=s.prize_id
               LEFT JOIN payouts py ON py.spin_id=s.id
              WHERE s.id=$1::uuid
              LIMIT 1`,
            [tx.spin_id],
          );
          spin = spinResult.rows[0] ?? null;
        }

        return Response.json({
          ok: true,
          status: tx.status,
          payload,
          amount: Number(tx.amount),
          chargeId: tx.telegram_charge_id,
          createdAt: tx.created_at,
          processedAt: tx.processed_at,
          spin: spin ? {
            id: spin.id,
            reward: {
              kind: spin.prize_kind,
              title: spin.prize_title,
              subtitle: spin.prize_subtitle,
              amount: Number(spin.prize_amount) || undefined,
              status: spin.payout_status === "PAID" || spin.prize_kind === "STARS" || spin.prize_kind === "EMPTY" ? "RECEIVED" : "PENDING",
              payoutStatus: spin.payout_status,
            },
          } : null,
        });
      } catch (error) {
        if (error instanceof RateLimitError) return Response.json({ ok: false, code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
        console.error("Payment status API failed:", error instanceof Error ? error.message : error);
        return Response.json({ ok: false, code: "PAYMENT_STATUS_FAILED" }, { status: 400 });
      }
    },
  }},
});
