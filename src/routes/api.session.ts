import { createFileRoute } from "@tanstack/react-router";

import { validateTelegramInitData } from "@/server/auth/telegram";
import { requireBotToken } from "@/server/config";
import { query } from "@/server/db";

const MAX_STARS = 500;
const GIFT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type UserRow = {
  id: string;
  telegram_id: string;
  username: string | null;
  first_name: string;
  last_name: string | null;
  is_premium: boolean;
  xp: number;
  level: number;
};

type SeasonRow = {
  id: string;
  code: string;
  name: string;
  state:
    | "DRAFT"
    | "SCHEDULED"
    | "ACTIVE"
    | "ENDING"
    | "CLOSED"
    | "PAYOUT"
    | "ARCHIVED";
  starts_at: string | null;
  ends_at: string | null;
  paid_spin_price: number;
  daily_free_spin: boolean;
};

export const Route = createFileRoute("/api/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const initData = (new URL(request.url).searchParams.get("initData") ?? "").trim();
          if (!initData) return Response.json({ ok: false, code: "INIT_DATA_MISSING" }, { status: 400 });

          const validated = await validateTelegramInitData(initData, requireBotToken());
          const tgUser = validated.user;
          if (!tgUser?.id || !tgUser.first_name) return Response.json({ ok: false, code: "TELEGRAM_USER_MISSING" }, { status: 400 });

          const userResult = await query<UserRow>(
            `INSERT INTO users (
               telegram_id, username, first_name, last_name, language_code, is_premium, last_seen_at
             ) VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (telegram_id) DO UPDATE SET
               username = EXCLUDED.username,
               first_name = EXCLUDED.first_name,
               last_name = EXCLUDED.last_name,
               language_code = EXCLUDED.language_code,
               is_premium = EXCLUDED.is_premium,
               last_seen_at = now()
             RETURNING id::text, telegram_id::text, username, first_name, last_name, is_premium, xp, level`,
            [tgUser.id, tgUser.username ?? null, tgUser.first_name, tgUser.last_name ?? null, tgUser.language_code ?? null, Boolean(tgUser.is_premium)],
          );

          const user = userResult.rows[0];
          if (!user) throw new Error("USER_NOT_FOUND");

          await query(
            `INSERT INTO user_state (user_id, stars_balance, is_subscribed, is_participant, bonus_free_spins)
             VALUES ($1::uuid, 125, TRUE, TRUE, 0)
             ON CONFLICT (user_id) DO UPDATE SET updated_at = now()`,
            [user.id],
          );

          const stateResult = await query<{
            stars_balance: number;
            is_subscribed: boolean;
            is_participant: boolean;
            daily_gift_claimed_at: string | null;
            bonus_free_spins: number;
          }>(
            `SELECT stars_balance, is_subscribed, is_participant, daily_gift_claimed_at::text, bonus_free_spins
               FROM user_state WHERE user_id = $1::uuid`,
            [user.id],
          );
          const userState = stateResult.rows[0] ?? {
            stars_balance: 125,
            is_subscribed: true,
            is_participant: true,
            daily_gift_claimed_at: null,
            bonus_free_spins: 0,
          };

          const seasonResult = await query<SeasonRow>(
            `SELECT id::text, code, name, state, starts_at::text, ends_at::text, paid_spin_price, daily_free_spin
               FROM seasons
              ORDER BY CASE WHEN state='ACTIVE' THEN 0 WHEN state='ENDING' THEN 1 ELSE 2 END, created_at DESC
              LIMIT 1`,
          );
          const season = seasonResult.rows[0];
          if (!season) return Response.json({ ok: false, code: "NO_SEASON" }, { status: 409 });

          const prizeResult = await query<{
            id: string; kind: string; title: string; subtitle: string | null; amount: string; quantity_remaining: number; quantity_total: number;
          }>(
            `SELECT id::text, kind, title, subtitle, amount::text, quantity_remaining, quantity_total
               FROM prizes WHERE season_id = $1::uuid ORDER BY created_at ASC`,
            [season.id],
          );

          const spinStats = await query<{ total: string }>(
            `SELECT COUNT(*)::text AS total FROM spins WHERE user_id = $1::uuid AND season_id = $2::uuid AND status = 'COMPLETED'`,
            [user.id, season.id],
          );

          const freeToday = await query<{ exists: boolean }>(
            `SELECT EXISTS(
               SELECT 1 FROM spins
                WHERE user_id = $1::uuid AND season_id = $2::uuid AND type = 'FREE' AND status = 'COMPLETED'
                  AND created_at >= date_trunc('day', now())
             ) AS exists`,
            [user.id, season.id],
          );

          const live = season.state === "ACTIVE" || season.state === "ENDING";
          const dailyAvailable = season.daily_free_spin && live && userState.is_subscribed && userState.is_participant && !freeToday.rows[0]?.exists ? 1 : 0;
          const bonusFreeSpins = live && userState.is_subscribed && userState.is_participant ? Math.max(0, Number(userState.bonus_free_spins ?? 0)) : 0;
          const freeSpins = dailyAvailable + bonusFreeSpins;

          const rewardResult = await query<{
            id: string; kind: string; title: string; subtitle: string | null; amount: string; status: string; created_at: string;
          }>(
            `SELECT p.id::text, p.kind, p.title, p.subtitle, p.amount::text, py.status, py.created_at::text
               FROM payouts py JOIN prizes p ON p.id = py.prize_id
              WHERE py.user_id = $1::uuid AND py.status IN ('PENDING','REVIEW','PAID')
              ORDER BY py.created_at DESC LIMIT 50`,
            [user.id],
          );

          const giftHistory = await query<{
            id: string; kind: string; title: string; amount: number; created_at: string; metadata: Record<string, unknown> | null;
          }>(
            `SELECT id::text, kind, title, amount, created_at::text, metadata
               FROM daily_gift_claims WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 30`,
            [user.id],
          );

          const rewards = [
            ...rewardResult.rows.map((r) => ({
              id: `${r.id}_reward`,
              kind: r.kind === "FREE_SPIN" ? "FREE_SPIN" : r.kind,
              title: r.title,
              subtitle: r.subtitle ?? undefined,
              amount: Number(r.amount) || undefined,
              wonAt: r.created_at,
              status: r.status === "PAID" ? "RECEIVED" : "PENDING",
              payoutNote: r.status === "PAID" ? "Выдано." : "Ожидает выдачи администратором.",
            })),
            ...giftHistory.rows.map((g) => ({
              id: `${g.id}_gift`,
              kind: g.kind,
              title: g.title,
              amount: Number(g.amount) || undefined,
              wonAt: g.created_at,
              status: "RECEIVED" as const,
              payoutNote: g.kind === "XP" ? `+${g.amount} XP` : g.kind === "FREE_SPIN" ? `+${g.amount} бесплатная прокрутка` : g.kind === "NOTHING" ? "Без награды." : `+${g.amount} Stars`,
            })),
          ].sort((a, b) => new Date(b.wonAt).getTime() - new Date(a.wonAt).getTime()).slice(0, 60);

          const withdrawalResult = await query<{ id: string; amount: string; status: string; created_at: string }>(
            `SELECT id::text, amount::text, status, created_at::text
               FROM payouts
              WHERE user_id = $1::uuid AND prize_id IS NULL AND note = 'WITHDRAWAL_REQUEST'
              ORDER BY created_at DESC LIMIT 20`,
            [user.id],
          );

          const claimedAt = userState.daily_gift_claimed_at ? new Date(userState.daily_gift_claimed_at) : null;
          const giftedRecently = Boolean(claimedAt && Number.isFinite(claimedAt.getTime()) && Date.now() - claimedAt.getTime() < GIFT_COOLDOWN_MS);
          const nextGift = giftedRecently && claimedAt ? new Date(claimedAt.getTime() + GIFT_COOLDOWN_MS) : new Date();

          return Response.json({
            ok: true,
            snapshot: {
              user: {
                id: user.id,
                username: user.username ? `@${user.username.replace(/^@/, "")}` : "@username",
                isParticipant: userState.is_participant,
                isSubscribed: userState.is_subscribed,
                xp: Number(user.xp ?? 0),
                level: Math.max(1, Number(user.level ?? 1)),
              },
              season: {
                id: season.id, code: season.code, title: season.name, state: season.state,
                startsAt: season.starts_at ?? new Date().toISOString(),
                endsAt: season.ends_at ?? new Date(Date.now() + 14 * 86400000).toISOString(),
                paidSpinPrice: season.paid_spin_price,
              },
              stars: { amount: Math.max(0, Math.min(MAX_STARS, Number(userState.stars_balance ?? 0))), max: MAX_STARS },
              spin: {
                freeSpins,
                bonusFreeSpins,
                freeSpinDate: freeToday.rows[0]?.exists ? new Date().toISOString() : undefined,
                paidSpinPrice: season.paid_spin_price,
                totalSpins: Number(spinStats.rows[0]?.total ?? 0),
              },
              gift: {
                state: giftedRecently ? "COOLDOWN" : live && userState.is_participant ? "AVAILABLE" : "LOCKED",
                availableAt: nextGift.toISOString(),
              },
              prizes: prizeResult.rows.map((p) => ({
                id: p.id,
                kind: p.kind === "FREE_SPIN" ? "FREE_SPIN" : p.kind,
                title: p.title,
                subtitle: p.subtitle ?? undefined,
                remaining: p.quantity_remaining,
                total: p.quantity_total,
                weight: 1,
              })),
              rewards,
              withdrawals: withdrawalResult.rows.map((w) => ({
                id: w.id, rewardTitle: "Telegram Stars", amount: Number(w.amount) || 0, requestedAt: w.created_at,
                status: w.status === "PAID" ? "PAID" : ["FAILED","CANCELLED"].includes(w.status) ? "REJECTED" : "PENDING",
              })),
              withdrawalMinimum: 50,
              dev: { simulateNetworkError: false },
            },
          });
        } catch (error) {
          console.error("Session API failed:", error instanceof Error ? error.message : error);
          return Response.json({ ok: false, code: "SESSION_FAILED" }, { status: 500 });
        }
      },
    },
  },
});
