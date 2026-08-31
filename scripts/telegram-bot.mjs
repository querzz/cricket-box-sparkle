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
    console.warn("APP_URL is not HTTPS. Telegram production Web Apps require HTTPS; the bot will use a normal URL button for local testing.");
  }

  let offset = 0;
  while (true) {
    try {
      const updates = await api("getUpdates", { timeout: 25, offset, allowed_updates: ["message"] });

      for (const update of updates) {
        offset = update.update_id + 1;
        const message = update.message;
        if (!message?.chat?.id) continue;

        const text = message.text || "";
        const telegramId = Number(message.from?.id ?? message.chat.id);

        if (text === "/id") {
          await api("sendMessage", {
            chat_id: message.chat.id,
            text: `🆔 Твой Telegram ID: ${telegramId}`,
          });
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
