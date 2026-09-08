import { createFileRoute } from "@tanstack/react-router";

import { requireBotToken, requireTelegramChannelId } from "@/server/config";

export const Route = createFileRoute("/api/channel")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const response = await fetch(`https://api.telegram.org/bot${requireBotToken()}/getChat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: requireTelegramChannelId() }),
            signal: AbortSignal.timeout(5000),
          });
          const data = await response.json() as { ok: boolean; result?: { title?: string; username?: string } };
          const username = data.ok ? data.result?.username?.replace(/^@+/, "") ?? null : null;
          return Response.json({ ok: true, channel: data.ok && username ? { title: data.result?.title ?? null, username, url: `https://t.me/${username}` } : null }, { headers: { "cache-control": "public, max-age=60" } });
        } catch {
          return Response.json({ ok: true, channel: null }, { headers: { "cache-control": "public, max-age=30" } });
        }
      },
    },
  },
});
