import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const botSource = await fs.readFile(path.join(root, "scripts/telegram-bot.mjs"), "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
};

const required = [
  ["getUpdates", "long polling"],
  ["deleteWebhook", "webhook cleanup"],
  ["setMyCommands", "command registration"],
  ['command: "start"', "/start command"],
  ['command: "help"', "/help command"],
  ['command: "paysupport"', "/paysupport command"],
  ["pre_checkout_query", "pre-checkout handling"],
  ["successful_payment", "successful payment handling"],
  ["refundStarPayment", "Stars refund handling"],
  ["/api/payment/complete", "payment settlement endpoint"],
  ['text: "🛠 Админ-панель"', "explicit admin button label"],
  ["polling started", "visible startup log"],
];

for (const [needle, label] of required) {
  assert(botSource.includes(needle), label);
}

const envText = await fs.readFile(path.join(root, ".env"), "utf8").catch(() => "");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const i = trimmed.indexOf("=");
  if (i > 0) env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
}

if (env.TELEGRAM_BOT_TOKEN) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`, {
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  assert(response.ok && data.ok === true && data.result?.is_bot === true, "live Telegram getMe");
  if (env.TELEGRAM_BOT_USERNAME) {
    assert(String(data.result.username ?? "").toLowerCase() === env.TELEGRAM_BOT_USERNAME.replace(/^@/, "").toLowerCase(), "TELEGRAM_BOT_USERNAME matches Telegram");
  }
  console.log(`✅ Telegram API reachable: @${data.result.username}`);
} else {
  console.log("ℹ️ TELEGRAM_BOT_TOKEN not found in .env; live Telegram API check skipped");
}

console.log("✅ Telegram bot regression checks passed");
