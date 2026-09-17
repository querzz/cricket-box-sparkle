import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { query, withTransaction } from "@/server/db";
import { enforceRateLimit, RateLimitError } from "@/server/rate-limit";

type PendingPayment = {
  id: string;
  payload: string;
  amount: string;
  status: "PENDING" | "REFUND_PENDING";
  created_at: string;
  metadata: Record<string, unknown>;
};

type InvoiceContext = {
  id: string;
  payload: string;
  price: number;
  recovery: boolean;
  storedInvoiceUrl: string | null;
};

async function createTelegramInvoice(seasonCode: string, payload: string, amount: number) {
  const response = await fetch(`https://api.telegram.org/bot${requireBotToken()}/createInvoiceLink`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "CRICKET BOX — дополнительная прокрутка",
      description: `Дополнительная прокрутка сезона ${seasonCode}`,
      payload,
      currency: "XTR",
      prices: [{ label: "Дополнительная прокрутка", amount }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json() as { ok: boolean; result?: string; description?: string };
  if (!data.ok || !data.result) throw new Error("INVOICE_CREATE_FAILED");
  return data.result;
}

async function persistInvoiceUrl(transactionId: string, invoiceUrl: string) {
  return withTransaction(async client => {
    const result = await client.query<{ invoice_url: string | null }>(
      `UPDATE star_transactions
          SET payload=payload||jsonb_build_object('invoiceUrl',$2::text)
        WHERE id=$1::uuid AND status='PENDING'
      RETURNING payload->>'invoiceUrl' AS invoice_url`,
      [transactionId, invoiceUrl],
    );
    if (result.rows[0]?.invoice_url) return result.rows[0].invoice_url;

    const existing = await client.query<{ invoice_url: string | null; status: string }>(
      `SELECT payload->>'invoiceUrl' AS invoice_url,status
         FROM star_transactions
        WHERE id=$1::uuid
        FOR UPDATE`,
      [transactionId],
    );
    if (existing.rows[0]?.invoice_url) return existing.rows[0].invoice_url;
    if (existing.rows[0]?.status === "REFUND_PENDING") throw new Error("PAYMENT_REFUND_PENDING");
    throw new Error("INVOICE_PERSIST_FAILED");
  });
}

export const Route = createFileRoute("/api/payment/invoice")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: unknown };
        const initData = typeof body.initData === "string" ? body.initData.trim() : "";
        if (!initData) return Response.json({ ok: false, code: "INIT_DATA_MISSING" }, { status: 400 });

        const validated = await validateTelegramInitData(initData, requireBotToken());
        const telegramId = validated.user?.id;
        if (!telegramId) return Response.json({ ok: false, code: "TELEGRAM_USER_MISSING" }, { status: 400 });
        await enforceRateLimit(`payment-invoice:${telegramId}`, 6);

        const user = await query<{ id: string }>(`SELECT id::text FROM users WHERE telegram_id=$1 LIMIT 1`, [telegramId]);
        if (!user.rows[0]) return Response.json({ ok: false, code: "USER_NOT_FOUND" }, { status: 404 });

        const state = await query<{ is_subscribed: boolean; is_participant: boolean }>(`SELECT is_subscribed,is_participant FROM user_state WHERE user_id=$1::uuid LIMIT 1`, [user.rows[0].id]);
        if (!state.rows[0]?.is_subscribed) return Response.json({ ok: false, code: "NOT_SUBSCRIBED" }, { status: 403 });
        if (!state.rows[0]?.is_participant) return Response.json({ ok: false, code: "NOT_PARTICIPANT" }, { status: 403 });

        const season = await query<{ id: string; code: string; state: string; paid_spin_price: number; paid_spin_enabled: boolean }>(
          `SELECT id::text,code,state,paid_spin_price,paid_spin_enabled
             FROM seasons
            WHERE state IN ('ACTIVE','ENDING')
            ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END,created_at DESC
            LIMIT 1`,
        );
        const current = season.rows[0];
        if (!current) return Response.json({ ok: false, code: "SEASON_NOT_ACTIVE" }, { status: 409 });
        if (!current.paid_spin_enabled) return Response.json({ ok: false, code: "PAID_SPIN_DISABLED" }, { status: 409 });

        const context = await withTransaction(async client => {
          const seasonId = current.id;
          const userId = user.rows[0].id;
          const price = Number(current.paid_spin_price);
          if (!Number.isSafeInteger(price) || price <= 0) throw new Error("PAID_SPIN_DISABLED");

          const existingResult = await client.query<PendingPayment>(
            `SELECT id::text,payload->>'payload' AS payload,amount::text,status,created_at::text,payload AS metadata
               FROM star_transactions
              WHERE user_id=$1::uuid
                AND status IN ('PENDING','REFUND_PENDING')
                AND payload->>'type'='PAID_SPIN'
                AND payload->>'seasonId'=$2
              ORDER BY CASE WHEN status='REFUND_PENDING' THEN 0 ELSE 1 END,created_at DESC,id DESC
              LIMIT 1
              FOR UPDATE`,
            [userId, seasonId],
          );
          let pending: PendingPayment | null = existingResult.rows[0] ?? null;
          let created = false;

          if (pending?.status === "REFUND_PENDING") throw new Error("PAYMENT_REFUND_PENDING");

          if (pending && Number(pending.amount) !== price) {
            await client.query(
              `UPDATE star_transactions
                  SET status='FAILED',processed_at=now(),payload=payload||jsonb_build_object('supersededByPrice',$2::integer)
                WHERE id=$1::uuid AND status='PENDING'`,
              [pending.id, price],
            );
            pending = null;
          }

          if (!pending) {
            const availability = await client.query<{ playable: string }>(
              `SELECT COUNT(*) FILTER (
                 WHERE quantity_remaining>0
                   AND is_active=TRUE
                   AND CASE
                     WHEN COALESCE(metadata->>'weight','') = '' THEN 1::numeric
                     WHEN metadata->>'weight' ~ '^([0-9]+(\\.[0-9]+)?)$' THEN (metadata->>'weight')::numeric
                     ELSE 0::numeric
                   END > 0
               )::text AS playable
                 FROM prizes
                WHERE season_id=$1::uuid`,
              [seasonId],
            );
            if (Number(availability.rows[0]?.playable ?? 0) <= 0) throw new Error("NO_PRIZES");

            const payload = `paidspin:v1:${userId}:${seasonId}:${crypto.randomUUID().replaceAll("-", "")}`;
            await client.query("SAVEPOINT create_pending_payment");
            try {
              const inserted = await client.query<PendingPayment>(
                `INSERT INTO star_transactions(user_id,amount,status,payload)
                 VALUES($1::uuid,$2,'PENDING',$3::jsonb)
                 RETURNING id::text,payload->>'payload' AS payload,amount::text,status,created_at::text,payload AS metadata`,
                [userId, price, JSON.stringify({ payload, userId, seasonId, type: "PAID_SPIN" })],
              );
              pending = inserted.rows[0] ?? null;
              created = true;
            } catch (error) {
              const message = error instanceof Error ? error.message : "";
              if (!(message.includes("ux_pending_paid_spin_user_season") || message.toLowerCase().includes("duplicate key"))) throw error;
              await client.query("ROLLBACK TO SAVEPOINT create_pending_payment");
              const raced = await client.query<PendingPayment>(
                `SELECT id::text,payload->>'payload' AS payload,amount::text,status,created_at::text,payload AS metadata
                   FROM star_transactions
                  WHERE user_id=$1::uuid
                    AND status='PENDING'
                    AND payload->>'type'='PAID_SPIN'
                    AND payload->>'seasonId'=$2
                  ORDER BY created_at DESC,id DESC
                  LIMIT 1
                  FOR UPDATE`,
                [userId, seasonId],
              );
              pending = raced.rows[0] ?? null;
              if (pending && Number(pending.amount) !== price) throw new Error("PAYMENT_PROCESSING");
            } finally {
              await client.query("RELEASE SAVEPOINT create_pending_payment").catch(() => {});
            }
          }

          if (!pending?.payload) throw new Error("PAYMENT_PROCESSING");
          const transactionAmount = Number(pending.amount);
          if (!Number.isSafeInteger(transactionAmount) || transactionAmount <= 0 || transactionAmount !== price) throw new Error("PAYMENT_PROCESSING");

          const storedInvoiceUrl = typeof pending.metadata?.invoiceUrl === "string" ? pending.metadata.invoiceUrl : null;
          return {
            id: pending.id,
            payload: pending.payload,
            price: transactionAmount,
            recovery: !created,
            storedInvoiceUrl,
          } satisfies InvoiceContext;
        });

        if (context.storedInvoiceUrl) {
          return Response.json({ ok: true, invoiceUrl: context.storedInvoiceUrl, price: context.price, payload: context.payload, recovery: context.recovery });
        }

        const invoiceUrl = await createTelegramInvoice(current.code, context.payload, context.price);
        let canonicalInvoiceUrl: string;
        try {
          canonicalInvoiceUrl = await persistInvoiceUrl(context.id, invoiceUrl);
        } catch (error) {
          console.error("Failed to persist Telegram invoice URL:", error instanceof Error ? error.message : error);
          if (error instanceof Error && error.message === "PAYMENT_REFUND_PENDING") throw error;
          canonicalInvoiceUrl = invoiceUrl;
        }

        return Response.json({ ok: true, invoiceUrl: canonicalInvoiceUrl, price: context.price, payload: context.payload, recovery: context.recovery });
      } catch (error) {
        if (error instanceof RateLimitError) return Response.json({ ok: false, code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
        const code = error instanceof Error ? error.message : "INVOICE_FAILED";
        const status = code === "NO_PRIZES" || code === "PAYMENT_PROCESSING" || code === "PAYMENT_REFUND_PENDING" || code === "PAID_SPIN_DISABLED" ? 409 : code === "NOT_SUBSCRIBED" || code === "NOT_PARTICIPANT" ? 403 : code === "USER_NOT_FOUND" ? 404 : code === "INVOICE_CREATE_FAILED" ? 502 : 400;
        console.error("Payment invoice failed:", code);
        return Response.json({ ok: false, code }, { status });
      }
    },
  }},
});
