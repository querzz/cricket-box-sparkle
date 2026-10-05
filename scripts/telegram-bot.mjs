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
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is missing in .env");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const { Client } = pg;

let botLockClient = null;
let linkedDiscussionChatId = null;

async function acquireBotLock() {
  if (!databaseUrl) throw new Error("DATABASE_URL is missing in .env");
  botLockClient = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await botLockClient.connect();
  const result = await botLockClient.query("SELECT pg_try_advisory_lock(hashtext('cricket_box:telegram_bot')) AS locked");
  if (!result.rows[0]?.locked) {
    await botLockClient.end().catch(() => {});
    botLockClient = null;
    throw new Error("TELEGRAM_BOT_ALREADY_RUNNING");
  }
}

async function releaseBotLock() {
  if (!botLockClient) return;
  await botLockClient.query("SELECT pg_advisory_unlock(hashtext('cricket_box:telegram_bot'))").catch(() => {});
  await botLockClient.end().catch(() => {});
  botLockClient = null;
}
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

async function recordChannelActivity({ telegramUserId, eventType, eventKey, points = 0, metadata = {} }) {
  if (!databaseUrl || !channelId || !Number.isSafeInteger(Number(telegramUserId))) return;
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query("BEGIN");
    const dayKey = new Date().toISOString().slice(0, 10);
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "cricket_box:activity:"+Number(telegramUserId)+":"+Number(channelId)+":"+dayKey,
    ]);

    const setting = await client.query("SELECT value FROM app_settings WHERE key='channel_activity' LIMIT 1");
    const enabled = setting.rows[0]?.value?.enabled !== false;
    if (!enabled) {
      await client.query("COMMIT");
      return;
    }

    let activityPoints = Math.max(0, Number(points) || 0);
    if (eventType === "COMMENT") {
      const count = await client.query(
        "SELECT COUNT(*)::int AS n FROM channel_activity WHERE telegram_user_id=$1::bigint AND channel_id=$2::bigint AND event_type='COMMENT' AND occurred_at>=date_trunc('day',now())",
        [Number(telegramUserId), Number(channelId)],
      );
      const countedComments = Number(count.rows[0]?.n ?? 0);
      if (countedComments >= 20) {
        await client.query("COMMIT");
        return;
      }
      activityPoints = (countedComments + 1) % 2 === 0 ? 1 : 0;
    }

    await client.query(
      "INSERT INTO channel_activity (user_id,telegram_user_id,channel_id,event_type,event_key,activity_points,occurred_at,metadata) SELECT u.id,$1::bigint,$2::bigint,$3,$4,$5,now(),$6::jsonb FROM (SELECT 1) seed LEFT JOIN users u ON u.telegram_id=$1::bigint WHERE NOT EXISTS (SELECT 1 FROM channel_activity ca WHERE ca.telegram_user_id=$1::bigint AND ca.channel_id=$2::bigint AND ca.event_type=$3 AND ca.event_key=$4)",
      [Number(telegramUserId), Number(channelId), eventType, eventKey, activityPoints, JSON.stringify(metadata)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.warn("Channel activity record failed:", error instanceof Error ? error.message : String(error));
  } finally {
    await client.end().catch(() => {});
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

function isMemberStatus(member) {
  const status = member?.status;
  if (status === "member" || status === "administrator" || status === "creator") return true;
  return status === "restricted" && member?.is_member === true;
}

function hasCommentContent(message) {
  return Boolean(
    message?.text?.trim() ||
    message?.caption?.trim() ||
    message?.photo ||
    message?.video ||
    message?.animation ||
    message?.document ||
    message?.audio ||
    message?.voice ||
    message?.video_note ||
    message?.sticker ||
    message?.poll ||
    message?.location ||
    message?.venue ||
    message?.contact
  );
}

async function handleActivityUpdate(update) {
  const reaction = update?.message_reaction;
  if (
    reaction &&
    channelId &&
    String(reaction.chat?.id ?? "") === String(channelId) &&
    reaction.user?.id &&
    !reaction.user?.is_bot &&
    Array.isArray(reaction.new_reaction) &&
    reaction.new_reaction.length > 0
  ) {
    await recordChannelActivity({
      telegramUserId: reaction.user.id,
      eventType: "REACTION",
      eventKey: `reaction:${String(update.update_id)}`,
      points: 0,
      metadata: {
        chatId: reaction.chat.id,
        messageId: reaction.message_id,
        reactionCount: reaction.new_reaction.length,
      },
    });
  }

  const memberUpdate = update?.chat_member;
  if (
    memberUpdate &&
    channelId &&
    String(memberUpdate.chat?.id ?? "") === String(channelId) &&
    memberUpdate.from?.id &&
    memberUpdate.new_chat_member?.user?.id &&
    !memberUpdate.new_chat_member.user.is_bot &&
    isMemberStatus(memberUpdate.new_chat_member) &&
    !isMemberStatus(memberUpdate.old_chat_member)
  ) {
    const telegramUserId = memberUpdate.new_chat_member.user.id;
    await recordChannelActivity({
      telegramUserId,
      eventType: "JOIN",
      eventKey: `join:${String(update.update_id)}`,
      points: 0,
      metadata: { chatId: memberUpdate.chat.id },
    });
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
  if (
    linkedDiscussionChatId &&
    message?.chat?.id === linkedDiscussionChatId &&
    message?.from?.id &&
    !message.from.is_bot &&
    hasCommentContent(message)
  ) {
    await recordChannelActivity({
      telegramUserId: message.from.id,
      eventType: "COMMENT",
      eventKey: `comment:${String(message.chat.id)}:${String(message.message_id)}`,
      points: 0,
      metadata: {
        chatId: message.chat.id,
        textLength: typeof message.text === "string" ? message.text.trim().length : 0,
      },
    });
    return;
  }

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
  if (update?.message_reaction || update?.chat_member) {
    await handleActivityUpdate(update);
  }
}

async function processMessageBatch(messages) {
  const queue = [...messages];
  const workers = Array.from({ length: Math.min(10, queue.length) }, async () => {
    while (queue.length) {
      const message = queue.shift();
      if (!message) return;
      try {
        await handleMessage(message);
      } catch (error) {
        console.error("Telegram message failed:", error);
      }
    }
  });
  await Promise.all(workers);
}

async function pollTelegramUpdates() {
  await acquireBotLock();
  const shutdown = async () => {
    await releaseBotLock();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  console.log(`🤖 @${botUsername} polling started`);
  await api("deleteWebhook", { drop_pending_updates: false }).catch((error) => {
    console.warn(`Telegram webhook cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  });

  linkedDiscussionChatId = await getLinkedDiscussionChatId();
  const discussionRefreshTimer = setInterval(async () => {
    linkedDiscussionChatId = await getLinkedDiscussionChatId();
  }, 5 * 60 * 1000);
  discussionRefreshTimer.unref?.();

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
        allowed_updates: ["message", "message_reaction", "chat_member", "pre_checkout_query"],
      });
      const batch = Array.isArray(updates) ? updates : [];
      const messageUpdates = batch.filter((update) => update?.message).map((update) => update.message);
      const activityTasks = batch
        .filter((update) => update?.message_reaction || update?.chat_member)
        .map((update) => handleUpdate(update)
          .catch((error) => console.error(`Telegram activity update ${update.update_id} failed:`, error)));
      const preCheckoutTasks = batch
        .filter((update) => update?.pre_checkout_query)
        .map((update) => handleUpdate({ pre_checkout_query: update.pre_checkout_query })
          .catch((error) => console.error(`Telegram pre-checkout ${update.update_id} failed:`, error)));
      await Promise.all([...preCheckoutTasks, ...activityTasks]);
      await processMessageBatch(messageUpdates);
      if (batch.length) offset = Math.max(offset, ...batch.map((update) => Number(update.update_id) + 1));
    } catch (error) {
      console.error("Telegram polling failed:", error);
      await sleep(3000);
    }
  }
}

await pollTelegramUpdates();
