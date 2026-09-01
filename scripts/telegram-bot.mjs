import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

dns.setDefaultResultOrder("ipv4first");

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
const botUsername = process.env.TELEGRAM_BOT_USERNAME || "CricketBoxBot";
const appUrl = process.env.APP_URL || "http://localhost:8081";
const databaseUrl = process.env.DATABASE_URL;
const { Client } = pg;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is missing in .env");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(method, body = {}, retries = 5) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(`${method}: ${data.description || "Telegram API error"}`);
      return data.result;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      console.warn(`${method} failed (attempt ${attempt}/${retries}): ${error instanceof Error ? error.message : String(error)}`);
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
    }
  }
  throw lastError;
}

function appButton(pathname = "") {
  const base = appUrl.replace(/\/$/, "");
  const url = `${base}${pathname}`;
  if (/^https:\/\//i.test(url)) return { text: "🎁 Открыть CRICKET BOX", web_app: { url } };
  return { text: "🌐 Открыть локальный CRICKET BOX", url };
}

async function isAdmin(telegramId) {
  if (!databaseUrl) return false;
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    const result = await client.query("SELECT 1 FROM admins WHERE telegram_id = $1 AND is_active = TRUE LIMIT 1", [telegramId]);
    return result.rowCount > 0;
  } catch (error) {
    console.warn(`Admin lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function paymentDbQuery(text, values = []) {
  if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    return await client.query(text, values);
  } finally {
    await client.end().catch(() => {});
  }
}

async function validatePreCheckout(query) {
  const payload = typeof query.invoice_payload === "string" ? query.invoice_payload : "";
  const amount = Number(query.total_amount);
  const currency = query.currency;
  if (!payload.startsWith("paidspin:v1:") || currency !== "XTR" || !Number.isSafeInteger(amount) || amount <= 0) {
    return { ok: false, error: "Недействительный платёж." };
  }
  const [, , userId, seasonId] = payload.split(":");
  const db = await paymentDbQuery(
    `SELECT st.id::text, st.amount, st.status, u.telegram_id::text, s.state, s.paid_spin_price
       FROM star_transactions st
       JOIN users u ON u.id = st.user_id
       JOIN seasons s ON s.id::text = split_part(st.payload->>'payload', ':', 4)
      WHERE st.payload->>'payload' = $1
      ORDER BY st.created_at DESC
      LIMIT 1`,
    [payload],
  );
  const row = db.rows[0];
  if (!row || row.status !== "PENDING" || row.telegram_id !== String(query.from?.id ?? "") || row.amount !== amount || Number(row.paid_spin_price) !== amount || !["ACTIVE", "ENDING"].includes(row.state) || userId !== row.telegram_id && !userId) {
    return { ok: false, error: "Заказ недействителен или сезон уже недоступен." };
  }
  if (seasonId !== payload.split(":")[3]) return { ok: false, error: "Недействительный заказ." };
  return { ok: true };
}

async function confirmSuccessfulPayment(message) {
  const payment = message.successful_payment;
  if (!payment) return;
  const response = await fetch(`${appUrl.replace(/\/$/, "")}/api/payment/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cricket-bot-token": token },
    body: JSON.stringify({
      payload: payment.invoice_payload,
      telegramId: message.from?.id,
      chargeId: payment.telegram_payment_charge_id,
      currency: payment.currency,
      totalAmount: payment.total_amount,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`payment completion failed: ${data.code || response.status}`);
}

function adminButton() {
  const base = appUrl.replace(/\/$/, "");
  const url = `${base}/admin`;
  if (/^https:\/\//i.test(url)) return { text: "🛡 Админ-панель", web_app: { url } };
  return { text: "🛡 Открыть админку", url };
}

async function main() {
  const me = await api("getMe");
  console.log(`@${me.username || botUsername} is running`);
  console.log(`App URL: ${appUrl}`);

  if (!/^https:\/\//i.test(appUrl)) {
    console.warn("APP_URL is not HTTPS. Telegram Web Apps and invoices require HTTPS in production.");
  }

  let offset = 0;
  while (true) {
    try {
      const updates = await api("getUpdates", {
        timeout: 25,
        offset,
        allowed_updates: ["message", "pre_checkout_query"],
      });

      for (const update of updates) {
        offset = update.update_id + 1;

        if (update.pre_checkout_query) {
          try {
            const validation = await validatePreCheckout(update.pre_checkout_query);
            await api("answerPreCheckoutQuery", {
              pre_checkout_query_id: update.pre_checkout_query.id,
              ok: validation.ok,
              ...(validation.ok ? {} : { error_message: validation.error }),
            });
          } catch (error) {
            console.error("Pre-checkout validation failed:", error);
            await api("answerPreCheckoutQuery", {
              pre_checkout_query_id: update.pre_checkout_query.id,
              ok: false,
              error_message: "Не удалось проверить заказ. Попробуй ещё раз.",
            });
          }
          continue;
        }

        const message = update.message;
        if (!message?.chat?.id) continue;

        if (message.successful_payment) {
          try {
            await confirmSuccessfulPayment(message);
            await api("sendMessage", {
              chat_id: message.chat.id,
              text: "✅ Оплата прошла! Платная прокрутка обработана, приз уже в твоих наградах.",
            });
          } catch (error) {
            console.error("Successful payment processing failed:", error);
            await api("sendMessage", {
              chat_id: message.chat.id,
              text: "✅ Оплата получена Telegram. Результат прокрутки ещё обрабатывается — открой CRICKET BOX через несколько секунд.",
            }).catch(() => {});
          }
          continue;
        }

        const text = message.text || "";
        const telegramId = Number(message.from?.id ?? message.chat.id);

        if (text === "/id") {
          await api("sendMessage", { chat_id: message.chat.id, text: `🆔 Твой Telegram ID: ${telegramId}` });
          continue;
        }

        if (text === "/admin") {
          const allowed = await isAdmin(telegramId);
          await api("sendMessage", {
            chat_id: message.chat.id,
            text: allowed ? "🛡 Админ-панель готова к открытию." : "⛔ У этого Telegram-аккаунта нет доступа к админ-панели.",
            reply_markup: allowed ? { inline_keyboard: [[adminButton()]] } : undefined,
          });
          continue;
        }

        if (text.startsWith("/start")) {
          const buttons = [[appButton()]];
          if (await isAdmin(telegramId)) buttons.push([adminButton()]);
          await api("sendMessage", {
            chat_id: message.chat.id,
            text: "🎁 CRICKET BOX\n\nРозыгрыши, призы и сезонные бонусы в одном месте.",
            reply_markup: { inline_keyboard: buttons },
          });
        }
      }
    } catch (error) {
      console.error(error);
      await sleep(3000);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});