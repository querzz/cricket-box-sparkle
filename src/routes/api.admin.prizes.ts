import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { query } from "@/server/db";
import { listPrizes, upsertPrize } from "@/server/season-service";

export const Route = createFileRoute("/api/admin/prizes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          await authenticateAdmin(url.searchParams.get("initData") ?? "");
          const seasonId = url.searchParams.get("seasonId");
          if (!seasonId) return Response.json({ ok: false, code: "INVALID_SEASON" }, { status: 400 });
          const includeInactive = url.searchParams.get("includeInactive") === "true";
          const prizes = await listPrizes(seasonId);
          return Response.json({ ok: true, prizes: includeInactive ? prizes : prizes.filter((prize) => prize.is_active) });
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
            amount?: unknown;
            unitCost?: unknown;
            currency?: string | null;
            quantityTotal?: unknown;
            quantityRemaining?: unknown;
            active?: boolean;
            imageUrl?: string | null;
            metadata?: Record<string, unknown>;
          };
          await authenticateAdmin(body.initData ?? "");
          if (!body.seasonId || !body.title?.trim()) {
            return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
          }
          const quantityTotalNumber = Number(body.quantityTotal ?? 0);
          const quantityRemainingNumber = body.quantityRemaining == null ? quantityTotalNumber : Number(body.quantityRemaining);
          const amount = Number(body.amount ?? 0);
          const unitCost = Number(body.unitCost ?? 0);
          if (
            !Number.isFinite(amount) ||
            !Number.isFinite(unitCost) ||
            !Number.isFinite(quantityTotalNumber) ||
            !Number.isFinite(quantityRemainingNumber)
          ) {
            return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
          }
          const quantityTotal = Math.max(0, Math.floor(quantityTotalNumber));
          const quantityRemaining = Math.max(0, Math.floor(quantityRemainingNumber));
          const prize = await upsertPrize({
            id: body.id,
            seasonId: body.seasonId,
            kind: body.kind ?? "CUSTOM",
            title: body.title,
            subtitle: body.subtitle,
            amount,
            unitCost,
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
          const status = [
            "INVALID_PRIZE_KIND",
            "INVALID_PRIZE_TITLE",
            "INVALID_PRIZE_AMOUNT",
            "INVALID_PRIZE_COST",
            "INVALID_PRIZE_QUANTITY",
            "INVALID_INPUT",
          ].includes(code)
            ? 400
            : ["PRIZE_NOT_FOUND", "PRIZE_SEASON_MISMATCH"].includes(code)
              ? 404
              : ["PRIZE_ECONOMICS_LOCKED", "PRIZE_QUANTITY_BELOW_WON"].includes(code)
                ? 409
                : 400;
          return Response.json({ ok: false, code }, { status });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const body = await request.json() as { initData?: unknown; id?: unknown; seasonId?: unknown };
          await authenticateAdmin(typeof body.initData === "string" ? body.initData : "");
          const id = typeof body.id === "string" ? body.id : "";
          const seasonId = typeof body.seasonId === "string" ? body.seasonId : "";
          if (!id || !seasonId) return Response.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
          const result = await query<{ id: string }>(
            `UPDATE prizes SET is_active=FALSE, updated_at=now() WHERE id=$1::uuid AND season_id=$2::uuid RETURNING id::text`,
            [id, seasonId],
          );
          if (!result.rows[0]) return Response.json({ ok: false, code: "PRIZE_NOT_FOUND" }, { status: 404 });
          return Response.json({ ok: true, deactivated: true });
        } catch (error) {
          const code = error instanceof Error ? error.message : "REQUEST_FAILED";
          return Response.json({ ok: false, code }, { status: code === "PRIZE_NOT_FOUND" ? 404 : 400 });
        }
      },
    },
  },
});
