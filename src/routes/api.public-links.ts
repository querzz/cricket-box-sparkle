import { createFileRoute } from "@tanstack/react-router";

import { requireBotToken, requireTelegramChannelId, serverConfig } from "@/server/config";

export const Route = createFileRoute("/api/public-links")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const token = requireBotToken();
          const channelId = requireTelegramChannelId();
          const response = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: channelId }),
            signal: AbortSignal.timeout(5000),
          });
          const data = await response.json() as { ok: boolean; result?: { title?: string; username?: string } };
          const username = data.ok ? data.result?.username?.replace(/^@/, "") : undefined;
          return Response.json({
            ok: true,
            channel: {
              title: data.ok ? (data.result?.title ?? "Telegram-канал") : "Telegram-канал",
              username: username ? `@${username}` : null,
              url: username ? `https://t.me/${username}` : null,
            },
            support: {
              username: serverConfig.supportUsername ? `@${serverConfig.supportUsername}` : null,
              url: serverConfig.supportUsername ? `https://t.me/${serverConfig.supportUsername}` : null,
            },
          });
        } catch (error) {
          console.warn("Public links API failed:", error instanceof Error ? error.message : error);
          return Response.json({
            ok: true,
            channel: { title: "Telegram-канал", username: null, url: null },
            support: {
              username: serverConfig.supportUsername ? `@${serverConfig.supportUsername}` : null,
              url: serverConfig.supportUsername ? `https://t.me/${serverConfig.supportUsername}` : null,
            },
          });
        }
      },
    },
  },
});
