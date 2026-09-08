import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";

type Body = {
  initData?: unknown;
  telegramId?: unknown;
  role?: unknown;
  username?: unknown;
  action?: unknown;
};

type AdminRow = {
  id: string;
  telegram_id: string;
  username: string | null;
  role: "OWNER" | "ADMIN";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function jsonError(code: string, status: number) {
  return Response.json({ ok: false, code }, { status });
}

export const Route = createFileRoute("/api/admin/access")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const initData = url.searchParams.get("initData") ?? "";
          await authenticateAdmin(initData);

          const result = await query<AdminRow>(
            `SELECT id, telegram_id, username, role, is_active, created_at, updated_at
             FROM admins ORDER BY CASE WHEN role = 'OWNER' THEN 0 ELSE 1 END, created_at ASC`,
          );

          return Response.json({ ok: true, admins: result.rows });
        } catch (error) {
          const code = error instanceof Error ? error.message : "AUTH_FAILED";
          return jsonError(code === "ADMIN_ACCESS_DENIED" ? code : "AUTH_FAILED", 401);
        }
      },

      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Body;
          const actor = await authenticateAdmin(String(body.initData ?? ""));
          if (actor.role !== "OWNER") return jsonError("OWNER_ONLY", 403);

          const telegramId = String(body.telegramId ?? "").trim();
          if (!/^\d+$/.test(telegramId)) return jsonError("INVALID_TELEGRAM_ID", 400);

          if (body.action === "TRANSFER_OWNER") {
            if (telegramId === String(actor.telegramId)) return jsonError("CANNOT_TRANSFER_TO_SELF", 400);

            await withTransaction(async (client) => {
              const target = await client.query<{ id: string; role: "OWNER" | "ADMIN"; is_active: boolean }>(
                `SELECT id::text,role,is_active FROM admins WHERE telegram_id=$1 FOR UPDATE`,
                [telegramId],
              );
              const targetRow = target.rows[0];
              if (!targetRow) throw new Error("ADMIN_NOT_FOUND");
              if (!targetRow.is_active) throw new Error("ADMIN_INACTIVE");
              if (targetRow.role !== "ADMIN") throw new Error("OWNER_TRANSFER_TARGET_INVALID");

              const currentOwner = await client.query<{ id: string }>(
                `SELECT id::text FROM admins WHERE telegram_id=$1 AND role='OWNER' AND is_active=TRUE FOR UPDATE`,
                [actor.telegramId],
              );
              if (!currentOwner.rows[0]) throw new Error("OWNER_NOT_FOUND");

              await client.query(`UPDATE admins SET role='ADMIN',updated_at=now() WHERE id=$1::uuid`, [currentOwner.rows[0].id]);
              await client.query(`UPDATE admins SET role='OWNER',updated_at=now() WHERE id=$1::uuid`, [targetRow.id]);
              await client.query(
                `INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data)
                 VALUES($1::uuid,'OWNER_TRANSFER','admin',$2,$3::jsonb)`,
                [currentOwner.rows[0].id, targetRow.id, JSON.stringify({ previousOwnerTelegramId: actor.telegramId, newOwnerTelegramId: Number(telegramId) })],
              );
            });

            return Response.json({ ok: true });
          }

          const role = body.role === "OWNER" ? "OWNER" : "ADMIN";
          if (role === "OWNER") return jsonError("OWNER_TRANSFER_REQUIRED", 400);

          const username = typeof body.username === "string" && body.username.trim() ? body.username.trim() : null;
          await query(
            `INSERT INTO admins (telegram_id, username, role, is_active)
             VALUES ($1, $2, 'ADMIN', TRUE)
             ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username, role = 'ADMIN', is_active = TRUE, updated_at = now()`,
            [telegramId, username],
          );

          return Response.json({ ok: true });
        } catch (error) {
          const code = error instanceof Error ? error.message : "AUTH_FAILED";
          const status = ["OWNER_ONLY"].includes(code) ? 403 : ["ADMIN_NOT_FOUND"].includes(code) ? 404 : 400;
          return jsonError(code === "OWNER_ONLY" ? code : code || "REQUEST_FAILED", status);
        }
      },

      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as Body;
          const actor = await authenticateAdmin(String(body.initData ?? ""));
          if (actor.role !== "OWNER") return jsonError("OWNER_ONLY", 403);

          const telegramId = String(body.telegramId ?? "").trim();
          const active = body.role === "REVOKE" ? false : true;
          if (!/^\d+$/.test(telegramId)) return jsonError("INVALID_TELEGRAM_ID", 400);
          if (telegramId === String(actor.telegramId)) return jsonError("CANNOT_CHANGE_SELF", 400);

          if (body.role === "OWNER") return jsonError("OWNER_TRANSFER_REQUIRED", 400);

          await query(
            `UPDATE admins SET is_active = $2, updated_at = now() WHERE telegram_id = $1`,
            [telegramId, active],
          );

          return Response.json({ ok: true });
        } catch (error) {
          const code = error instanceof Error ? error.message : "REQUEST_FAILED";
          return jsonError(code === "OWNER_ONLY" ? code : "REQUEST_FAILED", code === "OWNER_ONLY" ? 403 : 400);
        }
      },

      DELETE: async ({ request }) => {
        try {
          const body = (await request.json()) as Body;
          const actor = await authenticateAdmin(String(body.initData ?? ""));
          if (actor.role !== "OWNER") return jsonError("OWNER_ONLY", 403);

          const telegramId = String(body.telegramId ?? "").trim();
          if (!/^\d+$/.test(telegramId)) return jsonError("INVALID_TELEGRAM_ID", 400);
          if (telegramId === String(actor.telegramId)) return jsonError("CANNOT_REMOVE_SELF", 400);

          await query(`DELETE FROM admins WHERE telegram_id = $1 AND role = 'ADMIN'`, [telegramId]);
          return Response.json({ ok: true });
        } catch (error) {
          const code = error instanceof Error ? error.message : "REQUEST_FAILED";
          return jsonError(code === "OWNER_ONLY" ? code : "REQUEST_FAILED", code === "OWNER_ONLY" ? 403 : 400);
        }
      },
    },
  },
});
