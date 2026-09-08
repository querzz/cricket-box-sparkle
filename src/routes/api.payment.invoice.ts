import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { query } from "@/server/db";

const MAX_STARS = 500;

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

        await query(`UPDATE star_transactions SET status='FAILED',processed_at=now() WHERE user_id=$1::uuid AND status='PENDING' AND payload->>'type'='PAID_SPIN' AND created_at < now()-interval '15 minutes'`, [user.rows[0].id]);

        const pending = await query<{ payload: string }>(`SELECT payload->>'payload' AS payload FROM star_transactions WHERE user_id=$1::uuid AND status='PENDING' AND payload->>'type'='PAID_SPIN' AND payload->>'seasonId'=$2 ORDER BY created_at DESC LIMIT 1`, [user.rows[0].id,current.id]);
        if (pending.rows[0]?.payload) return Response.json({ ok:false, code:"PAYMENT_PROCESSING" }, { status:409 });

        const starsBalance = Number(state.rows[0]?.stars_balance ?? 0);
        const prizeAvailability = await query<{ total_remaining: string }>(`SELECT COALESCE(SUM(quantity_remaining),0)::text AS total_remaining FROM prizes WHERE season_id=$1::uuid AND quantity_remaining>0 AND is_active=TRUE AND (kind<>'STARS' OR $2::integer<$3::integer)`, [current.id,starsBalance,MAX_STARS]);
        if (Number(prizeAvailability.rows[0]?.total_remaining ?? 0) <= 0) return Response.json({ ok:false, code:"NO_PRIZES" }, { status:409 });

        const price = Number(current.paid_spin_price);
        if (!Number.isSafeInteger(price) || price <= 0) return Response.json({ ok:false, code:"PAID_SPIN_DISABLED" }, { status:409 });
        const nonce = crypto.randomUUID().replaceAll("-","");
        const payload = `paidspin:v1:${user.rows[0].id}:${current.id}:${nonce}`;

        try {
          await query(`INSERT INTO star_transactions (user_id,amount,status,payload) VALUES ($1::uuid,$2,'PENDING',$3::jsonb)`, [user.rows[0].id,price,JSON.stringify({ payload,userId:user.rows[0].id,seasonId:current.id,type:"PAID_SPIN" })]);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message.includes("ux_pending_paid_spin_user_season") || message.toLowerCase().includes("duplicate key")) return Response.json({ ok:false, code:"PAYMENT_PROCESSING" }, { status:409 });
          throw error;
        }

        const telegramResponse = await fetch(`https://api.telegram.org/bot${requireBotToken()}/createInvoiceLink`, {
          method:"POST", headers:{ "content-type":"application/json" },
          body:JSON.stringify({ title:"CRICKET BOX — дополнительная прокрутка",description:`Дополнительная прокрутка сезона ${current.code}`,payload,currency:"XTR",prices:[{ label:"Дополнительная прокрутка",amount:price }] }),
        });
        const telegramData = (await telegramResponse.json()) as { ok:boolean; result?:string; description?:string };
        if (!telegramData.ok || !telegramData.result) {
          await query(`UPDATE star_transactions SET status='FAILED',processed_at=now() WHERE payload->>'payload'=$1 AND status='PENDING'`, [payload]);
          return Response.json({ ok:false, code:"INVOICE_CREATE_FAILED", detail:telegramData.description }, { status:502 });
        }
        return Response.json({ ok:true, invoiceUrl:telegramData.result, price, payload });
      } catch (error) {
        console.error("Payment invoice failed:", error instanceof Error ? error.message : error);
        return Response.json({ ok:false, code:"INVOICE_FAILED" }, { status:400 });
      }
    },
  }},
});
