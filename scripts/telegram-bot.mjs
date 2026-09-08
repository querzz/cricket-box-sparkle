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
const supportUsername = (process.env.TELEGRAM_SUPPORT_USERNAME || "").replace(/^@/, "");
const channelId = (process.env.TELEGRAM_CHANNEL_ID || "").trim();
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
  const parts = payload.split(":");
  const userId = parts[2];
  const seasonId = parts[3];
  if (!userId || !seasonId) return { ok: false, error: "Недействительный заказ." };

  const db = await paymentDbQuery(
    `SELECT st.amount,
            st.status,
            st.user_id::text AS user_id,
            u.telegram_id::text AS telegram_id,
            s.id::text AS season_id,
            s.state,
            s.paid_spin_price,
            s.paid_spin_enabled
       FROM star_transactions st
       JOIN users u ON u.id = st.user_id
       JOIN seasons s ON s.id::text = $2
      WHERE st.payload->>'payload' = $1
      ORDER BY st.created_at DESC
      LIMIT 1`,
    [payload, seasonId],
  );
  const row = db.rows[0];
  if (!row || row.status !== "PENDING" || row.user_id !== userId || row.season_id !== seasonId || row.telegram_id !== String(query.from?.id ?? "") || Number(row.amount) !== amount || Number(row.paid_spin_price) !== amount || row.paid_spin_enabled !== true || !["ACTIVE", "ENDING"].includes(row.state)) {
    return { ok: false, error: "Заказ недействителен или сезон уже недоступен." };
  }

  const availability = await paymentDbQuery(
    `SELECT EXISTS (
       SELECT 1
         FROM prizes
        WHERE season_id=$1::uuid
          AND quantity_remaining>0
          AND is_active=TRUE
          AND (kind<>'STARS' OR (SELECT stars_balance FROM user_state WHERE user_id=$2::uuid) < 500)
     ) AS available`,
    [seasonId, userId],
  );
  if (!availability.rows[0]?.available) return { ok: false, error: "Призы этого сезона уже закончились." };

  const state = await paymentDbQuery(`SELECT is_subscribed,is_participant FROM user_state WHERE user_id=$1::uuid LIMIT 1`, [userId]);
  if (!state.rows[0]?.is_subscribed || !state.rows[0]?.is_participant) {
    return { ok: false, error: "Условия участия больше не выполнены." };
  }

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
  return data;
}

async function claimPaymentForRefund(payload, chargeId) {
  const db = await paymentDbQuery(
    `UPDATE star_transactions
        SET status='FAILED'
      WHERE payload->>'payload'=$1
        AND telegram_charge_id IS NULL
        AND status='PENDING'
      RETURNING user_id::text AS user_id, amount`,
    [payload],
  );
  if (!db.rows[0]) return null;
  return { userId: db.rows[0].user_id, amount: Number(db.rows[0].amount), chargeId };
}

async function finishRefund(payload, chargeId, success) {
  await paymentDbQuery(
    `UPDATE star_transactions
        SET status=$3,
            processed_at=now()
      WHERE payload->>'payload'=$1
        AND telegram_charge_id IS NULL
        AND status=$2`,
    [payload, success ? "FAILED" : "FAILED", success ? "REFUNDED" : "PENDING"],
  );
}

async function refundSuccessfulPayment(message) {
  const payment = message.successful_payment;
  if (!payment) return false;
  const payload = typeof payment.invoice_payload === "string" ? payment.invoice_payload.trim() : "";
  const chargeId = typeof payment.telegram_payment_charge_id === "string" ? payment.telegram_payment_charge_id.trim() : "";
  const telegramId = Number(message.from?.id ?? 0);
  if (!payload || !chargeId || !Number.isSafeInteger(telegramId) || telegramId <= 0) return false;

  const claim = await claimPaymentForRefund(payload, chargeId);
  if (!claim) return false;
  try {
    await api("refundStarPayment", { user_id: telegramId, telegram_payment_charge_id: chargeId });
    await finishRefund(payload, chargeId, true);
    return true;
  } catch (error) {
    console.error("Telegram Stars refund failed:", error);
    await finishRefund(payload, chargeId, false).catch((dbError) => console.error("Failed to restore pending payment:", dbError));
    return false;
  }
}

async function completeOrRefundPayment(message) {
  const maxAttempts = 3;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return { completed: true, refunded: false, data: await confirmSuccessfulPayment(message) };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await sleep(1500 * attempt);
    }
  }

  console.error("Successful payment could not be completed after retries:", lastError);
  const refunded = await refundSuccessfulPayment(message);
  return { completed: false, refunded };
}

async function checkChannelAccess() {
  if (!channelId) return { ok: false, code: "CHANNEL_ID_MISSING" };
  try {
    const member = await api("getChatMember", { chat_id: channelId, user_id: me.id }, 2);
    return { ok: true, status: member.status, isMember: member.is_member };
  } catch (error) {
    return { ok: false, code: error instanceof Error ? error.message : String(error) };
  }
}

function adminButton() {
  const base = appUrl.replace(/\/$/, "");
  const url = `${base}/admin`;
  if (/^https:\/\//i.test(url)) return { text: "🛡 Админ-панель", web_app: { url } };
  return { text: "🛡 Открыть админку", url };
}

function supportText() {
  return supportUsername
    ? `💳 Поддержка по оплате\n\nОпиши проблему и напиши нам: @${supportUsername}\n\nСохрани чек/квитанцию Telegram, если проблема связана с оплатой.`
    : "💳 Поддержка по оплате\n\nОпиши проблему с оплатой и сохрани чек/квитанцию Telegram. Поддержка проекта обработает запрос вручную.";
}

let me;

async function main() {
  me = await api("getMe");
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
          const result = await completeOrRefundPayment(message);
          if (result.completed) {
            await api("sendMessage", {
              chat_id: message.chat.id,
              text: "✅ Оплата прошла! Платная прокрутка обработана, приз уже в твоих наградах.",
            });
          } else if (result.refunded) {
            await api("sendMessage", {
              chat_id: message.chat.id,
              text: "↩️ Не удалось безопасно обработать прокрутку. Платёж в Telegram Stars автоматически возвращён.",
            });
          } else {
            await api("sendMessage", {
              chat_id: message.chat.id,
              text: "⚠️ Оплата получена, но автоматическая обработка не завершилась. Платёж не потерян — обратись в /paysupport.",
            }).catch(() => {});
          }
          continue;
        }

        const text = message.text || "";
        const telegramId = Number(message.from?.id ?? message.chat.id);

        if (text === "/paysupport") {
          await api("sendMessage", { chat_id: message.chat.id, text: supportText() });
          continue;
        }

        if (text === "/checkchannel") {
          const allowed = await isAdmin(telegramId);
          if (!allowed) {
            await api("sendMessage", { chat_id: message.chat.id, text: "⛔ Команда доступна только администратору." });
            continue;
          }
          const check = await checkChannelAccess();
          if (!check.ok) {
            await api("sendMessage", {
              chat_id: message.chat.id,
              text: check.code === "CHANNEL_ID_MISSING"
                ? "❌ TELEGRAM_CHANNEL_ID не задан в .env."
                : `❌ Не удалось проверить канал.\n\n${check.code}`,
            });
            continue;
          }
          await api("sendMessage", {
            chat_id: message.chat.id,
            text: `📢 Канал: ${channelId}\n🤖 Бот: @${me.username || botUsername}\n\nСтатус: ${check.status}${check.isMember === undefined ? "" : `\nis_member: ${check.isMember ? "да" : "нет"}`}\n\n${check.status === "administrator" || check.status === "creator" ? "✅ Бот имеет права администратора." : "⚠️ Бот не является администратором канала."}`,
          });
          continue;
        }

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
