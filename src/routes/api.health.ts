import { createFileRoute } from "@tanstack/react-router";

import { healthCheck } from "@/server/db";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const ok = await healthCheck();
          return Response.json({ ok: true, database: ok }, { status: 200 });
        } catch (error) {
          console.error("[CRICKET BOX] health check failed", error instanceof Error ? error.message : error);
          return Response.json({ ok: false, database: false }, { status: 503 });
        }
      },
    },
  },
});
