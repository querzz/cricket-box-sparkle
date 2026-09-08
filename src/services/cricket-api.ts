import { createInitialSnapshot } from "@/lib/mock-data";
import type { Gift, Reward, RewardKind, SeasonState, ServiceError, ServiceResult, SessionSnapshot, Withdrawal } from "@/lib/types";

const STORAGE_KEY = "cricket-box:mock-session:v1";
const DAY_MS = 24 * 60 * 60 * 1000;
type BackendSessionResponse = { ok: boolean; snapshot?: SessionSnapshot; code?: string };
type BackendSpinResponse = { ok: boolean; reward?: Reward; spin?: { id: string }; code?: string };
type BackendGiftResponse = { ok: boolean; reward?: Reward; code?: string };
type BackendWithdrawalResponse = { ok: boolean; withdrawal?: Withdrawal; code?: string; minimum?: number };
type BackendInvoiceResponse = { ok: boolean; invoiceUrl?: string; code?: string; price?: number; payload?: string; recovery?: boolean };
type BackendPaymentStatusResponse = {
  ok: boolean;
  status?: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
  code?: string;
  spin?: { id?: string; reward?: { kind: string; title: string; subtitle?: string; amount?: number; status?: string; payoutStatus?: string | null } } | null;
};
type BackendDevResponse = { ok: boolean; code?: string };

function initData() {
  if (typeof window === "undefined") return "";
  const tg = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return tg?.WebApp?.initData?.trim() ?? "";
}
function inTelegram() { return Boolean(initData()); }
function localStateLoad(): SessionSnapshot {
  const initial = createInitialSnapshot();
  if (typeof localStorage === "undefined") return initial;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<SessionSnapshot> | null;
    if (!saved) return initial;
    return { ...initial, ...saved, user: { ...initial.user, ...saved.user }, season: { ...initial.season, ...saved.season }, stars: { ...initial.stars, ...saved.stars }, spin: { ...initial.spin, ...saved.spin }, gift: { ...initial.gift, ...saved.gift }, rewards: Array.isArray(saved.rewards) ? saved.rewards : initial.rewards, withdrawals: Array.isArray(saved.withdrawals) ? saved.withdrawals : initial.withdrawals, dev: { ...initial.dev, ...saved.dev } };
  } catch { return initial; }
}
function localPersist(value: SessionSnapshot) { if (typeof localStorage !== "undefined") { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* Ignore localStorage failures. */ } } }
let state = localStateLoad();
const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const fail = (code: ServiceError["code"], message: string): ServiceResult<never> => ({ ok: false, error: { code, message } });
const mapBackendError = (code: string): ServiceError => {
  switch (code) {
    case "NOT_SUBSCRIBED": return { code: "NOT_SUBSCRIBED", message: "Подпишись на канал, чтобы участвовать." };
    case "NO_ATTEMPTS": return { code: "NO_ATTEMPTS", message: "Сегодняшняя бесплатная попытка уже использована." };
    case "BELOW_MINIMUM": return { code: "BELOW_MINIMUM", message: "Сумма ниже минимального порога вывода." };
    case "INSUFFICIENT_STARS": return { code: "INSUFFICIENT_STARS", message: "Недостаточно Stars." };
    case "SEASON_NOT_ACTIVE": return { code: "SEASON_CLOSED", message: "Сейчас нет активного сезона." };
    case "NO_SEASON": return { code: "SEASON_CLOSED", message: "Сейчас нет активного сезона." };
    case "GIFT_UNAVAILABLE": return { code: "GIFT_UNAVAILABLE", message: "Подарок сейчас недоступен." };
    case "GIFT_COOLDOWN": return { code: "GIFT_COOLDOWN", message: "Подарок уже получен. Возвращайся через 24 часа." };
    case "GIFT_BALANCE_FULL": return { code: "GIFT_BALANCE_FULL", message: "Баланс Stars уже достиг максимума." };
    case "WITHDRAW_NOT_OPEN": return { code: "WITHDRAW_NOT_OPEN", message: "Вывод откроется после завершения сезона." };
    case "WITHDRAWAL_PENDING": return { code: "WITHDRAWAL_PENDING", message: "У тебя уже есть заявка на вывод в обработке." };
    case "PAID_SPIN_DISABLED": return { code: "PAYMENT_REQUIRED", message: "Платные прокрутки сейчас недоступны." };
    case "PAYMENT_REQUIRED": return { code: "PAYMENT_REQUIRED", message: "Оплата платной прокрутки не завершена." };
    case "NO_PRIZES": return { code: "NO_PRIZES", message: "В этом сезоне сейчас нет доступных призов." };
    case "NOT_PARTICIPANT": return { code: "NOT_PARTICIPANT", message: "Ты пока не участвуешь в этом сезоне." };
    case "PAYMENT_AMOUNT_MISMATCH": return { code: "PAYMENT_REQUIRED", message: "Цена платной прокрутки изменилась. Обнови экран и попробуй снова." };
    default: return { code: "NETWORK", message: "Не удалось выполнить операцию. Попробуй ещё раз." };
  }
};

async function backendSession(): Promise<ServiceResult<SessionSnapshot>> {
  try { const response = await fetch(`/api/session?initData=${encodeURIComponent(initData())}`); const data = (await response.json()) as BackendSessionResponse; if (!response.ok || !data.ok || !data.snapshot) return { ok: false, error: mapBackendError(data.code ?? "SESSION_FAILED") }; return ok(data.snapshot); }
  catch { return fail("NETWORK", "Не удалось связаться с сервером. Проверь соединение и попробуй ещё раз."); }
}
async function backendFreeSpin(idempotencyKey: string): Promise<ServiceResult<Reward>> {
  try {
    const response = await fetch("/api/spin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData: initData(), paid: false, idempotencyKey }) });
    const data = (await response.json()) as BackendSpinResponse;
    if (!response.ok || !data.ok || !data.reward) return { ok: false, error: mapBackendError(data.code ?? "SPIN_FAILED") };
    return ok(data.reward);
  } catch {
    return fail("NETWORK", "Не удалось связаться с сервером. Повторяем попытку…");
  }
}
async function backendPaymentStatus(payload: string): Promise<ServiceResult<Reward | null>> {
  try {
    const response = await fetch(`/api/payment/status?initData=${encodeURIComponent(initData())}&payload=${encodeURIComponent(payload)}`);
    const data = (await response.json()) as BackendPaymentStatusResponse;
    if (!response.ok || !data.ok) return { ok: false, error: mapBackendError(data.code ?? "PAYMENT_STATUS_FAILED") };
    if (data.status !== "SUCCESS") return ok(null);
    const rewardData = data.spin?.reward;
    if (!rewardData) return ok(null);
    return ok({ id: data.spin?.id ?? `payment_${payload}`, kind: rewardData.kind as RewardKind, title: rewardData.title, subtitle: rewardData.subtitle, amount: rewardData.amount, wonAt: new Date().toISOString(), status: rewardData.status === "RECEIVED" ? "RECEIVED" : "PENDING", payoutNote: rewardData.payoutStatus === "PAID" ? "Выдано." : "Награда записана и ожидает выдачи." });
  } catch {
    return fail("NETWORK", "Не удалось проверить статус оплаты.");
  }
}
async function devState(action: "SET_STARS" | "SET_SUBSCRIBED" | "RESET_FREE_SPIN", value?: number | boolean): Promise<ServiceResult<true>> {
  if (!inTelegram()) return fail("NETWORK", "Инструмент доступен только внутри Telegram.");
  try { const response = await fetch("/api/dev/user-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData: initData(), action, value }) }); const data = (await response.json()) as BackendDevResponse; if (!response.ok || !data.ok) return fail("NETWORK", data.code === "ADMIN_ACCESS_DENIED" ? "Доступ только для администратора." : "Не удалось изменить тестовое состояние."); return ok(true); }
  catch { return fail("NETWORK", "Не удалось изменить тестовое состояние."); }
}
async function openStarsInvoice(price: number): Promise<ServiceResult<Reward>> {
  if (typeof window === "undefined") return fail("NETWORK", "Оплата доступна только внутри Telegram.");
  const tg = (window as Window & { Telegram?: { WebApp?: { openInvoice?: (url: string, callback?: (status: string) => void) => void } } }).Telegram?.WebApp;
  if (!tg?.openInvoice) return fail("NETWORK", "Эта версия Telegram не поддерживает оплату внутри Mini App.");
  try {
    const response = await fetch("/api/payment/invoice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData: initData() }) });
    const data = (await response.json()) as BackendInvoiceResponse;
    if (!response.ok || !data.ok || !data.invoiceUrl || !data.payload) return { ok: false, error: mapBackendError(data.code ?? "INVOICE_FAILED") };
    if (Number(data.price) !== price) return fail("NETWORK", "Цена прокрутки изменилась. Обнови страницу и попробуй снова.");
    const payload = data.payload;
    const initialStatus = await backendPaymentStatus(payload);
    if (initialStatus.ok && initialStatus.data) return initialStatus;
    const status = await new Promise<string>((resolve) => { let settled = false; const finish = (value: string) => { if (!settled) { settled = true; resolve(value); } }; tg.openInvoice?.(data.invoiceUrl!, (value) => finish(value)); window.setTimeout(() => finish("timeout"), 60000); });
    if (status === "cancelled") return fail("PAYMENT_REQUIRED", "Оплата отменена.");
    if (status === "failed") return fail("NETWORK", "Telegram не смог завершить оплату.");
    for (let attempt = 0; attempt < 18; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 1000));
      const payment = await backendPaymentStatus(payload);
      if (payment.ok && payment.data) return payment;
      if (!payment.ok && payment.error.code !== "NETWORK") return payment;
    }
    return fail("NETWORK", "Платёж получен, но результат ещё обрабатывается. Открой экран снова через несколько секунд.");
  } catch { return fail("NETWORK", "Не удалось открыть оплату Telegram Stars."); }
}

export interface SpinOptions { paid?: boolean }
export const cricketApi = {
  async getSession(): Promise<ServiceResult<SessionSnapshot>> { return inTelegram() ? backendSession() : ok(structuredClone(state)); },
  async spin(options: SpinOptions = {}): Promise<ServiceResult<{ reward: Reward; snapshot: SessionSnapshot }>> {
    if (inTelegram()) {
      if (options.paid) { const session = await backendSession(); if (!session.ok) return session; const price = session.data.spin.paidSpinPrice; if (price === null) return fail("SEASON_CLOSED", "Платные прокрутки сейчас недоступны."); const result = await openStarsInvoice(price); if (!result.ok) return result; const refreshed = await backendSession(); if (!refreshed.ok) return refreshed; return ok({ reward: result.data, snapshot: refreshed.data }); }
      const idempotencyKey = crypto.randomUUID().replaceAll("-", "");
      const result = await backendFreeSpin(idempotencyKey);
      if (result.ok) { const session = await backendSession(); if (!session.ok) return session; return ok({ reward: result.data, snapshot: session.data }); }
      if (result.error.code !== "NETWORK") return result;
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const retry = await backendFreeSpin(idempotencyKey);
      if (!retry.ok) return { ok: false, error: { ...retry.error, message: "Не удалось выполнить прокрутку. Проверь соединение и открой экран снова — повторный запрос будет безопасным." } };
      const session = await backendSession(); if (!session.ok) return session; return ok({ reward: retry.data, snapshot: session.data });
    }
    const seasonState = state.season.state;
    if (seasonState === "DRAFT" || seasonState === "SCHEDULED") return fail("SEASON_NOT_STARTED", "Сезон ещё не начался.");
    if (seasonState !== "ACTIVE" && seasonState !== "ENDING") return fail("SEASON_CLOSED", "Сезон завершён.");
    if (!state.user.isSubscribed) return fail("NOT_SUBSCRIBED", "Подпишись на канал, чтобы участвовать.");
    if (!options.paid && state.spin.freeSpins <= 0) return fail("NO_ATTEMPTS", "Сегодняшняя бесплатная попытка уже использована.");
    if (options.paid) { const localPrice = state.spin.paidSpinPrice; if (localPrice === null || state.stars.amount < localPrice) return fail("INSUFFICIENT_STARS", "Недостаточно Stars."); state.stars.amount -= localPrice; } else state.spin.freeSpins -= 1;
    const eligible = state.prizes.filter((p) => p.remaining > 0); if (!eligible.length) return fail("NO_PRIZES", "В этом сезоне сейчас нет доступных призов.");
    const total = eligible.reduce((sum, p) => sum + p.remaining, 0); let cursor = Math.floor(Math.random() * total); let picked = eligible[eligible.length - 1]!;
    for (const p of eligible) { cursor -= p.remaining; if (cursor < 0) { picked = p; break; } }
    const inventory = state.prizes.find((p) => p.id === picked.id); if (!inventory) return fail("NO_PRIZES", "В этом сезоне сейчас нет доступных призов."); inventory.remaining -= 1;
    const reward: Reward = { id: `r_${Math.random().toString(36).slice(2, 9)}`, kind: picked.kind as RewardKind, title: picked.title, subtitle: picked.subtitle, amount: picked.kind === "STARS" ? Number(picked.title.replace(/[^0-9]/g, "")) || undefined : undefined, wonAt: new Date().toISOString(), status: picked.kind === "STARS" ? "RECEIVED" : "PENDING" };
    state.spin.totalSpins += 1; state.rewards = [reward, ...state.rewards]; localPersist(state); return ok({ reward, snapshot: structuredClone(state) });
  },
  async claimGift(): Promise<ServiceResult<{ reward: Reward; snapshot: SessionSnapshot }>> {
    if (inTelegram()) { try { const response = await fetch("/api/gift", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData: initData() }) }); const data = (await response.json()) as BackendGiftResponse; if (!response.ok || !data.ok || !data.reward) return { ok: false, error: mapBackendError(data.code ?? "GIFT_FAILED") }; const session = await backendSession(); if (!session.ok) return session; return ok({ reward: data.reward, snapshot: session.data }); } catch { return fail("NETWORK", "Не удалось получить подарок."); } }
    if (state.gift.state !== "AVAILABLE") return fail("GIFT_UNAVAILABLE", "Подарок сейчас на перезарядке.");
    const reward: Reward = { id: `g_${Math.random().toString(36).slice(2, 9)}`, kind: "STARS", title: "15 Stars", amount: 15, wonAt: new Date().toISOString(), status: "RECEIVED", payoutNote: "Ежедневный подарок зачислен на баланс Stars." };
    state.stars.amount = Math.min(state.stars.max, state.stars.amount + 15); state.rewards = [reward, ...state.rewards]; state.gift = { state: "COOLDOWN", availableAt: new Date(Date.now() + DAY_MS).toISOString() } satisfies Gift; localPersist(state); return ok({ reward, snapshot: structuredClone(state) });
  },
  async requestWithdrawal(amount: number): Promise<ServiceResult<{ withdrawal: Withdrawal; snapshot: SessionSnapshot }>> {
    if (inTelegram()) { try { const response = await fetch("/api/withdraw", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData: initData(), amount }) }); const data = (await response.json()) as BackendWithdrawalResponse; if (!response.ok || !data.ok || !data.withdrawal) return { ok: false, error: mapBackendError(data.code ?? "WITHDRAW_FAILED") }; const session = await backendSession(); if (!session.ok) return session; return ok({ withdrawal: data.withdrawal, snapshot: session.data }); } catch { return fail("NETWORK", "Не удалось создать заявку на вывод."); } }
    if (amount < state.withdrawalMinimum) return fail("BELOW_MINIMUM", `Минимальная сумма вывода — ${state.withdrawalMinimum} Stars.`);
    if (amount > state.stars.amount) return fail("INSUFFICIENT_STARS", "Недостаточно Stars.");
    const withdrawal: Withdrawal = { id: `w_${Math.random().toString(36).slice(2, 9)}`, rewardTitle: "Telegram Stars", amount, requestedAt: new Date().toISOString(), status: "PENDING" };
    state.stars.amount -= amount; state.withdrawals = [withdrawal, ...state.withdrawals]; localPersist(state); return ok({ withdrawal, snapshot: structuredClone(state) });
  },
  async setSeasonState(stateValue: SeasonState): Promise<ServiceResult<SessionSnapshot>> {
    if (inTelegram()) return fail("NETWORK", "Доступно только локально для DEV.");
    state.season.state = stateValue; localPersist(state); return ok(structuredClone(state));
  },
  async setSubscribed(value: boolean): Promise<ServiceResult<SessionSnapshot>> {
    if (inTelegram()) return devState("SET_SUBSCRIBED", value).then(async (result) => result.ok ? await backendSession() : result as ServiceResult<SessionSnapshot>);
    state.user.isSubscribed = value; localPersist(state); return ok(structuredClone(state));
  },
  async setStarsAmount(amount: number): Promise<ServiceResult<SessionSnapshot>> {
    if (inTelegram()) return devState("SET_STARS", amount).then(async (result) => result.ok ? await backendSession() : result as ServiceResult<SessionSnapshot>);
    state.stars.amount = Math.max(0, Math.min(state.stars.max, Math.round(amount))); localPersist(state); return ok(structuredClone(state));
  },
  async setSimulateNetworkError(value: boolean): Promise<ServiceResult<SessionSnapshot>> {
    state.dev.simulateNetworkError = value; localPersist(state); return ok(structuredClone(state));
  },
  async resetDailyFreeSpin(): Promise<ServiceResult<SessionSnapshot>> {
    if (inTelegram()) {
      const result = await devState("RESET_FREE_SPIN");
      return result.ok ? await backendSession() : result as ServiceResult<SessionSnapshot>;
    }
    state.spin.freeSpins = 1;
    localPersist(state);
    return ok(structuredClone(state));
  },
  async reset(): Promise<ServiceResult<SessionSnapshot>> { state = createInitialSnapshot(); localPersist(state); return ok(structuredClone(state)); },
};
