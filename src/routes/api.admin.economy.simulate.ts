import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { query } from "@/server/db";
import { seasonElapsedFraction } from "@/server/season-economy";
import { evaluateEconomyGuardrails } from "@/server/economy-guardrails";
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
        const seasonResult = await query<{ starts_at: string | null; ends_at: string | null; paid_spin_price: number }>(`SELECT starts_at::text,ends_at::text,paid_spin_price FROM seasons WHERE id=$1::uuid`, [seasonId]);
        const season = seasonResult.rows[0];
        if (!season) return Response.json({ ok: false, code: "SEASON_NOT_FOUND" }, { status: 404 });
        const elapsedFraction = seasonElapsedFraction(season.starts_at, season.ends_at);
        const prizes = await query<{ id: string; kind: string; title: string; quantity_total: number; quantity_remaining: number; amount: string; unit_cost: string; metadata: Record<string, unknown> | null }>(`SELECT id::text,kind,title,quantity_total,quantity_remaining,amount::text,unit_cost::text,metadata FROM prizes WHERE season_id=$1::uuid AND is_active=TRUE AND quantity_remaining>0 ORDER BY created_at ASC`, [seasonId]);
        const simulationPrizes = prizes.rows.map(p => ({ id: p.id, kind: p.kind, title: p.title, quantity_total: p.quantity_total, quantity_remaining: p.quantity_remaining, amount: Number(p.amount), unitCost: Number(p.unit_cost), weight: Number(p.metadata?.weight ?? 1) || 1, metadata: p.metadata }));
        const result = simulateSeason({ spins: spinCount, trials: trialCount, seed, elapsedFraction, prizes: simulationPrizes });
        const guardrails = evaluateEconomyGuardrails({
          projectedSeasonSpins: spinCount,
          paidSpinPrice: Number(season.paid_spin_price) || 0,
          prizes: simulationPrizes,
          simulation: result,
        });
        return Response.json({ ok: true, seasonId, elapsedFraction, result, guardrails });
      } catch (error) {
        const code = error instanceof Error ? error.message : "REQUEST_FAILED";
        return Response.json({ ok: false, code }, { status: 401 });
      }
    },
  } },
});
