import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { query, withTransaction } from "@/server/db";

const MAX_STARS = 500;
type PendingPayment = { id: string; payload: string; amount: string; created_at: string; metadata: Record<string, unknown> };

export const Route = createFileRoute("/api/payment/invoice")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const body = (await request.json()) as { initData?: unknown };
        const initData = typeof body.initData === "string" ? body.initData.trim() : "";
        if (!initData) return Response.json({ ok: false, code: "INIT_DATA_MISSING" }, { status: 400 });

        const validated = await validateTelegramInitData(initData, requireBotToken());
        const telegramId = validated.user?.id;
        if (!telegramId) return Response.json({ ok: false, code: "TELEGRAM_USER_MISSING" }, { status: 400 });

        const user = await query<{ id: string }>(`SELECT id::text FROM users WHERE telegram_id = $1 LIMIT 1`, [telegramId]);
        if (!user.rows[0]) return Response.json({ ok: false, code: "USER_NOT_FOUND" }, { status: 404 });

        const state = await query<{ is_subscribed: boolean; is_participant: boolean; stars_balance: number }>(`SELECT is_subscribed,is_participant,stars_balance FROM user_state WHERE user_id=$1::uuid LIMIT 1`, [user.rows[0].id]);
        if (!state.rows[0]?.is_subscribed) return Response.json({ ok: false, code: "NOT_SUBSCRIBED" }, { status: 403 });
        if (!state.rows[0]?.is_participant) return Response.json({ ok: false, code: "NOT_PARTICIPANT" }, { status: 403 });

        const season = await query<{ id: string; code: string; state: string; paid_spin_price: number; paid_spin_enabled: boolean }>(`SELECT id::text,code,state,paid_spin_price,paid_spin_enabled FROM seasons WHERE state IN ('ACTIVE','ENDING') ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END,created_at DESC LIMIT 1`);
        const current = season.rows[0];
        if (!current) return Response.json({ ok: false, code: "SEASON_NOT_ACTIVE" }, { status: 409 });
        if (!current.paid_spin_enabled) return Response.json({ ok: false, code: "PAID_SPIN_DISABLED" }, { status: 409 });

        const starsBalance = Number(state.rows[0]?.stars_balance ?? 0);
        const prizeAvailability = await query<{ total_remaining: string }>(`SELECT COALESCE(SUM(quantity_remaining),0)::text AS total_remaining FROM prizes WHERE season_id=$1::uuid AND quantity_remaining>0 AND is_active=TRUE AND (kind<>'STARS' OR $2::integer<$3::integer)`, [current.id,starsBalance,MAX_STARS]);
        if (Number(prizeAvailability.rows[0]?.total_remaining ?? 0) <= 0) return Response.json({ ok:false, code:"NO_PRIZES" }, { status:409 });

        const result = await withTransaction(async (client) => {
          let created = false;
          let pending: PendingPayment | null = null;
          const seasonId = current.id;
          const userId = user.rows[0].id;
          const price = Number(current.paid_spin_price);
          if (!Number.isSafeInteger(price) || price <= 0) throw new Error("PAID_SPIN_DISABLED");

          const existingResult = await client.query<PendingPayment>(
            `SELECT id::text,payload->>'payload' AS payload,amount::text,created_at::text,payload AS metadata
               FROM star_transactions
              WHERE user_id=$1::uuid AND status='PENDING' AND payload->>'type'='PAID_SPIN' AND payload->>'seasonId'=$2
              ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`,
            [userId, seasonId],
          );
          pending = existingResult.rows[0] ?? null;

          if (!pending) {
            const payload = `paidspin:v1:${userId}:${seasonId}:${crypto.randomUUID().replaceAll("-","")}`;
            await client.query("SAVEPOINT create_pending_payment");
            try {
              const inserted = await client.query<PendingPayment>(
                `INSERT INTO star_transactions(user_id,amount,status,payload)
                 VALUES($1::uuid,$2,'PENDING',$3::jsonb)
                 RETURNING id::text,payload->>'payload' AS payload,amount::text,created_at::text,payload AS metadata`,
                [userId, price, JSON.stringify({ payload, userId, seasonId, type:"PAID_SPIN" })],
              );
              pending = inserted.rows[0] ?? null;
              created = true;
            } catch (error) {
              const message = error instanceof Error ? error.message : "";
              if (!(message.includes("ux_pending_paid_spin_user_season") || message.toLowerCase().includes("duplicate key"))) throw error;
              await client.query("ROLLBACK TO SAVEPOINT create_pending_payment");
              const raced = await client.query<PendingPayment>(
                `SELECT id::text,payload->>'payload' AS payload,amount::text,created_at::text,payload AS metadata
                   FROM star_transactions
                  WHERE user_id=$1::uuid AND status='PENDING' AND payload->>'type'='PAID_SPIN' AND payload->>'seasonId'=$2
                  ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`,
                [userId, seasonId],
              );
              pending = raced.rows[0] ?? null;
            } finally {
              await client.query("RELEASE SAVEPOINT create_pending_payment").catch(() => {});
            }
          }

          if (!pending?.payload) throw new Error("PAYMENT_PROCESSING");
          const transactionAmount = Number(pending.amount);
          if (!Number.isSafeInteger(transactionAmount) || transactionAmount <= 0 || transactionAmount !== price) throw new Error("PAYMENT_AMOUNT_MISMATCH");

          const storedInvoiceUrl = typeof pending.metadata?.invoiceUrl === "string" ? pending.metadata.invoiceUrl : null;
          if (storedInvoiceUrl) return { invoiceUrl: storedInvoiceUrl, price: transactionAmount, payload: pending.payload, recovery: !created };

          const telegramResponse = await fetch(`https://api.telegram.org/bot${requireBotToken()}/createInvoiceLink`, {
            method:"POST", headers:{ "content-type":"application/json" },
            body:JSON.stringify({ title:"CRICKET BOX — дополнительная прокрутка",description:`Дополнительная прокрутка сезона ${current.code}`,payload:pending.payload,currency:"XTR",prices:[{ label:"Дополнительная прокрутка",amount:transactionAmount }] }),
          });
          const telegramData = (await telegramResponse.json()) as { ok:boolean; result?:string; description?:string };
          if (!telegramData.ok || !telegramData.result) {
            if (created) await client.query(`UPDATE star_transactions SET status='FAILED',processed_at=now() WHERE id=$1::uuid AND status='PENDING'`, [pending.id]);
            throw new Error("INVOICE_CREATE_FAILED");
          }

          await client.query(`UPDATE star_transactions SET payload=payload||jsonb_build_object('invoiceUrl',$2::text) WHERE id=$1::uuid AND status='PENDING'`, [pending.id, telegramData.result]);
          return { invoiceUrl: telegramData.result, price: transactionAmount, payload: pending.payload, recovery: !created };
        });

        return Response.json({ ok:true, ...result });
      } catch (error) {
        const code = error instanceof Error ? error.message : "INVOICE_FAILED";
        const status = code === "NO_PRIZES" || code === "PAYMENT_PROCESSING" || code === "PAYMENT_AMOUNT_MISMATCH" || code === "PAID_SPIN_DISABLED" ? 409 : code === "NOT_SUBSCRIBED" || code === "NOT_PARTICIPANT" ? 403 : code === "USER_NOT_FOUND" ? 404 : code === "INVOICE_CREATE_FAILED" ? 502 : 400;
        console.error("Payment invoice failed:", code);
        return Response.json({ ok:false, code }, { status });
      }
    },
  }},
});
