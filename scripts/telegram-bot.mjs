import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
const botUsername = process.env.TELEGRAM_BOT_USERNAME || "CricketBoxBot";
const appUrl = process.env.APP_URL || "http://localhost:8081";

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is missing in .env");
  process.exit(1);
}

const api = (method, body = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => {
    const data = await response.json();
    if (!data.ok) throw new Error(`${method}: ${data.description || "Telegram API error"}`);
    return data.result;
  });

async function main() {
  const me = await api("getMe");
  console.log(`@${me.username} is running`);
  console.log(`Mini App URL: ${appUrl}`);

  let offset = 0;
  while (true) {
    try {
      const updates = await api("getUpdates", { timeout: 25, offset, allowed_updates: ["message"] });
      for (const update of updates) {
        offset = update.update_id + 1;
        const message = update.message;
        if (!message?.chat?.id) continue;

        const text = message.text || "";
        if (text.startsWith("/start")) {
          await api("sendMessage", {
            chat_id: message.chat.id,
            text: "🎁 CRICKET BOX\n\nРозыгрыши, призы и сезонные бонусы в одном месте.",
            reply_markup: {
              inline_keyboard: [[
                { text: "🎁 Открыть CRICKET BOX", web_app: { url: appUrl } },
              ]],
            },
          });
        }
      }
    } catch (error) {
      console.error(error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
