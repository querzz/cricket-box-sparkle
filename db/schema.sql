CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  language_code TEXT,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_state (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stars_balance INTEGER NOT NULL DEFAULT 125 CHECK (stars_balance >= 0 AND stars_balance <= 500),
  is_subscribed BOOLEAN NOT NULL DEFAULT TRUE,
  is_participant BOOLEAN NOT NULL DEFAULT TRUE,
  daily_gift_claimed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('DRAFT','SCHEDULED','ACTIVE','ENDING','CLOSED','PAYOUT','ARCHIVED')) DEFAULT 'DRAFT',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  paid_spin_price INTEGER NOT NULL DEFAULT 100,
  daily_free_spin BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('STARS','PREMIUM','MONEY','NFT','PHYSICAL','CUSTOM','FREE_SPIN')),
  title TEXT NOT NULL,
  subtitle TEXT,
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT,
  quantity_total INTEGER NOT NULL DEFAULT 0 CHECK (quantity_total >= 0),
  quantity_remaining INTEGER NOT NULL DEFAULT 0 CHECK (quantity_remaining >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (quantity_remaining <= quantity_total)
);

CREATE TABLE IF NOT EXISTS spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('FREE','PAID','OWNER_GIFT','ACTIVITY_BONUS','VETERAN_BONUS')),
  price_stars INTEGER NOT NULL DEFAULT 0,
  prize_id UUID REFERENCES prizes(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','COMPLETED','FAILED','REFUNDED')) DEFAULT 'PENDING',
  telegram_payment_charge_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spin_id UUID REFERENCES spins(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  prize_id UUID REFERENCES prizes(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('STARS','PREMIUM','MONEY','NFT','PHYSICAL','CUSTOM','FREE_SPIN')),
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING','REVIEW','PAID','FAILED','CANCELLED')) DEFAULT 'PENDING',
  operator_admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS owner_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','SENT','OPENED','CLAIMED','CANCELLED')) DEFAULT 'DRAFT',
  rewards JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS channel_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  telegram_user_id BIGINT NOT NULL,
  channel_id BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  event_key TEXT,
  activity_points INTEGER NOT NULL DEFAULT 1,
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS star_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  spin_id UUID REFERENCES spins(id) ON DELETE SET NULL,
  telegram_charge_id TEXT UNIQUE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING','SUCCESS','REFUNDED','FAILED')) DEFAULT 'PENDING',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_spins_user_season ON spins(user_id, season_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_activity_user_time ON channel_activity(telegram_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_star_transactions_charge ON star_transactions(telegram_charge_id);
