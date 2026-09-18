import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = async (file) => fs.readFile(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
};

const userRoutes = [
  "src/routes/index.tsx",
  "src/routes/draw.tsx",
  "src/routes/gift.tsx",
  "src/routes/prizes.index.tsx",
  "src/routes/prizes.$rewardId.tsx",
  "src/routes/profile.index.tsx",
  "src/routes/profile.$section.tsx",
  "src/routes/settings.tsx",
  "src/routes/withdraw.tsx",
];

const adminRoutes = [
  "src/routes/admin.index.tsx",
  "src/routes/admin.prizes.tsx",
  "src/routes/admin.payouts.tsx",
  "src/routes/admin.participants.tsx",
  "src/routes/admin.spins.tsx",
  "src/routes/admin.statistics.tsx",
  "src/routes/admin.access.tsx",
  "src/routes/admin.audit.tsx",
  "src/routes/admin.channel-activity.tsx",
  "src/routes/admin.veteran.tsx",
  "src/routes/admin.economics.tsx",
  "src/routes/admin.mechanics.tsx",
  "src/routes/admin.settings.tsx",
  "src/routes/admin.owner-gifts.tsx",
];

const adminApis = [
  "src/routes/api.admin.seasons.ts",
  "src/routes/api.admin.prizes.ts",
  "src/routes/api.admin.payouts.ts",
  "src/routes/api.admin.participants.ts",
  "src/routes/api.admin.spins.ts",
  "src/routes/api.admin.statistics.ts",
  "src/routes/api.admin.access.ts",
  "src/routes/api.admin.audit.ts",
  "src/routes/api.admin.channel-activity.ts",
  "src/routes/api.admin.drops.ts",
  "src/routes/api.admin.economic-planner.ts",
  "src/routes/api.admin.economy.ts",
  "src/routes/api.admin.economy.simulate.ts",
  "src/routes/api.admin.mechanics.ts",
  "src/routes/api.admin.owner-gifts.ts",
  "src/routes/api.admin.veteran.ts",
];

for (const file of [...userRoutes, ...adminRoutes, ...adminApis]) {
  await read(file);
}

const draw = await read("src/routes/draw.tsx");
const home = await read("src/routes/index.tsx");
const session = await read("src/routes/api.session.ts");
const selector = await read("src/server/dynamic-prize-selection.ts");
const seasonService = await read("src/server/season-service.ts");
const bot = await read("scripts/telegram-bot.mjs");
const i18n = await read("src/lib/i18n.ts");
const ru = await read("src/locales/ru.json");

assert(draw.includes("Подпишись на канал, чтобы получить бесплатную попытку"), "draw explains subscription before free spin");
assert(draw.includes("!snapshot.user.isSubscribed"), "draw checks subscription before showing free-spin availability");
assert(draw.includes("snapshot.user.isSubscribed && freeSpins <= 0"), "used-free-spin warning is only shown to subscribed users");
assert(home.includes("Подпишись на канал, чтобы получить бесплатную попытку и участвовать в сезоне."), "home explains subscription before attempt count");
assert(session.includes("dailyAvailable = season.daily_free_spin && live && isSubscribed && isParticipant"), "session grants daily free spin only to eligible subscribed participants");
assert(session.includes("freeSpins = dailyAvailable + bonusFreeSpins"), "session composes available free spins from server state");
assert(selector.includes("quantity_remaining"), "selector uses remaining inventory");
assert(selector.includes("weight"), "selector uses configured weight");
assert(seasonService.includes("PRIZE_QUANTITY_BELOW_WON"), "season prize quantity cannot go below already-won inventory");
assert(seasonService.includes("paidSpinEnabled === true"), "paid-spin re-enable guard remains explicit");
assert(!seasonService.includes("PAID_SPIN_PRICE_LOCKED"), "paid-spin price is no longer locked by season usage");
assert(ru.includes('"draw"'), "Russian draw translations exist");
assert(i18n.includes("export function t"), "translation helper exists");
assert(bot.includes("getUpdates"), "bot polling exists");
assert(bot.includes("deleteWebhook"), "bot clears webhook before polling");
assert(bot.includes('command: "start"'), "bot registers /start");
assert(bot.includes('command: "help"'), "bot registers /help");
assert(bot.includes('command: "paysupport"'), "bot registers /paysupport");
assert(bot.includes("pre_checkout_query"), "bot handles pre-checkout");
assert(bot.includes("successful_payment"), "bot handles successful payment");
assert(bot.includes("refundStarPayment"), "bot can refund Stars");
assert(bot.includes('text: "🛠 Админ-панель"'), "admin button is explicitly labeled");
assert(bot.includes("polling started"), "bot prints a visible startup marker");

const requiredAdminLabels = [
  "Создать сезон",
  "Призовой фонд",
  "Выплаты",
  "Участники",
  "Прокрутки",
  "Статистика",
  "Экономика",
  "Доступ к админке",
  "Активность канала",
  "Бонусы ветеранов",
  "Развлекательные механики",
];
const adminDashboard = await read("src/routes/admin.index.tsx");
const adminSettings = await read("src/routes/admin.settings.tsx");
for (const label of requiredAdminLabels) {
  assert(adminDashboard.includes(label) || adminSettings.includes(label), `admin UI exposes ${label}`);
}

console.log("✅ Product UX/Admin/Bot static QA passed");
console.log(`Checked user routes: ${userRoutes.length}, admin views: ${adminRoutes.length}, admin APIs: ${adminApis.length}`);
