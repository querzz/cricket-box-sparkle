import { query } from "@/server/db";
import { requireBotToken } from "@/server/config";
import { validateTelegramInitData } from "@/server/auth/telegram";

export type AdminRole = "OWNER" | "ADMIN";

export type AuthenticatedAdmin = {
  id: string;
  telegramId: number;
  username: string | null;
  firstName: string;
  role: AdminRole;
};

export async function authenticateAdmin(initData: string): Promise<AuthenticatedAdmin> {
  if (!initData.trim()) throw new Error("INIT_DATA_MISSING");

  const validated = await validateTelegramInitData(initData, requireBotToken());
  const user = validated.user;
  if (!user?.id || !user.first_name) throw new Error("TELEGRAM_USER_MISSING");

  await query(
    `INSERT INTO users (telegram_id, username, first_name, last_name, language_code, is_premium, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = EXCLUDED.username,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       language_code = EXCLUDED.language_code,
       is_premium = EXCLUDED.is_premium,
       last_seen_at = now()`,
    [user.id, user.username ?? null, user.first_name, user.last_name ?? null, user.language_code ?? null, Boolean(user.is_premium)],
  );

  const result = await query<{ id: string; role: AdminRole }>(
    `SELECT id::text, role FROM admins WHERE telegram_id = $1 AND is_active = TRUE LIMIT 1`,
    [user.id],
  );

  const row = result.rows[0];
  if (!row) throw new Error("ADMIN_ACCESS_DENIED");

  await query(
    `UPDATE admins SET username = $2, updated_at = now() WHERE telegram_id = $1`,
    [user.id, user.username ?? null],
  );

  return {
    id: row.id,
    telegramId: user.id,
    username: user.username ?? null,
    firstName: user.first_name,
    role: row.role,
  };
}
