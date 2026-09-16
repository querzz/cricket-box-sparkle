import type { Reward, ServiceError } from "@/lib/types";

type InvoiceResponse = { ok: boolean; invoiceUrl?: string; price?: number; payload?: string; code?: string };
type PaymentStatusResponse = {
  ok: boolean;
  status?: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
  code?: string;
  spin?: {
    id: string;
    reward: {
      kind: string;
      title: string;
      subtitle?: string | null;
      amount?: number;
      status: "RECEIVED" | "PENDING";
      payoutStatus?: string | null;
    };
  } | null;
};

function initData() {
  if (typeof window === "undefined") return "";
  return (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim() ?? "";
}

function fail(code: ServiceError["code"], message: string) {
  return { ok: false as const, error: { code, message } };
}

function mapError(code: string) {
  switch (code) {
    case "NOT_SUBSCRIBED": return fail("NOT_SUBSCRIBED", "Подпишись на канал, чтобы участвовать.");
    case "NOT_PARTICIPANT": return fail("NOT_PARTICIPANT", "Ты пока не участвуешь в этом сезоне.");
    case "PAYMENT_PROCESSING": return fail("PAYMENT_PROCESSING", "Платёж получен, но результат ещё обрабатывается. Попробуй открыть экран ещё раз через несколько секунд.");
    case "PAYMENT_REFUND_PENDING": return fail("PAYMENT_PROCESSING", "Платёж не потерян: возврат Stars ещё обрабатывается. Открой экран ещё раз позже.");
    case "PAYMENT_REFUNDED": return fail("NETWORK", "Прокрутку не удалось завершить, поэтому платёж в Telegram Stars возвращён.");
    case "NO_PRIZES": return fail("NO_PRIZES", "В этом сезоне сейчас нет доступных призов.");
    case "PAID_SPIN_DISABLED": return fail("NETWORK", "Платные прокрутки сейчас отключены.");
    default: return fail("NETWORK", "Не удалось выполнить оплату. Попробуй ещё раз.");
  }
}

async function getPaymentStatus(payload: string): Promise<PaymentStatusResponse | null> {
  try {
    const response = await fetch(`/api/payment/status?initData=${encodeURIComponent(initData())}&payload=${encodeURIComponent(payload)}`, { cache: "no-store" });
    return await response.json() as PaymentStatusResponse;
  } catch {
    return null;
  }
}

function toReward(reward: NonNullable<PaymentStatusResponse["spin"]>["reward"]): Reward {
  return {
    id: `paid_${crypto.randomUUID()}`,
    kind: reward.kind as Reward["kind"],
    title: reward.title,
    subtitle: reward.subtitle ?? undefined,
    amount: reward.amount,
    wonAt: new Date().toISOString(),
    status: reward.status,
    payoutNote: reward.payoutStatus === "PAID" ? "Выдано." : "Ожидает выдачи администратором.",
  };
}

export async function completePaidSpin(price: number) {
  if (typeof window === "undefined") return fail("NETWORK", "Оплата доступна только внутри Telegram.");
  const tg = (window as Window & { Telegram?: { WebApp?: { openInvoice?: (url: string, callback?: (status: string) => void) => void } } }).Telegram?.WebApp;
  if (!tg?.openInvoice) return fail("NETWORK", "Эта версия Telegram не поддерживает оплату внутри Mini App.");

  try {
    const response = await fetch("/api/payment/invoice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ initData: initData() }),
    });
    const invoice = await response.json() as InvoiceResponse;
    if (!response.ok || !invoice.ok || !invoice.invoiceUrl || !invoice.payload) return mapError(invoice.code ?? "INVOICE_FAILED");
    if (Number(invoice.price) !== price) return fail("NETWORK", "Цена прокрутки изменилась. Обнови экран и попробуй снова.");

    const status = await new Promise<string>((resolve) => {
      let settled = false;
      const finish = (value: string) => { if (!settled) { settled = true; resolve(value); } };
      tg.openInvoice?.(invoice.invoiceUrl!, (value) => finish(value));
      window.setTimeout(() => finish("timeout"), 60_000);
    });

    if (status === "cancelled") return fail("PAYMENT_REQUIRED", "Оплата отменена.");
    if (status === "failed") return fail("NETWORK", "Telegram не смог завершить оплату.");
    if (status === "timeout") return fail("PAYMENT_PROCESSING", "Платёж ещё обрабатывается. Вернись в приложение через несколько секунд.");

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const payment = await getPaymentStatus(invoice.payload);
      if (payment?.ok && payment.status === "SUCCESS" && payment.spin?.reward) {
        return { ok: true as const, reward: toReward(payment.spin.reward) };
      }
      if (payment?.status === "REFUNDED") return mapError("PAYMENT_REFUNDED");
      if (payment?.status === "FAILED") return mapError("PAYMENT_PROCESSING");
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }

    return fail("PAYMENT_PROCESSING", "Платёж получен, но результат ещё обрабатывается. Открой экран ещё раз через несколько секунд.");
  } catch {
    return fail("NETWORK", "Не удалось выполнить оплату. Попробуй ещё раз.");
  }
}
