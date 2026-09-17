import { isProductionApp, requireBotToken, requireTelegramChannelId } from "@/server/config";

const MEMBER_STATUSES = new Set(["creator", "administrator", "member"]);
type TelegramMembershipResponse = {
  ok: boolean;
  result?: {
    status?: string;
    is_member?: boolean;
  };
  description?: string;
};

export async function getTelegramChannelMembership(telegramId: number): Promise<boolean | null> {
  try {
    const channelId = requireTelegramChannelId();
    const response = await fetch(`https://api.telegram.org/bot${requireBotToken()}/getChatMember`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: channelId, user_id: telegramId }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json() as TelegramMembershipResponse;
    if (!response.ok || !data.ok || !data.result) {
      console.warn("[CRICKET BOX] Telegram membership check failed", {
        httpStatus: response.status,
        description: data.description ?? "unknown",
      });
      // In production, never fall back to a previously cached membership flag:
      // a Telegram outage must fail closed rather than granting participation based
      // on stale subscription state. Local/dev keeps the stored-state fallback.
      return isProductionApp() ? false : null;
    }
    return MEMBER_STATUSES.has(data.result.status ?? "")
      || (data.result.status === "restricted" && data.result.is_member === true);
  } catch (error) {
    console.warn("[CRICKET BOX] Telegram membership check unavailable", error instanceof Error ? error.message : error);
    return isProductionApp() ? false : null;
  }
}