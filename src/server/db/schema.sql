CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('DRAFT','SCHEDULED','ACTIVE','ENDING','CLOSED','PAYOUT','ARCHIVED')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  paid_spin_price INTEGER NOT NULL DEFAULT 100,
  free_spins_per_day INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prizes (
  id UUID PRIMARY KEY,
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('STARS','PREMIUM','MONEY','NFT','ITEM','EMPTY')),
  title TEXT NOT NULL,
  description TEXT,
  amount INTEGER,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spins (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  season_id UUID NOT NULL REFERENCES seasons(id),
  source TEXT NOT NULL CHECK (source IN ('FREE','PAID','OWNER_GIFT','ACTIVITY_BONUS','VETERAN_BONUS')),
  price_stars INTEGER NOT NULL DEFAULT 0,
  prize_id UUID REFERENCES prizes(id),
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING','COMPLETED','FAILED','REFUNDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  season_id UUID REFERENCES seasons(id),
  prize_id UUID REFERENCES prizes(id),
  kind TEXT NOT NULL CHECK (kind IN ('STARS','PREMIUM','MONEY','NFT','ITEM')),
  amount INTEGER,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','REVIEW','ISSUED','ERROR','CANCELLED')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  added_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_telegram_id BIGINT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS owner_gifts (
  id UUID PRIMARY KEY,
  sender_admin_id BIGINT REFERENCES admins(id),
  recipient_user_id BIGINT NOT NULL REFERENCES users(id),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'PREPARED' CHECK (status IN ('PREPARED','ISSUED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS owner_gift_items (
  id BIGSERIAL PRIMARY KEY,
  owner_gift_id UUID NOT NULL REFERENCES owner_gifts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('STARS','FREE_SPINS','PREMIUM','MONEY','NFT','ITEM')),
  amount INTEGER,
  title TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS channel_activity (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  season_id UUID REFERENCES seasons(id),
  activity_type TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  source_message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spins_user_created ON spins(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spins_season_created ON spins(season_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_status_created ON payouts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user_season ON channel_activity(user_id, season_id, created_at DESC);
