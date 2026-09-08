import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { query } from "@/server/db";
import { seasonElapsedFraction } from "@/server/season-economy";
import { simulateSeason } from "@/server/season-simulator";

export const Route = createFileRoute("/api/admin/economy/simulate")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: string; seasonId?: string; spins?: unknown; trials?: unknown; seed?: unknown };
        await authenticateAdmin(body.initData ?? "");
        const seasonId = (body.seasonId ?? "").trim();
        if (!seasonId) return Response.json({ ok: false, code: "INVALID_SEASON" }, { status: 400 });
        const spinCount = Number(body.spins ?? 10_000);
        const trialCount = Number(body.trials ?? 50);
        const seed = body.seed === undefined ? undefined : Number(body.seed);
        if (!Number.isInteger(spinCount) || spinCount < 1 || spinCount > 100_000) return Response.json({ ok: false, code: "INVALID_SPINS" }, { status: 400 });
        if (!Number.isInteger(trialCount) || trialCount < 1 || trialCount > 200) return Response.json({ ok: false, code: "INVALID_TRIALS" }, { status: 400 });
        if (seed !== undefined && !Number.isFinite(seed)) return Response.json({ ok: false, code: "INVALID_SEED" }, { status: 400 });
        const seasonResult = await query<{ starts_at: string | null; ends_at: string | null }>(`SELECT starts_at::text,ends_at::text FROM seasons WHERE id=$1::uuid`, [seasonId]);
        const season = seasonResult.rows[0];
        if (!season) return Response.json({ ok: false, code: "SEASON_NOT_FOUND" }, { status: 404 });
        const prizes = await query<{ id: string; kind: string; title: string; quantity_total: number; quantity_remaining: number; amount: string; metadata: Record<string, unknown> | null }>(`SELECT id::text,kind,title,quantity_total,quantity_remaining,amount::text,metadata FROM prizes WHERE season_id=$1::uuid AND is_active=TRUE AND quantity_remaining>0 ORDER BY created_at ASC`, [seasonId]);
        const result = simulateSeason({
          spins: spinCount,
          trials: trialCount,
          seed,
          elapsedFraction: seasonElapsedFraction(season.starts_at, season.ends_at),
          prizes: prizes.rows.map(p => ({ id: p.id, kind: p.kind, title: p.title, quantity_total: p.quantity_total, quantity_remaining: p.quantity_remaining, amount: Number(p.amount), weight: Number(p.metadata?.weight ?? 1) || 1, metadata: p.metadata })),
        });
        return Response.json({ ok: true, seasonId, elapsedFraction: seasonElapsedFraction(season.starts_at, season.ends_at), result });
      } catch (error) {
        const code = error instanceof Error ? error.message : "REQUEST_FAILED";
        return Response.json({ ok: false, code }, { status: 401 });
      }
    },
  } },
});
