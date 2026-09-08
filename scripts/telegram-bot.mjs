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
    `SELECT st.amount,st.status,st.user_id::text AS user_id,u.telegram_id::text AS telegram_id,s.id::text AS season_id,s.state,s.paid_spin_price,s.paid_spin_enabled
       FROM star_transactions st JOIN users u ON u.id=st.user_id JOIN seasons s ON s.id::text=$2
      WHERE st.payload->>'payload'=$1 ORDER BY st.created_at DESC LIMIT 1`,
    [payload, seasonId],
  );
  const row = db.rows[0];
  if (!row || row.status !== "PENDING" || row.user_id !== userId || row.season_id !== seasonId || row.telegram_id !== String(query.from?.id ?? "") || Number(row.amount) !== amount || Number(row.paid_spin_price) !== amount || row.paid_spin_enabled !== true || !["ACTIVE", "ENDING"].includes(row.state)) {
    return { ok: false, error: "Заказ недействителен или сезон уже недоступен." };
  }

  const availability = await paymentDbQuery(
    `SELECT EXISTS (SELECT 1 FROM prizes WHERE season_id=$1::uuid AND quantity_remaining>0 AND is_active=TRUE AND (kind<>'STARS' OR (SELECT stars_balance FROM user_state WHERE user_id=$2::uuid)<500)) AS available`,
    [seasonId, userId],
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

async function checkChannelAccess() {
  if (!channelId) throw new Error("TELEGRAM_CHANNEL_ID is missing in .env");
  const bot = await api("getMe");
  const chat = await api("getChat", { chat_id: channelId });
  const member = await api("getChatMember", { chat_id: channelId, user_id: bot.id });
  return { bot, chat, member };
}

async function sendChannelStatus(chatId) {
  try {
    const { bot, chat, member } = await checkChannelAccess();
    const status = member.status || "unknown";
    const admin = ["administrator", "creator"].includes(status);
    const title = chat.title || "без названия";
    const username = chat.username ? `@${chat.username}` : "без username";
    await api("sendMessage", {
      chat_id: chatId,
      text: `📢 Канал: ${chat.id}\n📝 ${title}\n🔗 ${username}\n🤖 Бот: @${bot.username || botUsername}\n\nСтатус: ${status}\n\n${admin ? "✅ Бот имеет права администратора." : "❌ Бот НЕ является администратором."}`,
    });
  } catch (error) {
    await api("sendMessage", { chat_id: chatId, text: `❌ Не удалось проверить канал.\n\n${error instanceof Error ? error.message : String(error)}` });
  }
}

async function handleChannelMemberUpdate(update) {
  const chatId = Number(update.chat?.id ?? 0);
  if (!chatId || !channelId || String(chatId) !== String(channelId)) return;
  const userId = Number(update.new_chat_member?.user?.id ?? 0);
  if (!userId) return;
  const status = update.new_chat_member.status;
  const eventType = ["member", "administrator", "creator", "restricted"].includes(status) ? "JOIN" : ["left", "kicked"].includes(status) ? "LEAVE" : "MEMBERSHIP_UPDATE";
  await recordChannelActivity({ telegramUserId: userId, eventType, eventKey: `${chatId}:${userId}:${status}:${update.date ?? ""}`, points: eventType === "JOIN" ? 5 : 0, metadata: { status } });
}

async function handleReactionUpdate(update) {
  const chatId = Number(update.chat?.id ?? 0);
  if (!chatId || !channelId || (String(chatId) !== String(channelId) && String(chatId) !== String(discussionChatId))) return;
  const userId = Number(update.user?.id ?? 0);
  if (!userId) return;
  const hasNewReaction = Array.isArray(update.new_reaction) && update.new_reaction.length > 0;
  if (!hasNewReaction) return;
  await recordChannelActivity({
    telegramUserId: userId,
    eventType: "REACTION",
    eventKey: `${chatId}:${update.message_id}:${userId}`,
    points: 1,
    metadata: { messageId: update.message_id, chatId },
  });
}

async function handleDiscussionMessage(message) {
  const chatId = Number(message.chat?.id ?? 0);
  const userId = Number(message.from?.id ?? 0);
  if (!userId || !discussionChatId || chatId !== discussionChatId) return;
  if (message.from?.is_bot) return;
  await recordChannelActivity({
    telegramUserId: userId,
    eventType: "COMMENT",
    eventKey: `${chatId}:${message.message_id}:${userId}`,
    points: 2,
    metadata: { messageId: message.message_id, replyToMessageId: message.reply_to_message?.message_id ?? null, textLength: typeof message.text === "string" ? message.text.length : 0 },
  });
}

let discussionChatId = null;

async function main() {
  const me = await api("getMe");
  console.log(`@${me.username || botUsername} is running`);
  console.log(`App URL: ${appUrl}`);

  if (!/^https:\/\//i.test(appUrl)) console.warn("APP_URL is not HTTPS. Telegram Web Apps and invoices require HTTPS in production.");
  if (channelId) {
    discussionChatId = await getLinkedDiscussionChatId();
    console.log(`Channel ID: ${channelId}`);
    console.log(`Linked discussion chat: ${discussionChatId ?? "none"}`);
    try {
      const member = await api("getChatMember", { chat_id: channelId, user_id: me.id });
      console.log(`Bot channel status: ${member.status}`);
    } catch (error) {
      console.warn(`Bot channel status check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    console.warn("TELEGRAM_CHANNEL_ID is empty; channel activity collection is disabled.");
  }

  let offset = 0;
  while (true) {
    try {
      const updates = await api("getUpdates", {
        timeout: 25,
        offset,
        allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post", "chat_member", "message_reaction", "message_reaction_count", "pre_checkout_query"],
      });

      for (const update of updates) {
        offset = update.update_id + 1;

        if (update.chat_member) {
          await handleChannelMemberUpdate(update.chat_member);
          continue;
        }
        if (update.message_reaction) {
          await handleReactionUpdate(update.message_reaction);
          continue;
        }
        if (update.channel_post) {
          const chatId = Number(update.channel_post.chat?.id ?? 0);
          if (channelId && String(chatId) === String(channelId)) {
            await recordChannelActivity({ telegramUserId: 0, eventType: "CHANNEL_POST", eventKey: `${chatId}:${update.channel_post.message_id}`, points: 0, metadata: { messageId: update.channel_post.message_id } });
          }
          continue;
        }
        if (update.pre_checkout_query) {
          try {
            const validation = await validatePreCheckout(update.pre_checkout_query);
            await api("answerPreCheckoutQuery", { pre_checkout_query_id: update.pre_checkout_query.id, ok: validation.ok, ...(validation.ok ? {} : { error_message: validation.error }) });
          } catch (error) {
            console.error("Pre-checkout validation failed:", error);
            await api("answerPreCheckoutQuery", { pre_checkout_query_id: update.pre_checkout_query.id, ok: false, error_message: "Не удалось проверить заказ. Попробуй ещё раз." });
          }
          continue;
        }

        const message = update.message;
        if (!message?.chat?.id) continue;
        await handleDiscussionMessage(message);

        if (message.successful_payment) {
          const result = await completeOrRefundPayment(message);
          if (result.completed) {
            await api("sendMessage", { chat_id: message.chat.id, text: "✅ Оплата прошла! Платная прокрутка обработана, приз уже в твоих наградах." });
          } else if (result.refunded) {
            await api("sendMessage", { chat_id: message.chat.id, text: "↩️ Не удалось безопасно обработать прокрутку. Платёж в Telegram Stars автоматически возвращён." });
          } else {
            await api("sendMessage", { chat_id: message.chat.id, text: "⚠️ Оплата получена, но автоматическая обработка не завершилась. Платёж не потерян — обратись в /paysupport." }).catch(() => {});
          }
          continue;
        }

        const text = message.text || "";
        const telegramId = Number(message.from?.id ?? message.chat.id);

        if (text === "/checkchannel") {
          if (!(await isAdmin(telegramId))) {
            await api("sendMessage", { chat_id: message.chat.id, text: "⛔ Только для администраторов проекта." });
            continue;
          }
          await sendChannelStatus(message.chat.id);
          continue;
        }

        if (text === "/paysupport") {
          await api("sendMessage", { chat_id: message.chat.id, text: supportText() });
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