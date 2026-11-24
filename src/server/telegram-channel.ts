import { isProductionApp, requireBotToken, requireTelegramChannelId } from "@/server/config";

const MEMBER_STATUSES = new Set(["creator", "administrator", "member"]);
type TelegramMembershipResponse = {
  ok: boolean;
  result?: { status?: string; is_member?: boolean };
  description?: string;
};

export type TelegramChatMembershipCheck =
  | { available: true; isMember: boolean }
  | { available: false };

export async function checkTelegramChatMembership(telegramId: number, chatId: string): Promise<TelegramChatMembershipCheck> {
  try {
    const response = await fetch("https://api.telegram.org/bot" + requireBotToken() + "/getChatMember", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: telegramId }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json() as TelegramMembershipResponse;
    if (!response.ok || !data.ok || !data.result) {
      console.warn("[CRICKET BOX] Telegram membership check failed", {
        chatId,
        httpStatus: response.status,
        description: data.description ?? "unknown",
      });
      return { available: false };
    }
    return {
      available: true,
      isMember: MEMBER_STATUSES.has(data.result.status ?? "")
        || (data.result.status === "restricted" && data.result.is_member === true),
    };
  } catch (error) {
    console.warn("[CRICKET BOX] Telegram membership check unavailable", error instanceof Error ? error.message : error);
    return { available: false };
  }
}

export async function getTelegramChatMembership(telegramId: number, chatId: string): Promise<boolean | null> {
  const result = await checkTelegramChatMembership(telegramId, chatId);
  if (!result.available) return isProductionApp() ? false : null;
  return result.isMember;
}

export async function getTelegramChannelMembership(telegramId: number): Promise<boolean | null> {
  try {
    return await getTelegramChatMembership(telegramId, requireTelegramChannelId());
  } catch (error) {
    console.warn("[CRICKET BOX] Primary channel membership check unavailable", error instanceof Error ? error.message : error);
    return isProductionApp() ? false : null;
  }
}
