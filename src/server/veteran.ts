import { type PoolClient } from "pg";

type DbExecutor = Pick<PoolClient, "query">;
export type VeteranTier = "ROOKIE" | "VETERAN" | "ELITE";

export const VETERAN_RULES: Record<VeteranTier, { minSeasons: number; bonusSpins: number; label: string; description: string }> = {
  ROOKIE: { minSeasons: 0, bonusSpins: 0, label: "Новичок", description: "Нет ветеранского бонуса." },
  VETERAN: { minSeasons: 2, bonusSpins: 1, label: "Ветеран", description: "+1 бонусная попытка в первый день нового сезона." },
  ELITE: { minSeasons: 4, bonusSpins: 2, label: "Элита", description: "+2 бонусные попытки в первый день нового сезона." },
};

export function getVeteranTier(completedSeasons: number): VeteranTier {
  if (completedSeasons >= VETERAN_RULES.ELITE.minSeasons) return "ELITE";
  if (completedSeasons >= VETERAN_RULES.VETERAN.minSeasons) return "VETERAN";
  return "ROOKIE";
}

export async function getVeteranHistory(db: DbExecutor, userId: string, currentSeasonId?: string) {
  const result = await db.query<{ seasons: string; spins: string; wins: string }>(
    `SELECT COUNT(DISTINCT s.season_id)::text AS seasons,
            COUNT(*)::text AS spins,
            COUNT(*) FILTER (WHERE p.id IS NOT NULL AND p.kind <> 'EMPTY')::text AS wins
       FROM spins s
       LEFT JOIN payouts p ON p.spin_id=s.id AND p.prize_id IS NOT NULL
      WHERE s.user_id=$1::uuid
        AND s.status='COMPLETED'
        AND ($2::uuid IS NULL OR s.season_id<>$2::uuid)`,
    [userId, currentSeasonId ?? null],
  );
  const row = result.rows[0];
  const seasons = Number(row?.seasons ?? 0);
  const tier = getVeteranTier(seasons);
  return { seasons, spins: Number(row?.spins ?? 0), wins: Number(row?.wins ?? 0), tier, ...VETERAN_RULES[tier] };
}

export async function isVeteranBonusEnabled(db: DbExecutor) {
  const result = await db.query<{ enabled: boolean }>(`SELECT COALESCE((value->>'enabled')::boolean, TRUE) AS enabled FROM app_settings WHERE key='veteran_bonus'`);
  return result.rows[0]?.enabled !== false;
}

export async function grantVeteranBonusIfDue(db: DbExecutor, userId: string, seasonId: string) {
  const enabled = await isVeteranBonusEnabled(db);
  if (!enabled) return { enabled: false, granted: 0, tier: "ROOKIE" as VeteranTier, seasons: 0, remaining: 0 };
  const history = await getVeteranHistory(db, userId, seasonId);
  const current = await db.query<{ bonus_free_spins: number; veteran_bonus_season_id: string | null; veteran_bonus_spins_issued: number }>(
    `SELECT bonus_free_spins,veteran_bonus_season_id::text,veteran_bonus_spins_issued FROM user_state WHERE user_id=$1::uuid FOR UPDATE`,
    [userId],
  );
  const state = current.rows[0];
  if (!state) throw new Error("USER_STATE_NOT_FOUND");
  if (state.veteran_bonus_season_id === seasonId) {
    const used = await db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM spins WHERE user_id=$1::uuid AND season_id=$2::uuid AND type='VETERAN_BONUS' AND status='COMPLETED'`, [userId, seasonId]);
    return { enabled: true, granted: 0, tier: history.tier, seasons: history.seasons, remaining: Math.max(0, Math.min(history.bonusSpins, Number(state.veteran_bonus_spins_issued ?? 0)) - Number(used.rows[0]?.n ?? 0)) };
  }
  const grant = Math.min(history.bonusSpins, Math.max(0, 1000 - Number(state.bonus_free_spins ?? 0)));
  await db.query(`UPDATE user_state SET veteran_bonus_season_id=$2::uuid,veteran_bonus_spins_issued=$3,bonus_free_spins=LEAST(1000,bonus_free_spins+$3),updated_at=now() WHERE user_id=$1::uuid`, [userId, seasonId, grant]);
  return { enabled: true, granted: grant, tier: history.tier, seasons: history.seasons, remaining: grant };
}
