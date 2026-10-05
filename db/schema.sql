CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), telegram_id BIGINT NOT NULL UNIQUE, username TEXT, first_name TEXT NOT NULL, last_name TEXT, language_code TEXT, is_premium BOOLEAN NOT NULL DEFAULT FALSE, avatar_file_id TEXT, xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS veteran_tier_override TEXT CHECK (veteran_tier_override IS NULL OR veteran_tier_override IN ('ROOKIE','VETERAN','ELITE'));
CREATE TABLE IF NOT EXISTS user_state (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, stars_balance INTEGER NOT NULL DEFAULT 0 CHECK (stars_balance >= 0 AND stars_balance <= 500), is_subscribed BOOLEAN NOT NULL DEFAULT TRUE, is_participant BOOLEAN NOT NULL DEFAULT TRUE, daily_gift_claimed_at TIMESTAMPTZ, bonus_free_spins INTEGER NOT NULL DEFAULT 0 CHECK (bonus_free_spins >= 0 AND bonus_free_spins <= 1000), activity_bonus_season_id UUID, activity_bonus_spins_issued INTEGER NOT NULL DEFAULT 0 CHECK (activity_bonus_spins_issued >= 0 AND activity_bonus_spins_issued <= 1000), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE user_state ALTER COLUMN stars_balance SET DEFAULT 0;
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), telegram_id BIGINT NOT NULL UNIQUE, username TEXT, role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN')), is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN ('DRAFT','SCHEDULED','ACTIVE','ENDING','CLOSED','PAYOUT','ARCHIVED')) DEFAULT 'DRAFT', starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, is_paused BOOLEAN NOT NULL DEFAULT FALSE, paused_at TIMESTAMPTZ, paid_spin_price INTEGER NOT NULL DEFAULT 100, paid_spin_enabled BOOLEAN NOT NULL DEFAULT TRUE, daily_free_spin BOOLEAN NOT NULL DEFAULT TRUE, created_by UUID REFERENCES admins(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
WITH ranked AS (SELECT id,ROW_NUMBER() OVER (ORDER BY CASE WHEN state='ACTIVE' THEN 0 ELSE 1 END,created_at DESC) rn FROM seasons WHERE state IN ('ACTIVE','ENDING')) UPDATE seasons s SET state='CLOSED',updated_at=now() FROM ranked r WHERE s.id=r.id AND r.rn>1;
CREATE UNIQUE INDEX IF NOT EXISTS ux_one_live_season ON seasons ((1)) WHERE state IN ('ACTIVE','ENDING');
CREATE TABLE IF NOT EXISTS prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK (kind IN ('STARS','PREMIUM','MONEY','NFT','PHYSICAL','CUSTOM','FREE_SPIN','EMPTY')), title TEXT NOT NULL, subtitle TEXT, amount NUMERIC(18,2) NOT NULL DEFAULT 0, unit_cost NUMERIC(18,2) NOT NULL DEFAULT 0, currency TEXT, quantity_total INTEGER NOT NULL DEFAULT 0 CHECK (quantity_total >= 0), quantity_remaining INTEGER NOT NULL DEFAULT 0 CHECK (quantity_remaining >= 0), is_active BOOLEAN NOT NULL DEFAULT TRUE, image_url TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (quantity_remaining <= quantity_total)
);
CREATE TABLE IF NOT EXISTS spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT, type TEXT NOT NULL CHECK (type IN ('FREE','PAID','OWNER_GIFT','ACTIVITY_BONUS','VETERAN_BONUS')), price_stars INTEGER NOT NULL DEFAULT 0, prize_id UUID REFERENCES prizes(id) ON DELETE SET NULL, status TEXT NOT NULL CHECK (status IN ('PENDING','COMPLETED','FAILED','REFUNDED')) DEFAULT 'PENDING', telegram_payment_charge_id TEXT, idempotency_key TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
ALTER TABLE spins ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_spins_user_idempotency ON spins(user_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), spin_id UUID REFERENCES spins(id) ON DELETE SET NULL, user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, prize_id UUID REFERENCES prizes(id) ON DELETE SET NULL, kind TEXT NOT NULL CHECK (kind IN ('STARS','PREMIUM','MONEY','NFT','PHYSICAL','CUSTOM','FREE_SPIN','EMPTY')), amount NUMERIC(18,2) NOT NULL DEFAULT 0, currency TEXT, status TEXT NOT NULL CHECK (status IN ('PENDING','REVIEW','PAID','FAILED','CANCELLED')) DEFAULT 'PENDING', operator_admin_id UUID REFERENCES admins(id) ON DELETE SET NULL, note TEXT, fulfillment_provider TEXT NOT NULL DEFAULT 'MANUAL', fulfillment_reference TEXT, fulfillment_note TEXT, fulfillment_metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), paid_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS season_daily_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL CHECK (day_index >= 1),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id,user_id,day_index)
);
CREATE INDEX IF NOT EXISTS idx_season_daily_checkins_season_day ON season_daily_checkins(season_id,day_index,user_id);
CREATE INDEX IF NOT EXISTS idx_season_daily_checkins_user ON season_daily_checkins(user_id,season_id,day_index);
CREATE TABLE IF NOT EXISTS season_streak_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_no INTEGER NOT NULL CHECK (cycle_no >= 1),
  day_index INTEGER NOT NULL CHECK (day_index BETWEEN 1 AND 7),
  reward_type TEXT NOT NULL CHECK (reward_type IN ('STARS','FREE_SPIN','DAILY_GIFT_BOOST','NEXT_SPIN_BOOST')),
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id,user_id,cycle_no,day_index)
);
CREATE INDEX IF NOT EXISTS idx_season_streak_rewards_user ON season_streak_rewards(user_id,season_id,created_at DESC);

CREATE TABLE IF NOT EXISTS daily_gift_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK (kind IN ('NOTHING','STARS','FREE_SPIN','XP')), amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0), title TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS owner_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_by UUID REFERENCES admins(id) ON DELETE SET NULL, title TEXT NOT NULL, message TEXT, status TEXT NOT NULL CHECK (status IN ('DRAFT','SENT','OPENED','CLAIMED','CANCELLED')) DEFAULT 'DRAFT', rewards JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), sent_at TIMESTAMPTZ, opened_at TIMESTAMPTZ, claimed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS channel_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL, telegram_user_id BIGINT NOT NULL, channel_id BIGINT NOT NULL, event_type TEXT NOT NULL, event_key TEXT, activity_points INTEGER NOT NULL DEFAULT 1, occurred_at TIMESTAMPTZ NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), admin_id UUID REFERENCES admins(id) ON DELETE SET NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, before_data JSONB, after_data JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS star_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL, spin_id UUID REFERENCES spins(id) ON DELETE SET NULL, telegram_charge_id TEXT UNIQUE, amount INTEGER NOT NULL CHECK (amount > 0), status TEXT NOT NULL CHECK (status IN ('PENDING','REFUND_PENDING','SUCCESS','REFUNDED','FAILED')) DEFAULT 'PENDING', payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), processed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS stars_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, season_id UUID REFERENCES seasons(id) ON DELETE SET NULL, spin_id UUID REFERENCES spins(id) ON DELETE SET NULL, type TEXT NOT NULL CHECK (type IN ('OPENING_BALANCE','REWARD','DAILY_GIFT','SPIN_SPEND','WITHDRAWAL','REFUND_REVERSAL','CAPPED_OVERFLOW_BURNED','ADMIN_CORRECTION','ADJUSTMENT')), amount INTEGER NOT NULL, reference_id TEXT, idempotency_key TEXT NOT NULL UNIQUE, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS season_drop_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE, name TEXT NOT NULL, trigger_type TEXT NOT NULL CHECK (trigger_type IN ('AT','SPIN_COUNT','SEASON_PERCENT','MANUAL')), trigger_value NUMERIC(18,4), payload JSONB NOT NULL DEFAULT '{}'::jsonb, status TEXT NOT NULL CHECK (status IN ('SCHEDULED','ACTIVE','EXECUTED','CANCELLED')) DEFAULT 'SCHEDULED', created_by UUID REFERENCES admins(id) ON DELETE SET NULL, activated_at TIMESTAMPTZ, executed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_season_drop_events_due ON season_drop_events(season_id,status,trigger_type,trigger_value);
CREATE TABLE IF NOT EXISTS season_economy_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE, completed_spins INTEGER NOT NULL DEFAULT 0, spins_last_hour INTEGER NOT NULL DEFAULT 0, spins_last_day INTEGER NOT NULL DEFAULT 0, spins_last_week INTEGER NOT NULL DEFAULT 0, pace_per_day NUMERIC(18,4) NOT NULL DEFAULT 0, projected_season_spins NUMERIC(18,4) NOT NULL DEFAULT 0, multipliers JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_season_economy_snapshots_season_time ON season_economy_snapshots(season_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stars_ledger_user_time ON stars_ledger(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stars_ledger_season_time ON stars_ledger(season_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_paid_spin_user_season ON star_transactions(user_id,(payload->>'seasonId')) WHERE status='PENDING' AND payload->>'type'='PAID_SPIN';
CREATE INDEX IF NOT EXISTS idx_star_transactions_status_created_at ON star_transactions(status,created_at ASC);
CREATE OR REPLACE FUNCTION prevent_stars_ledger_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'STARS_LEDGER_APPEND_ONLY'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS stars_ledger_no_update_delete ON stars_ledger;
CREATE TRIGGER stars_ledger_no_update_delete BEFORE UPDATE OR DELETE ON stars_ledger FOR EACH ROW EXECUTE FUNCTION prevent_stars_ledger_mutation();
CREATE OR REPLACE FUNCTION seed_stars_ledger_on_state_insert() RETURNS trigger AS $$ BEGIN INSERT INTO stars_ledger(user_id,type,amount,idempotency_key,metadata) VALUES(NEW.user_id,'OPENING_BALANCE',NEW.stars_balance,'opening:'||NEW.user_id::text,jsonb_build_object('source','user_state_insert')) ON CONFLICT(idempotency_key) DO NOTHING; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS user_state_seed_stars_ledger ON user_state;
CREATE TRIGGER user_state_seed_stars_ledger AFTER INSERT ON user_state FOR EACH ROW EXECUTE FUNCTION seed_stars_ledger_on_state_insert();
INSERT INTO stars_ledger(user_id,type,amount,idempotency_key,metadata) SELECT us.user_id,'OPENING_BALANCE',us.stars_balance,'opening:'||us.user_id::text,jsonb_build_object('source','stars_ledger_backfill') FROM user_state us WHERE NOT EXISTS(SELECT 1 FROM stars_ledger sl WHERE sl.idempotency_key='opening:'||us.user_id::text);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_file_id TEXT;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS activity_bonus_season_id UUID;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS activity_bonus_spins_issued INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS daily_gift_chance_boost_pct INTEGER NOT NULL DEFAULT 0 CHECK (daily_gift_chance_boost_pct >= 0 AND daily_gift_chance_boost_pct <= 100);
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS daily_gift_boost_season_id UUID REFERENCES seasons(id) ON DELETE SET NULL;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS next_spin_boosts INTEGER NOT NULL DEFAULT 0 CHECK (next_spin_boosts >= 0 AND next_spin_boosts <= 10);
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS paid_spin_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS fulfillment_provider TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS fulfillment_reference TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS fulfillment_note TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS fulfillment_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE prizes DROP CONSTRAINT IF EXISTS prizes_kind_check;
ALTER TABLE prizes ADD CONSTRAINT prizes_kind_check CHECK (kind IN ('STARS','PREMIUM','MONEY','NFT','PHYSICAL','CUSTOM','FREE_SPIN','EMPTY'));
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_kind_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_kind_check CHECK (kind IN ('STARS','PREMIUM','MONEY','NFT','PHYSICAL','CUSTOM','FREE_SPIN','EMPTY'));
ALTER TABLE season_drop_events ADD COLUMN IF NOT EXISTS trigger_type TEXT;
ALTER TABLE season_drop_events ADD COLUMN IF NOT EXISTS trigger_value NUMERIC(18,4);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS veteran_bonus_season_id UUID;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS veteran_bonus_spins_issued INTEGER NOT NULL DEFAULT 0 CHECK (veteran_bonus_spins_issued >= 0 AND veteran_bonus_spins_issued <= 1000);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS free_spin_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  spins_per_user INTEGER NOT NULL DEFAULT 1 CHECK (spins_per_user >= 1 AND spins_per_user <= 20),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_free_spin_campaigns_live ON free_spin_campaigns(season_id,enabled,starts_at,ends_at);
CREATE TABLE IF NOT EXISTS free_spin_campaign_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES free_spin_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_free_spin_campaign_claims_user ON free_spin_campaign_claims(user_id,created_at DESC);

INSERT INTO app_settings(key,value) VALUES('veteran_bonus','{"enabled":false}'::jsonb) ON CONFLICT(key) DO NOTHING;
INSERT INTO app_settings(key,value) VALUES('daily_gift','{"rewardChanceByTier":{"ROOKIE":8,"VETERAN":10,"ELITE":15}}'::jsonb) ON CONFLICT(key) DO NOTHING;
UPDATE app_settings SET value='{"rewardChanceByTier":{"ROOKIE":8,"VETERAN":10,"ELITE":15}}'::jsonb,updated_at=now() WHERE key='daily_gift' AND value IN ('{"rewardChanceByTier":{"ROOKIE":1,"VETERAN":3,"ELITE":5}}'::jsonb,'{"rewardChanceByTier":{"ROOKIE":60,"VETERAN":70,"ELITE":80}}'::jsonb);
INSERT INTO app_settings(key,value) VALUES('channel_activity','{"enabled":true}'::jsonb) ON CONFLICT(key) DO NOTHING;

UPDATE users SET is_test=TRUE WHERE COALESCE(username,'') LIKE 'ci_%' OR COALESCE(username,'') LIKE 'payment_security_%';
UPDATE admins SET is_test=TRUE WHERE COALESCE(username,'') LIKE 'ci_%' OR COALESCE(username,'') LIKE 'payment_security_%';
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_spins_user_season ON spins(user_id,season_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spins_season_time ON spins(season_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_fulfillment_provider_status ON payouts(fulfillment_provider,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_activity_user_time ON channel_activity(telegram_user_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_activity_channel_event_time ON channel_activity(channel_id,event_type,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_star_transactions_charge ON star_transactions(telegram_charge_id);
CREATE OR REPLACE VIEW season_leaderboard AS
WITH spin_stats AS (SELECT season_id,user_id,COUNT(*)::int spins_count FROM spins WHERE status='COMPLETED' GROUP BY season_id,user_id),
win_stats AS (SELECT s.season_id,s.user_id,COUNT(*)::int wins_count,COALESCE(SUM(sl.amount) FILTER (WHERE sl.type='REWARD' AND sl.spin_id=s.id),0)::numeric stars_won FROM spins s LEFT JOIN stars_ledger sl ON sl.spin_id=s.id AND sl.type='REWARD' JOIN prizes p ON p.id=s.prize_id WHERE s.status='COMPLETED' AND p.kind<>'EMPTY' GROUP BY s.season_id,s.user_id),
base AS (SELECT ss.season_id,ss.user_id,ss.spins_count,COALESCE(ws.wins_count,0)::int wins_count,COALESCE(ws.stars_won,0)::numeric stars_won FROM spin_stats ss LEFT JOIN win_stats ws ON ws.season_id=ss.season_id AND ws.user_id=ss.user_id)
SELECT season_id,user_id,spins_count,wins_count,stars_won,RANK() OVER(PARTITION BY season_id ORDER BY spins_count DESC,wins_count DESC,stars_won DESC,user_id)::int rank FROM base;

ALTER TABLE star_transactions DROP CONSTRAINT IF EXISTS star_transactions_status_check;
ALTER TABLE star_transactions ADD CONSTRAINT star_transactions_status_check CHECK (status IN ('PENDING','REFUND_PENDING','SUCCESS','REFUNDED','FAILED'));


-- 2026-10-05 historical Stars reward backfill
DO $$
DECLARE r RECORD; current_balance INTEGER; requested INTEGER; credited INTEGER; overflow INTEGER;
BEGIN
  FOR r IN
    SELECT s.id AS spin_id,s.user_id,s.season_id,LEAST(500,GREATEST(0,FLOOR(p.amount)))::int AS reward
    FROM spins s
    JOIN prizes p ON p.id=s.prize_id AND p.kind='STARS'
    WHERE s.status='COMPLETED'
      AND NOT EXISTS (SELECT 1 FROM stars_ledger sl WHERE sl.spin_id=s.id AND sl.type='REWARD')
      AND EXISTS (
        SELECT 1 FROM payouts py
        WHERE py.spin_id=s.id AND py.kind='STARS' AND py.status IN ('PENDING','REVIEW')
      )
  LOOP
    requested := r.reward;
    INSERT INTO user_state(user_id) VALUES(r.user_id) ON CONFLICT(user_id) DO NOTHING;
    SELECT stars_balance INTO current_balance FROM user_state WHERE user_id=r.user_id FOR UPDATE;
    credited := LEAST(requested,GREATEST(0,500-current_balance));
    overflow := requested-credited;
    INSERT INTO stars_ledger(user_id,season_id,spin_id,type,amount,reference_id,idempotency_key,metadata)
    VALUES(r.user_id,r.season_id,r.spin_id,'REWARD',requested,r.spin_id::text,'historical-spin-stars:'||r.spin_id::text,
           jsonb_build_object('source','HISTORICAL_BACKFILL','requestedAmount',requested,'creditedAmount',credited,'overflowAmount',overflow))
    ON CONFLICT(idempotency_key) DO NOTHING;
    IF credited>0 THEN
      UPDATE user_state SET stars_balance=current_balance+credited,updated_at=now() WHERE user_id=r.user_id;
    ELSE
      UPDATE user_state SET updated_at=now() WHERE user_id=r.user_id;
    END IF;
    IF overflow>0 THEN
      INSERT INTO stars_ledger(user_id,season_id,spin_id,type,amount,reference_id,idempotency_key,metadata)
      VALUES(r.user_id,r.season_id,r.spin_id,'CAPPED_OVERFLOW_BURNED',-overflow,r.spin_id::text,'historical-spin-stars-overflow:'||r.spin_id::text,
             jsonb_build_object('source','HISTORICAL_BACKFILL','requestedAmount',requested,'creditedAmount',credited,'overflowAmount',overflow))
      ON CONFLICT(idempotency_key) DO NOTHING;
    END IF;
  END LOOP;
END $$;


-- Migrate legacy owner gifts JSON into relational owner_gifts
DO $$
DECLARE g JSONB; uid UUID; aid UUID; reward_type TEXT; reward_amount INTEGER; status_text TEXT;
BEGIN
  FOR g IN
    SELECT value FROM app_settings WHERE key='owner_gifts' AND jsonb_typeof(value)='array'
  LOOP
    -- Legacy records are migrated only when a matching relational row is not already present.
    IF jsonb_typeof(g)='array' THEN
      PERFORM 1;
    END IF;
  END LOOP;
  FOR g IN SELECT jsonb_array_elements(value) FROM app_settings WHERE key='owner_gifts' AND jsonb_typeof(value)='array'
  LOOP
    SELECT id INTO uid FROM users WHERE telegram_id::text=(g->>'telegramId') AND is_test=FALSE LIMIT 1;
    IF uid IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM owner_gifts WHERE user_id=uid AND title=COALESCE(g->>'gift','Личный подарок') AND created_at BETWEEN COALESCE((g->>'createdAt')::timestamptz,now())-interval '1 minute' AND COALESCE((g->>'createdAt')::timestamptz,now())+interval '1 minute') THEN CONTINUE; END IF;
    reward_type:=COALESCE(g->>'rewardType','NOTE');
    reward_amount:=GREATEST(0,COALESCE((g->>'amount')::int,0));
    status_text:=CASE WHEN g->>'status'='Выдан' THEN 'CLAIMED' WHEN g->>'status'='Отменён' THEN 'CANCELLED' ELSE 'SENT' END;
    INSERT INTO owner_gifts(user_id,title,message,status,rewards,created_at,claimed_at)
      VALUES(uid,COALESCE(g->>'gift','Личный подарок'),NULLIF(g->>'message',''),status_text,
             CASE WHEN reward_type='NOTE' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('type',reward_type,'amount',reward_amount)) END,
             COALESCE((g->>'createdAt')::timestamptz,now()),CASE WHEN status_text='CLAIMED' THEN COALESCE((g->>'issuedAt')::timestamptz,now()) ELSE NULL END);
  END LOOP;
END $$;

ALTER TABLE owner_gifts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();


CREATE TABLE IF NOT EXISTS entertainment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID REFERENCES seasons(id) ON DELETE SET NULL,
  created_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('GIFT_OR_PASS','GOOD_OR_BAD','OWNER_SPECIAL')),
  status TEXT NOT NULL DEFAULT 'OFFERED' CHECK (status IN ('OFFERED','CLAIMED','PASSED','CANCELLED','EXPIRED')),
  pass_remaining INTEGER NOT NULL DEFAULT 0 CHECK (pass_remaining >= 0 AND pass_remaining <= 20),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_entertainment_events_user ON entertainment_events(user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entertainment_events_season ON entertainment_events(season_id,type,status,created_at DESC);


-- Backfill actual close times for already closed seasons
UPDATE seasons s
SET closed_at = COALESCE(
  (
    SELECT a.created_at
    FROM audit_logs a
    WHERE a.entity_type='season'
      AND a.entity_id=s.id::text
      AND a.action IN ('SEASON_STATE_AUTO_TRANSITION','SEASON_UPDATED')
      AND a.after_data->>'state'='CLOSED'
    ORDER BY a.created_at ASC
    LIMIT 1
  ),
  CASE
    WHEN s.state IN ('CLOSED','PAYOUT','ARCHIVED') AND s.updated_at < COALESCE(s.ends_at, s.updated_at) THEN s.updated_at
    ELSE NULL
  END
)
WHERE s.state IN ('CLOSED','PAYOUT','ARCHIVED') AND s.closed_at IS NULL;
