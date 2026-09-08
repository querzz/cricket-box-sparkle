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
    const value = trimmed.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
const channelId = process.env.TELEGRAM_CHANNEL_ID;
if (token && channelId) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith("/sendMessage") && typeof init.body === "string") {
        const body = JSON.parse(init.body);
        if (typeof body.text === "string" && body.text.startsWith("🎁 CRICKET BOX")) {
          const chatResponse = await originalFetch(`https://api.telegram.org/bot${token}/getChat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: channelId }),
          });
          const chatData = await chatResponse.json();
          const username = chatData?.ok ? String(chatData.result?.username ?? "").replace(/^@+/, "") : "";
          if (username) {
            const existing = Array.isArray(body.reply_markup?.inline_keyboard) ? body.reply_markup.inline_keyboard : [];
            body.reply_markup = {
              ...(body.reply_markup ?? {}),
              inline_keyboard: [[{ text: "📢 Подписаться на канал", url: `https://t.me/${username}` }], ...existing],
            };
            init = { ...init, body: JSON.stringify(body) };
          }
        }
      }
    } catch {
      // Leave the original bot request untouched if the optional button cannot be prepared.
    }
    return originalFetch(input, init);
  };
}

await import("./telegram-bot.mjs");
