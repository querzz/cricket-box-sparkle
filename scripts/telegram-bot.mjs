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
const appUrl = process.env.APP_URL || "http://localhost:8081";
const channelId = process.env.TELEGRAM_CHANNEL_ID || "";
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

async function recordChannelActivity({ telegramUserId, eventType, eventKey, points, metadata = {} }) {
  if (!databaseUrl || !channelId || !Number.isSafeInteger(Number(telegramUserId))) return;
  try {
    await paymentDbQuery(
      `INSERT INTO channel_activity (user_id,telegram_user_id,channel_id,event_type,event_key,activity_points,occurred_at,metadata)
       SELECT u.id,$1::bigint,$2::bigint,$3,$4,$5,now(),$6::jsonb
         FROM (SELECT 1) seed
         LEFT JOIN users u ON u.telegram_id=$1::bigint
        WHERE NOT EXISTS (
          SELECT 1 FROM channel_activity ca
           WHERE ca.telegram_user_id=$1::bigint
             AND ca.channel_id=$2::bigint
             AND ca.event_type=$3
             AND ca.event_key=$4
        )`,
      [Number(telegramUserId), Number(channelId), eventType, eventKey, points, JSON.stringify(metadata)],
    );
  } catch (error) {
    console.warn(`Channel activity record failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getLinkedDiscussionChatId() {
  if (!channelId) return null;
  try {
    const chat = await api("getChat", { chat_id: channelId });
    return Number.isSafeInteger(Number(chat.linked_chat_id)) ? Number(chat.linked_chat_id) : null;
  } catch (error) {
    console.warn(`Channel lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
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
    `SELECT st.amount,st.status,st.user_id::text AS user_id,u.telegram_id::text AS telegram_id,s.id::text AS season_id,s.state,s.paid_spin_enabled
       FROM star_transactions st JOIN users u ON u.id=st.user_id JOIN seasons s ON s.id::text=$2
      WHERE st.payload->>'payload'=$1 ORDER BY st.created_at DESC LIMIT 1`,
    [payload, seasonId],
  );
  const row = db.rows[0];
  if (!row || row.status !== "PENDING" || row.user_id !== userId || row.season_id !== seasonId || row.telegram_id !== String(query.from?.id ?? "") || Number(row.amount) !== amount || row.paid_spin_enabled !== true || !["ACTIVE", "ENDING"].includes(row.state)) {
    return { ok: false, error: "Заказ недействителен или сезон уже недоступен." };
  }

  const availability = await paymentDbQuery(
    `SELECT EXISTS (
       SELECT 1 FROM prizes
        WHERE season_id=$1::uuid
          AND quantity_remaining>0
          AND is_active=TRUE
          AND CASE
            WHEN COALESCE(metadata->>'weight','') = '' THEN 1::numeric
            WHEN metadata->>'weight' ~ '^([0-9]+(\\.[0-9]+)?)$' THEN (metadata->>'weight')::numeric
            ELSE 0::numeric
          END > 0
     ) AS available`,
    [seasonId],
  );
  if (!availability.rows[0]?.available) return { ok: false, error: "Призы этого сезона уже закончились." };
  const state = await paymentDbQuery(`SELECT is_subscribed,is_participant FROM user_state WHERE user_id=$1::uuid LIMIT 1`, [userId]);
  if (!state.rows[0]?.is_subscribed || !state.rows[0]?.is_participant) return { ok: false, error: "Условия участия больше не выполнены." };
  return { ok: true };
}

async function confirmSuccessfulPayment(message) {
  const payment = message.successful_payment;
  if (!payment) return;
  const response = await fetch(`${appUrl.replace(/\/$/, "")}/api/payment/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cricket-bot-token": token },
    body: JSON.stringify({ payload: payment.invoice_payload,telegramId: message.from?.id,chargeId: payment.telegram_payment_charge_id,currency: payment.currency,totalAmount: payment.total_amount }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`payment completion failed: ${data.code || response.status}`);
  return data;
}

async function claimPaymentForRefund(payload, chargeId) {
  const db = await paymentDbQuery(`UPDATE star_transactions SET status='FAILED' WHERE payload->>'payload'=$1 AND telegram_charge_id IS NULL AND status='PENDING' RETURNING user_id::text AS user_id,amount`, [payload]);
  if (!db.rows[0]) return null;
  return { userId: db.rows[0].user_id, amount: Number(db.rows[0].amount), chargeId };
}

async function finishRefund(payload, chargeId, success) {
  await paymentDbQuery(`UPDATE star_transactions SET status=$3,processed_at=now() WHERE payload->>'payload'=$1 AND telegram_charge_id IS NULL AND status=$2`, [payload, "FAILED", success ? "REFUNDED" : "PENDING"]);
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

async function sendMessage(chatId, text, replyMarkup) {
  return api("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function handleMessage(message) {
  const chatId = message?.chat?.id;
  if (!chatId) return;

  if (message.successful_payment) {
    const result = await completeOrRefundPayment(message);
    if (result.completed) {
      await sendMessage(
        chatId,
        "✅ Оплата получена. Прокрутка подтверждена — награда уже зафиксирована.",
        { inline_keyboard: [[appButton("/draw")]] },
      );
    } else if (result.refunded) {
      await sendMessage(
        chatId,
        "⚠️ Не удалось подтвердить прокрутку. Платёж возвращён автоматически.",
        { inline_keyboard: [[appButton("")]] },
      );
    } else {
      await sendMessage(
        chatId,
        "⚠️ Не удалось подтвердить оплату автоматически. Мы сохранили платёж для повторной обработки.",
        { inline_keyboard: [[appButton("")]] },
      );
    }
    return;
  }

  const textValue = typeof message.text === "string" ? message.text.trim() : "";
  if (!textValue) return;

  if (/^\/start(?:\s|$)/i.test(textValue)) {
    const admin = await isAdmin(message.from?.id);
    const rows = [[appButton("")]];
    if (supportUsername) rows.push([{ text: "💬 Поддержка", url: `https://t.me/${supportUsername}` }]);
    if (admin) {
      rows.push([{ ...appButton("/admin"), text: "🛠 Админ-панель" }]);
    }
    await sendMessage(
      chatId,
      "🎁 CRICKET BOX\n\nОткрывай сезон, забирай бесплатные прокрутки и участвуй в розыгрыше призов.",
      { inline_keyboard: rows },
    );
    return;
  }

  if (/^\/paysupport(?:\s|$)/i.test(textValue)) {
    if (supportUsername) {
      await sendMessage(chatId, `💬 Поддержка: @${supportUsername}`);
    } else {
      await sendMessage(chatId, "💬 Поддержка доступна через раздел «Поддержка» в приложении.");
    }
    return;
  }

  if (/^\/help(?:\s|$)/i.test(textValue)) {
    const supportLine = supportUsername ? "\n/paysupport — поддержка по оплате" : "";
    await sendMessage(
      chatId,
      `Команды:\n/start — открыть CRICKET BOX\n/help — помощь${supportLine}`,
      { inline_keyboard: [[appButton("")]] },
    );
  }
}

async function handlePreCheckoutQuery(query) {
  if (!query?.id) return;
  try {
    const result = await validatePreCheckout(query);
    await api("answerPreCheckoutQuery", {
      pre_checkout_query_id: query.id,
      ok: result.ok,
      ...(result.ok ? {} : { error_message: result.error }),
    });
  } catch (error) {
    console.error("Pre-checkout validation failed:", error);
    await api("answerPreCheckoutQuery", {
      pre_checkout_query_id: query.id,
      ok: false,
      error_message: "Не удалось проверить заказ. Попробуйте ещё раз.",
    }).catch(() => {});
  }
}

async function handleUpdate(update) {
  if (update?.pre_checkout_query) {
    await handlePreCheckoutQuery(update.pre_checkout_query);
  }
  if (update?.message) {
    await handleMessage(update.message);
  }
}

async function pollTelegramUpdates() {
  console.log(`🤖 @${botUsername} polling started`);
  await api("deleteWebhook", { drop_pending_updates: false }).catch((error) => {
    console.warn(`Telegram webhook cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  });

  await api("setMyCommands", {
    commands: [
      { command: "start", description: "Открыть CRICKET BOX" },
      { command: "help", description: "Помощь" },
      { command: "paysupport", description: "Поддержка по оплате" },
    ],
  }).catch((error) => {
    console.warn(`Telegram commands setup failed: ${error instanceof Error ? error.message : String(error)}`);
  });

  let offset = 0;
  for (;;) {
    try {
      const updates = await api("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message", "pre_checkout_query"],
      });
      for (const update of Array.isArray(updates) ? updates : []) {
        offset = Math.max(offset, Number(update.update_id) + 1);
        try {
          await handleUpdate(update);
        } catch (error) {
          console.error(`Telegram update ${update.update_id} failed:`, error);
        }
      }
    } catch (error) {
      console.error("Telegram polling failed:", error);
      await sleep(3000);
    }
  }
}

await pollTelegramUpdates();
