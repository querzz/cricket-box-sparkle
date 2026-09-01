import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { listPrizes, upsertPrize } from "@/server/season-service";

export const Route = createFileRoute("/api/admin/prizes")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
        const seasonId = new URL(request.url).searchParams.get("seasonId");
        if (!seasonId) return Response.json({ ok: false, code: "INVALID_SEASON" }, { status: 400 });
        return Response.json({ ok: true, prizes: await listPrizes(seasonId) });
      } catch {
        return Response.json({ ok: false, code: "AUTH_FAILED" }, { status: 401 });
      }
    },
    POST: async ({ request }) => {
      try {
        const body = await request.json() as {
          initData?: string;
          id?: string;
          seasonId?: string;
          kind?: string;
          title?: string;
          subtitle?: string | null;
          amount?: number;
          unitCost?: number;
          currency?: string | null;
          quantityTotal?: number;
          quantityRemaining?: number;
          active?: boolean;
          imageUrl?: string | null;
          metadata?: Record<string, unknown>;
        };
        await authenticateAdmin(body.initData ?? "");
        if (!body.seasonId || !body.title?.trim()) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });

        const quantityTotal = Math.max(0, Math.floor(Number(body.quantityTotal ?? 0)));
        const quantityRemaining = body.quantityRemaining == null ? quantityTotal : Math.max(0, Math.floor(Number(body.quantityRemaining)));
        const prize = await upsertPrize({
          id: body.id,
          seasonId: body.seasonId,
          kind: body.kind ?? "CUSTOM",
          title: body.title,
          subtitle: body.subtitle,
          amount: Number(body.amount ?? 0),
          unitCost: Number(body.unitCost ?? 0),
          currency: body.currency,
          quantityTotal,
          quantityRemaining,
          active: body.active !== false,
          imageUrl: body.imageUrl,
          metadata: body.metadata,
        });
        return Response.json({ ok: true, prize });
      } catch (error) {
        const code = error instanceof Error ? error.message : "REQUEST_FAILED";
        const status = ["INVALID_PRIZE_KIND","INVALID_PRIZE_TITLE","INVALID_PRIZE_AMOUNT","INVALID_PRIZE_COST","INVALID_PRIZE_QUANTITY"].includes(code) ? 400
          : ["PRIZE_NOT_FOUND","PRIZE_SEASON_MISMATCH"].includes(code) ? 404
          : ["PRIZE_ECONOMICS_LOCKED","PRIZE_QUANTITY_BELOW_WON"].includes(code) ? 409 : 400;
        return Response.json({ ok: false, code }, { status });
      }
    },
  }}
});
