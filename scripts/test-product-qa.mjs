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
  "src/routes/admin.daily-streak.tsx",
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
  "src/routes/api.admin.daily-gift.ts",
  "src/routes/api.admin.free-spin-campaigns.ts",
  "src/routes/api.admin.daily-streak.ts",
];

for (const file of [...userRoutes, ...adminRoutes, ...adminApis]) {
  await read(file);
}

const draw = await read("src/routes/draw.tsx");
const home = await read("src/routes/index.tsx");
const session = await read("src/routes/api.session.ts");
const selector = await read("src/server/dynamic-prize-selection.ts");
const veteranApi = await read("src/routes/api.admin.veteran.ts");
const dailyGiftApi = await read("src/routes/api.admin.daily-gift.ts");
const freeSpinCampaignApi = await read("src/routes/api.admin.free-spin-campaigns.ts");
const veteranUi = await read("src/routes/admin.veteran.tsx");
const seasonService = await read("src/server/season-service.ts");
const bot = await read("scripts/telegram-bot.mjs");
const seasonUi = await read("src/lib/season.ts");
const spin = await read("src/routes/api.spin.ts");
const paymentInvoice = await read("src/routes/api.payment.invoice.ts");
const paymentComplete = await read("src/routes/api.payment.complete.ts");
const ownerGiftApi = await read("src/routes/api.admin.owner-gifts.ts");
const ownerGiftCard = await read("src/components/kit/OwnerGiftCard.tsx");
const economics = await read("src/routes/admin.economics.tsx");
const payouts = await read("src/routes/admin.payouts.tsx");
const i18n = await read("src/lib/i18n.ts");
const ru = await read("src/locales/ru.json");
const streakService = await read("src/server/daily-streak.ts");
const streakApi = await read("src/routes/api.admin.daily-streak.ts");
const streakUi = await read("src/routes/admin.daily-streak.tsx");
const streakCard = await read("src/components/kit/DailyStreakCard.tsx");

assert(draw.includes('t("draw.subscriptionPrompt")'), "draw uses the translated subscription prompt");
assert(draw.includes("!snapshot.user.isSubscribed"), "draw checks subscription before showing free-spin availability");
assert(draw.includes("snapshot.user.isSubscribed && freeSpins <= 0"), "used-free-spin warning is only shown to subscribed users");
assert(home.includes('t("home.unsubscribedNote")'), "home uses the translated subscription requirement");
assert(session.includes("dailyAvailable = season.daily_free_spin && live && isSubscribed && isParticipant"), "session grants daily free spin only to eligible subscribed participants");
assert(session.includes("freeSpins = dailyAvailable + bonusFreeSpins"), "session composes available free spins from server state");
assert(seasonUi.includes("const finished = state === \"CLOSED\" || state === \"PAYOUT\" || state === \"ARCHIVED\""), "finished season states are handled");
assert(seasonUi.includes("canSpin: live && !paused && subscribed"), "spin access is disabled outside live, paused, or unsubscribed state");
assert(spin.includes('throw new Error("NO_ATTEMPTS")'), "server rejects a user with no free/bonus attempts");
assert(spin.includes('throw new Error("NO_PRIZES")'), "server rejects an exhausted prize pool");
assert(paymentInvoice.includes("getTelegramChannelMembership") && paymentInvoice.includes("membership === false"), "paid checkout rechecks live Telegram channel membership");
assert(paymentComplete.includes("getTelegramChannelMembership") && paymentComplete.includes("membership===false") && paymentComplete.includes("NOT_SUBSCRIBED"), "paid settlement rechecks live Telegram membership before awarding a paid spin");
assert(draw.includes("starsFull"), "draw handles a full 500 Stars balance");
assert(!economics.includes('label="Revenue"') && !economics.includes('label="Known cost"') && !economics.includes("Paid conversion") && !economics.includes("dry-run") && !economics.includes("LiveOps-дропы"), "economics UI no longer exposes obvious English operational labels");
assert(!/(?:[>\"\'])Lifecycle:\s/.test(payouts) && !/(?:[>\"\'])method:\s/.test(payouts) && !/(?:[>\"\'])ref:\s/.test(payouts), "payout UI no longer exposes obvious English operational labels");
assert(selector.includes("quantity_remaining"), "selector uses remaining inventory");
assert(selector.includes("weight"), "selector uses configured weight");
assert(selector.includes("emptyStreak"), "selector applies player EMPTY-streak balancing");
assert(selector.includes("globalMultiplier"), "selector applies season inventory pacing");
assert(veteranApi.includes('UPDATE users SET veteran_tier_override=$2 WHERE id=$1::uuid'), "manual veteran rank assignment updates a real users column");
assert(!veteranApi.includes('veteran_tier_override=$2,updated_at=now()'), "manual veteran rank assignment does not touch a non-existent users.updated_at column");
assert(veteranApi.includes('if (body.telegramId !== undefined) {') && veteranApi.indexOf('if (body.telegramId !== undefined) {') < veteranApi.indexOf('if (admin.role !== "OWNER")'), "manual veteran rank assignment is available to admins; global veteran toggle remains owner-only");
assert(veteranUi.includes("Только владелец может менять системную настройку.") && veteranUi.includes("rankError("), "veteran rank UI distinguishes permission errors");
assert(veteranApi.includes("tierOverride"), "manual veteran rank override is supported by admin API");
assert(dailyGiftApi.includes("key='daily_gift'") && dailyGiftApi.includes("ON CONFLICT(key) DO UPDATE"), "Daily Gift tier chance settings are persisted");
assert(freeSpinCampaignApi.includes("free_spin_campaigns"), "global free-spin campaigns are persisted and administered");
assert(session.includes("const campaignGranted = await grantActiveFreeSpinCampaigns(client, user.id, season.id, current.is_participant, isSubscribed);"), "session grants global free-spin campaigns");
assert(session.indexOf("const campaignGranted = await grantActiveFreeSpinCampaigns") < session.indexOf("if (activityEnabled) {"), "global free-spin campaigns do not depend on the Channel Activity switch");
assert(veteranUi.includes("Выдать ранг"), "admin UI exposes manual rank assignment");
assert(seasonService.includes("PRIZE_QUANTITY_BELOW_WON"), "season prize quantity cannot go below already-won inventory");
assert(seasonService.includes("paidSpinEnabled === true"), "paid-spin re-enable guard remains explicit");
assert(!seasonService.includes("PAID_SPIN_PRICE_LOCKED"), "paid-spin price is no longer locked by season usage");
const translationPaths = [...userRoutes, "src/components/kit/RewardModal.tsx", "src/components/kit/WithdrawalModal.tsx", "src/components/kit/States.tsx", "src/components/kit/StatusBadge.tsx"];
const translations = JSON.parse(ru);
const getTranslation = (path) => path.split(".").reduce((value, key) => value && typeof value === "object" ? value[key] : undefined, translations);
for (const file of translationPaths) {
  const source = await read(file);
  for (const match of source.matchAll(/\bt\(\s*["']([^"']+)["']/g)) {
    assert(typeof getTranslation(match[1]) === "string", `Russian translation key exists: ${file} → ${match[1]}`);
  }
}
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

assert(veteranUi.includes('placeholder="Telegram ID"') && veteranUi.includes('value={manualTier}'), "veteran UI exposes direct Telegram ID + rank assignment control");
assert(veteranUi.includes("rankError(") && veteranUi.includes("Проверь Telegram ID и выбранный ранг."), "veteran UI surfaces actionable rank errors");
assert(adminSettings.includes('role?: "OWNER" | "ADMIN"') && adminSettings.includes('veteranRole !== "OWNER"'), "admin settings keeps veteran system toggle owner-only");
assert(selector.includes("getAntiStreakMultiplier") && selector.includes("1 / pityMultiplier"), "EMPTY anti-streak multiplier counteracts long EMPTY streaks");
const prizeAdmin = await read("src/routes/admin.prizes.tsx");
const prizeAdminApi = await read("src/routes/api.admin.prizes.ts");
assert(prizeAdmin.includes('draft.kind === "STARS" || p.kind === "NFT"') || prizeAdmin.includes('p.kind === "STARS" || p.kind === "NFT"'), "NFT value is included in Stars fund obligations");
assert(prizeAdmin.includes('[5,10,15,20].map'), "prize editor exposes 5/10/15/20 chance presets");
assert(prizeAdmin.includes('draft.kind === "EMPTY"') && prizeAdmin.includes("desiredEmptyMass"), "chance presets adjust EMPTY mass while preserving reward weights");
assert(prizeAdmin.includes('label="NFT"') && prizeAdmin.includes('draft.kind === "NFT"'), "prize editor exposes dedicated NFT configuration");
assert(!prizeAdmin.includes("Картинка URL"), "prize editor does not expose the legacy image URL field");
assert(prizeAdmin.includes("Себестоимость") && prizeAdmin.includes("не для определения шанса"), "prize economics field is clearly separated from probability");
assert(prizeAdmin.includes("items = drafts.map") && prizeAdmin.includes("body: JSON.stringify({ initData: initData(), items })"), "prize editor saves the full fund in one request");
assert(prizeAdminApi.includes("Array.isArray(body.items)") && prizeAdminApi.includes("withTransaction(async (client)") && prizeAdminApi.includes("for (const item of body.items"), "prize API applies bulk fund saves atomically");
assert(bot.includes("countedComments >= 20") && bot.includes("(countedComments + 1) % 2 === 0"), "channel activity enforces 20 counted comments/day and 2 comments per point");
assert(session.includes("const activityEnabled") && session.indexOf("grantActiveFreeSpinCampaigns") < session.indexOf("if (activityEnabled)"), "global free-spin campaign grant stays independent of activity accrual");
assert(dailyGiftApi.includes("parseDailyGiftConfig") && adminSettings.includes("Шанс получить награду в Daily Gift") && adminSettings.includes("rewardChanceByTier"), "Daily Gift exposes one configurable chance per rank");
assert(streakService.includes("DAILY_STREAK_REWARDS") && streakService.includes("DAILY_STREAK_TOTAL_DAYS = 7"), "daily streak uses the approved 7-day reward cycle");
assert(session.includes("season_daily_checkins") && session.includes("dailyStreak"), "session records and returns daily streak");
assert(streakCard.includes("Серия") && streakCard.includes("дней подряд") && streakCard.includes("currentStreak"), "player home shows streak flame/progress");
assert(streakUi.includes("Daily Streak") && streakUi.includes("Без пропусков") && streakUi.includes("Готовы к дню 7"), "admin daily streak dashboard exposes key metrics");
assert(streakApi.includes("season_daily_checkins") && streakApi.includes("eligibleForReward"), "admin daily streak API reads real season check-ins");
assert(streakService.includes("eligibleForReward") && streakService.includes("rewardStars = 10"), "7-day streak eligibility and 10 Stars reward schedule are tracked");
assert(prizeAdmin.includes('p.kind === "STARS" || p.kind === "NFT"'), "NFT value is included in Stars fund totals");
assert(economics.includes("Всё в норме") && economics.includes("Риск убытка") && !economics.includes("dry-run"), "economics admin is localized for non-technical admins");
assert(ownerGiftApi.includes("sendTelegramNotification") && ownerGiftApi.includes("Открой CRICKET BOX и забери свой подарок"), "owner gift creation notifies the recipient through the bot");
assert(ownerGiftCard.includes("Тебе что-то дали") && ownerGiftCard.includes("Забрать подарок") && ownerGiftCard.includes("showPopup"), "owner gift shows an in-app popup when a new gift appears");

console.log("✅ Product UX/Admin/Bot static QA passed");
console.log(`Checked user routes: ${userRoutes.length}, admin views: ${adminRoutes.length}, admin APIs: ${adminApis.length}`);
