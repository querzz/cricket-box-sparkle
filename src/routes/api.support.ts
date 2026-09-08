import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/support")({
  server: {
    handlers: {
      GET: async () => {
        const raw = process.env["TELEGRAM_SUPPORT_USERNAME"]?.trim().replace(/^@+/, "") ?? "";
        const username = raw || null;
        return Response.json({
          ok: true,
          support: username ? { username, url: `https://t.me/${username}` } : null,
        }, { headers: { "cache-control": "public, max-age=60" } });
      },
    },
  },
});
