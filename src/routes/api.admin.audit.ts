import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { query } from "@/server/db";

type AuditRow = {
  id: string;
  created_at: string;
  actor: string | null;
  role: "OWNER" | "ADMIN" | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};

export const Route = createFileRoute("/api/admin/audit")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const url = new URL(request.url);
        await authenticateAdmin(url.searchParams.get("initData") ?? "");
        const search = (url.searchParams.get("search") ?? "").trim();
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
        const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        const result = await query<AuditRow>(
          `SELECT a.id::text,
                  a.created_at::text,
                  COALESCE(ad.username, ad.telegram_id::text) AS actor,
                  ad.role,
                  a.action,
                  a.entity_type,
                  a.entity_id,
                  a.before_data,
                  a.after_data
             FROM audit_logs a
             LEFT JOIN admins ad ON ad.id = a.admin_id
            WHERE ($2 = ''
               OR a.action ILIKE $1
               OR a.entity_type ILIKE $1
               OR COALESCE(a.entity_id, '') ILIKE $1
               OR COALESCE(ad.username, '') ILIKE $1
               OR COALESCE(ad.telegram_id::text, '') ILIKE $1)
            ORDER BY a.created_at DESC
            LIMIT $3`,
          [pattern, search, limit],
        );
        const counts = await query<{ total: string; admin_events: string; system_events: string }>(
          `SELECT COUNT(*)::text AS total,
                  COUNT(*) FILTER (WHERE admin_id IS NOT NULL)::text AS admin_events,
                  COUNT(*) FILTER (WHERE admin_id IS NULL)::text AS system_events
             FROM audit_logs`,
        );

        return Response.json({
          ok: true,
          counts: {
            total: Number(counts.rows[0]?.total ?? 0),
            adminEvents: Number(counts.rows[0]?.admin_events ?? 0),
            systemEvents: Number(counts.rows[0]?.system_events ?? 0),
          },
          items: result.rows,
        });
      } catch (error) {
        console.error("Audit API failed:", error instanceof Error ? error.message : error);
        return Response.json({ ok: false, code: "AUDIT_FAILED" }, { status: 401 });
      }
    },
  }},
});
