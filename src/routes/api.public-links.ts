import { createFileRoute } from "@tanstack/react-router";

import { requireBotToken, requireTelegramChannelId, serverConfig } from "@/server/config";
import { query } from "@/server/db";

export const Route = createFileRoute("/api/public-links")({
  server: {
    handlers: {
      GET: async () => {
        let channel: { title: string; username: string | null; url: string | null } = { title: "Telegram-канал", username: null, url: null };
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
          const username = data.ok ? data.result?.username?.replace(/^@+/, "") : undefined;
          channel = {
            title: data.ok ? (data.result?.title ?? "Telegram-канал") : "Telegram-канал",
            username: username ?? null,
            url: username ? `https://t.me/${username}` : null,
          };
        } catch (error) {
          console.warn("Public channel link failed:", error instanceof Error ? error.message : error);
        }

        let season: { title: string } | null = null;
        try {
          const result = await query<{ title: string }>(`
            WITH ranked AS (
              SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS season_number
              FROM seasons
            )
            SELECT CONCAT('CRICKET BOX #', LPAD(r.season_number::text, 3, '0')) AS title
              FROM seasons s
              JOIN ranked r ON r.id = s.id
             WHERE s.state IN ('ACTIVE','ENDING')
             ORDER BY CASE WHEN s.state='ACTIVE' THEN 0 ELSE 1 END, s.created_at DESC
             LIMIT 1
          `);
          season = result.rows[0] ?? null;
        } catch (error) {
          console.warn("Public season title lookup failed:", error instanceof Error ? error.message : error);
        }

        return Response.json({
          ok: true,
          channel,
          season,
          support: {
            username: serverConfig.supportUsername ? `@${serverConfig.supportUsername}` : null,
            url: serverConfig.supportUsername ? `https://t.me/${serverConfig.supportUsername}` : null,
          },
        }, { headers: { "cache-control": "public, max-age=30" } });
      },
    },
  },
});
