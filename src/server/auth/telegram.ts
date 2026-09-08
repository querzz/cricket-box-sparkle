import type { PoolClient } from "pg";

import { enforceRateLimit } from "@/server/rate-limit";

type TelegramInitDataUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
};

export type TelegramInitData = {
  auth_date: number;
  query_id?: string;
  user?: TelegramInitDataUser;
  hash: string;
};

function parseInitData(initData: string): URLSearchParams {
  const params = new URLSearchParams(initData);
  if (!params.get("hash")) throw new Error("Telegram initData has no hash");
  return params;
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data) as BufferSource);
}

/** Validate Telegram Mini App initData on the server before trusting user fields. */
export async function validateTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 3600) {
  const params = parseInitData(initData);
  const receivedHash = params.get("hash")!;
  const authDate = Number(params.get("auth_date") ?? 0);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isSafeInteger(authDate) || authDate <= 0) throw new Error("Invalid Telegram auth_date");
  if (authDate > now + 60) throw new Error("Telegram auth_date is in the future");
  if (now - authDate > maxAgeSeconds) throw new Error("Telegram initData has expired");

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
  const calculatedHash = hex(await hmacSha256(secretKey, dataCheckString));
  if (calculatedHash !== receivedHash) throw new Error("Invalid Telegram initData hash");

  const rawUser = params.get("user");
  let user: TelegramInitDataUser | undefined;
  try {
    user = rawUser ? (JSON.parse(rawUser) as TelegramInitDataUser) : undefined;
  } catch {
    throw new Error("Invalid Telegram user payload");
  }

  if (user?.id) await enforceRateLimit(`telegram:${user.id}`, 120);
  return { authDate, user, queryId: params.get("query_id") ?? undefined };
}
