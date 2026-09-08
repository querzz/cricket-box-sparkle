import type { Reward, ServiceError } from "@/lib/types";

type SessionResponse = { ok: boolean; snapshot?: { spin: { totalSpins: number }; rewards: Reward[] }; code?: string };
type InvoiceResponse = { ok: boolean; invoiceUrl?: string; price?: number; code?: string };

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
    case "NO_PRIZES": return fail("NO_PRIZES", "В этом сезоне сейчас нет доступных призов.");
    default: return fail("NETWORK", "Не удалось выполнить оплату. Попробуй ещё раз.");
  }
}

async function getSession(): Promise<SessionResponse | null> {
  try {
    const response = await fetch(`/api/session?initData=${encodeURIComponent(initData())}`, { cache: "no-store" });
    return await response.json() as SessionResponse;
  } catch {
    return null;
  }
}

export async function completePaidSpin(price: number) {
  if (typeof window === "undefined") return fail("NETWORK", "Оплата доступна только внутри Telegram.");
  const tg = (window as Window & { Telegram?: { WebApp?: { openInvoice?: (url: string, callback?: (status: string) => void) => void } } }).Telegram?.WebApp;
  if (!tg?.openInvoice) return fail("NETWORK", "Эта версия Telegram не поддерживает оплату внутри Mini App.");

  try {
    // Capture the counter before opening the invoice. The bot can complete the payment
    // before Telegram invokes the invoice callback, so a later baseline would miss it.
    const before = await getSession();
    const beforeCount = before?.ok && before.snapshot ? before.snapshot.spin.totalSpins : -1;

    const response = await fetch("/api/payment/invoice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData: initData() }),
    });
    const invoice = await response.json() as InvoiceResponse;
    if (!response.ok || !invoice.ok || !invoice.invoiceUrl) return mapError(invoice.code ?? "INVOICE_FAILED");
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
      const session = await getSession();
      if (session?.ok && session.snapshot && session.snapshot.spin.totalSpins > beforeCount) {
        const reward = session.snapshot.rewards[0];
        if (reward) return { ok: true as const, reward };
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }

    return fail("PAYMENT_PROCESSING", "Платёж получен, но результат ещё обрабатывается. Открой экран ещё раз через несколько секунд.");
  } catch {
    return fail("NETWORK", "Не удалось выполнить оплату. Попробуй ещё раз.");
  }
}
