import { createFileRoute } from "@tanstack/react-router";

import { withTransaction } from "@/server/db";
import { activateDueDrops, reconcileSeasonStates } from "@/server/liveops";

function isAuthorized(request: Request) {
  const secret = process.env["LIVEOPS_CRON_SECRET"]?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export const Route = createFileRoute("/api/internal/liveops/tick")({
  server: { handlers: {
    POST: async ({ request }) => {
      if (!isAuthorized(request)) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });

      try {
        const result = await withTransaction(async client => {
          const lock = await client.query<{ locked: boolean }>(`SELECT pg_try_advisory_xact_lock(hashtext('cricket-box:liveops-tick')) AS locked`);
          if (!lock.rows[0]?.locked) throw new Error("TICK_IN_PROGRESS");

          const transitions = await reconcileSeasonStates(client);
          const seasons = await client.query<{ id: string; code: string }>(`SELECT id::text,code FROM seasons WHERE state IN ('ACTIVE','ENDING') ORDER BY starts_at NULLS LAST,created_at ASC`);
          const activated: Array<{ seasonId: string; code: string; dropIds: string[] }> = [];
          for (const season of seasons.rows) {
            const dropIds = await activateDueDrops(client, season.id);
            activated.push({ seasonId: season.id, code: season.code, dropIds });
          }
          return { transitions, activated };
        });

        return Response.json({ ok: true, transitions: result.transitions, seasons: result.activated, activatedCount: result.activated.reduce((sum, item) => sum + item.dropIds.length, 0) });
      } catch (error) {
        const code = error instanceof Error ? error.message : "REQUEST_FAILED";
        return Response.json({ ok: false, code }, { status: code === "TICK_IN_PROGRESS" ? 409 : 500 });
      }
    },
  } },
});
