import { query, type QueryResult } from "./db.ts";

const DAY_MS = 86_400_000;

export type DailyStreakSummary = {
  enabled: boolean;
  totalDays: number;
  currentDay: number;
  visitedDays: number;
  currentStreak: number;
  checkedInToday: boolean;
  eligibleForReward: boolean;
  rewardStars: number;
};

export function getSeasonDayCount(startsAt: string | Date | null, endsAt: string | Date | null) {
  if (!startsAt || !endsAt) return 0;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(1, Math.ceil((end - start) / DAY_MS));
}

export function getCurrentSeasonDay(startsAt: string | Date | null, endsAt: string | Date | null, now = Date.now()) {
  const totalDays = getSeasonDayCount(startsAt, endsAt);
  if (!totalDays || !startsAt || !endsAt) return 0;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (now < start) return 0;
  if (now >= end) return totalDays;
  return Math.min(totalDays, Math.floor((now - start) / DAY_MS) + 1);
}

export async function recordSeasonCheckin(seasonId: string, userId: string, startsAt: string | null, endsAt: string | null) {
  const dayIndex = getCurrentSeasonDay(startsAt, endsAt);
  if (!dayIndex) return 0;
  await query(
    `INSERT INTO season_daily_checkins (season_id,user_id,day_index)
     VALUES ($1::uuid,$2::uuid,$3)
     ON CONFLICT (season_id,user_id,day_index) DO NOTHING`,
    [seasonId, userId, dayIndex],
  );
  return dayIndex;
}

export function summarizeCheckins(days: number[], totalDays: number, currentDay: number, rewardStars = 15): DailyStreakSummary {
  const unique = [...new Set(days)].filter((day) => Number.isInteger(day) && day >= 1 && day <= totalDays).sort((a,b) => a-b);
  let currentStreak = 0;
  if (currentDay > 0 && unique.includes(currentDay)) {
    const set = new Set(unique);
    for (let day = currentDay; set.has(day); day -= 1) currentStreak += 1;
  }
  return {
    enabled: totalDays > 0,
    totalDays,
    currentDay,
    visitedDays: unique.length,
    currentStreak,
    checkedInToday: currentDay > 0 && unique.includes(currentDay),
    eligibleForReward: totalDays > 0 && unique.length === totalDays && unique.every((day, index) => day === index + 1),
    rewardStars: Math.max(0, Math.floor(rewardStars)),
  };
}

type CheckinRows = { day_index: number }[];

export async function getUserDailyStreak(seasonId: string, startsAt: string | null, endsAt: string | null, rewardStars = 15) {
  const totalDays = getSeasonDayCount(startsAt, endsAt);
  const currentDay = getCurrentSeasonDay(startsAt, endsAt);
  if (!totalDays) return summarizeCheckins([], 0, 0, rewardStars);
  const result: QueryResult<CheckinRows[number]> = await query<CheckinRows[number]>(
    `SELECT day_index FROM season_daily_checkins WHERE season_id=$1::uuid AND user_id=$2::uuid ORDER BY day_index ASC`,
    [seasonId, "00000000-0000-0000-0000-000000000000"],
  );
  return summarizeCheckins(result.rows.map((row) => Number(row.day_index)), totalDays, currentDay, rewardStars);
}

export async function getUserDailyStreakForUser(seasonId: string, userId: string, startsAt: string | null, endsAt: string | null, rewardStars = 15) {
  const totalDays = getSeasonDayCount(startsAt, endsAt);
  const currentDay = getCurrentSeasonDay(startsAt, endsAt);
  if (!totalDays) return summarizeCheckins([], 0, 0, rewardStars);
  const result = await query<{ day_index: number }>(
    `SELECT day_index FROM season_daily_checkins WHERE season_id=$1::uuid AND user_id=$2::uuid ORDER BY day_index ASC`,
    [seasonId, userId],
  );
  return summarizeCheckins(result.rows.map((row) => Number(row.day_index)), totalDays, currentDay, rewardStars);
}
