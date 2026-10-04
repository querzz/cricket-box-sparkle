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
          const result = await query<{ code: string; name: string }>(`
            SELECT code, name
              FROM seasons
             WHERE state IN ('ACTIVE','ENDING')
             ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END, created_at DESC
             LIMIT 1
          `);
          const row = result.rows[0];
          if (row) {
            const code = row.code.trim();
            const name = row.name.trim();
            const codeMatch = code.match(/^(?:CB|C)(\\d+)(?:[-_].*)?$/i);
            const nameMatch = name.match(/^CRICKET\\s+BOX\\s*#?(\\d+)(?:[-_].*)?$/i);
            const title = codeMatch
              ? `CRICKET BOX #${codeMatch[1]!.padStart(3, "0")}`
              : nameMatch
                ? `CRICKET BOX #${nameMatch[1]!.padStart(3, "0")}`
                : (name || code || "CRICKET BOX");
            season = { title };
          }
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
        }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
