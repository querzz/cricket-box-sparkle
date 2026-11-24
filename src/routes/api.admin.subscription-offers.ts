import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";

const MAX_ACTIVE_OFFERS = 3;
const USERNAME_PATTERN = /^@?[A-Za-z0-9_]{5,32}$/;

async function listOffers() {
  const result = await query(
    \`SELECT o.id::text,o.title,o.description,o.channel_username,o.channel_url,
            o.reward_spins,o.enabled,o.starts_at::text,o.ends_at::text,o.created_at::text,
            (o.ends_at IS NOT NULL AND o.ends_at<=now()) AS is_expired,
            COUNT(DISTINCT c.user_id)::int AS claimed_users,
            COALESCE(SUM(c.amount),0)::int AS awarded_spins
       FROM subscription_spin_offers o
       LEFT JOIN subscription_spin_offer_claims c ON c.offer_id=o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 100\`,
  );
  return result.rows;
}

export const Route = createFileRoute("/api/admin/subscription-offers")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        await authenticateAdmin(new URL(request.url).searchParams.get("initData") ?? "");
        return Response.json({ ok: true, offers: await listOffers() }, { headers: { "cache-control": "no-store" } });
      } catch {
        return Response.json({ ok: false, code: "AUTH_FAILED" }, { status: 401 });
      }
    },
    POST: async ({ request }) => {
      try {
        const body = await request.json() as {
          initData?: unknown; title?: unknown; description?: unknown;
          channelUsername?: unknown; rewardSpins?: unknown; endsAt?: unknown;
        };
        const admin = await authenticateAdmin(typeof body.initData === "string" ? body.initData : "");
        const title = String(body.title ?? "").trim().slice(0, 100);
        const description = String(body.description ?? "").trim().slice(0, 300);
        const rawUsername = String(body.channelUsername ?? "").trim();
        const rewardSpins = Number(body.rewardSpins ?? 1);
        const username = rawUsername.replace(/^@+/, "").toLowerCase();
        const endsAtRaw = typeof body.endsAt === "string" ? body.endsAt.trim() : "";
        const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;

        if (!title || !USERNAME_PATTERN.test(rawUsername) || !Number.isSafeInteger(rewardSpins) || rewardSpins < 1 || rewardSpins > 20) {
          return Response.json({ ok: false, code: "INVALID_OFFER" }, { status: 400 });
        }
        if (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt.getTime() <= Date.now())) {
          return Response.json({ ok: false, code: "INVALID_EXPIRY" }, { status: 400 });
        }

        const created = await withTransaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext('cricket_box:subscription_offer_limit'))");
          const active = await client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM subscription_spin_offers WHERE enabled=TRUE AND (ends_at IS NULL OR ends_at>now())",
          );
          if (Number(active.rows[0]?.count ?? 0) >= MAX_ACTIVE_OFFERS) throw new Error("ACTIVE_OFFER_LIMIT");
          const duplicate = await client.query(
            "SELECT 1 FROM subscription_spin_offers WHERE enabled=TRUE AND lower(channel_username)=lower($1) AND (ends_at IS NULL OR ends_at>now()) LIMIT 1",
            [username],
          );
          if (duplicate.rows[0]) throw new Error("CHANNEL_ALREADY_PROMOTED");

          const inserted = await client.query<{ id: string }>(
            \`INSERT INTO subscription_spin_offers(title,description,channel_username,channel_url,reward_spins,enabled,starts_at,ends_at,created_by)
             VALUES($1,$2,$3,$4,$5,TRUE,now(),$6,$7::uuid)
             RETURNING id::text\`,
            [title, description, username, "https://t.me/" + username, rewardSpins, endsAt?.toISOString() ?? null, admin.id],
          );
          await client.query(
            "INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'SUBSCRIPTION_OFFER_CREATED','subscription_spin_offer',$2,$3::jsonb)",
            [admin.id, inserted.rows[0]!.id, JSON.stringify({ title, username, rewardSpins, endsAt: endsAt?.toISOString() ?? null })],
          );
          return inserted.rows[0]!;
        });

        return Response.json({ ok: true, id: created.id, offers: await listOffers() });
      } catch (error) {
        const code = error instanceof Error ? error.message : "OFFER_CREATE_FAILED";
        const status = code === "ACTIVE_OFFER_LIMIT" || code === "CHANNEL_ALREADY_PROMOTED" ? 409 : 400;
        return Response.json({ ok: false, code }, { status });
      }
    },
    PATCH: async ({ request }) => {
      try {
        const body = await request.json() as { initData?: unknown; id?: unknown; enabled?: unknown };
        const admin = await authenticateAdmin(typeof body.initData === "string" ? body.initData : "");
        const id = String(body.id ?? "").trim();
        if (!id || typeof body.enabled !== "boolean") {
          return Response.json({ ok: false, code: "INVALID_OFFER" }, { status: 400 });
        }

        await withTransaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext('cricket_box:subscription_offer_limit'))");
          const current = await client.query<{ enabled: boolean; ends_at: string | null; channel_username: string }>(
            "SELECT enabled,ends_at::text,channel_username FROM subscription_spin_offers WHERE id=$1::uuid FOR UPDATE",
            [id],
          );
          const row = current.rows[0];
          if (!row) throw new Error("OFFER_NOT_FOUND");

          if (body.enabled) {
            if (row.ends_at && new Date(row.ends_at).getTime() <= Date.now()) throw new Error("OFFER_EXPIRED");
            const active = await client.query<{ count: string }>(
              "SELECT COUNT(*)::text AS count FROM subscription_spin_offers WHERE enabled=TRUE AND id<>$1::uuid AND (ends_at IS NULL OR ends_at>now())",
              [id],
            );
            if (!row.enabled && Number(active.rows[0]?.count ?? 0) >= MAX_ACTIVE_OFFERS) throw new Error("ACTIVE_OFFER_LIMIT");
            const duplicate = await client.query(
              "SELECT 1 FROM subscription_spin_offers WHERE enabled=TRUE AND id<>$1::uuid AND lower(channel_username)=lower($2) AND (ends_at IS NULL OR ends_at>now()) LIMIT 1",
              [id, row.channel_username],
            );
            if (duplicate.rows[0]) throw new Error("CHANNEL_ALREADY_PROMOTED");
          }

          await client.query("UPDATE subscription_spin_offers SET enabled=$2,updated_at=now() WHERE id=$1::uuid", [id, body.enabled]);
          await client.query(
            "INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'SUBSCRIPTION_OFFER_TOGGLED','subscription_spin_offer',$2,$3::jsonb)",
            [admin.id, id, JSON.stringify({ enabled: body.enabled, channelUsername: row.channel_username })],
          );
        });

        return Response.json({ ok: true, offers: await listOffers() });
      } catch (error) {
        const code = error instanceof Error ? error.message : "OFFER_UPDATE_FAILED";
        const status = code === "OFFER_NOT_FOUND" ? 404 : ["ACTIVE_OFFER_LIMIT", "CHANNEL_ALREADY_PROMOTED", "OFFER_EXPIRED"].includes(code) ? 409 : 400;
        return Response.json({ ok: false, code }, { status });
      }
    },
  } },
});
