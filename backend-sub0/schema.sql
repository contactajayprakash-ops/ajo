-- Reference schema for the Ajo backend.
--
-- Sub0 generates these tables for you from the model files in ./models when
-- you deploy. This file is here so you can eyeball the shape, seed a local
-- Postgres, or point pgAdmin/Adminer at the same structure. Table names are
-- the plural of each model file (_user -> users, _activity -> activities).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() for the cron reminder

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  phone             VARCHAR(32),
  password          VARCHAR(255) NOT NULL,
  reliability_score DOUBLE PRECISION NOT NULL DEFAULT 100,
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL,
  deleted_at        TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uniq ON users (email) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS circles (
  id                  TEXT PRIMARY KEY,
  name                VARCHAR(255) NOT NULL,
  description         VARCHAR(1000),
  creator_id          TEXT NOT NULL REFERENCES users(id),
  contribution_amount DOUBLE PRECISION NOT NULL,
  currency            VARCHAR(8) NOT NULL,
  frequency           VARCHAR(16) NOT NULL,
  seats               INTEGER NOT NULL,
  current_cycle       INTEGER NOT NULL DEFAULT 1,
  pot_balance         DOUBLE PRECISION NOT NULL DEFAULT 0,
  status              VARCHAR(16) NOT NULL DEFAULT 'forming',
  invite_code         VARCHAR(32) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL,
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS circles_invite_code ON circles (invite_code);

CREATE TABLE IF NOT EXISTS memberships (
  id              TEXT PRIMARY KEY,
  circle_id       TEXT NOT NULL REFERENCES circles(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  payout_position INTEGER NOT NULL,
  has_been_paid   BOOLEAN NOT NULL DEFAULT false,
  role            VARCHAR(16) NOT NULL DEFAULT 'member',
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS memberships_circle ON memberships (circle_id);
CREATE INDEX IF NOT EXISTS memberships_user ON memberships (user_id);

CREATE TABLE IF NOT EXISTS contributions (
  id         TEXT PRIMARY KEY,
  circle_id  TEXT NOT NULL REFERENCES circles(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  cycle      INTEGER NOT NULL,
  amount     DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS contributions_circle_cycle ON contributions (circle_id, cycle);

CREATE TABLE IF NOT EXISTS payouts (
  id         TEXT PRIMARY KEY,
  circle_id  TEXT NOT NULL REFERENCES circles(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  cycle      INTEGER NOT NULL,
  amount     DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id         TEXT PRIMARY KEY,
  circle_id  TEXT NOT NULL REFERENCES circles(id),
  user_id    TEXT,
  actor_name VARCHAR(255),
  type       VARCHAR(32) NOT NULL,
  message    VARCHAR(500) NOT NULL,
  amount     DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS activities_circle ON activities (circle_id, created_at DESC);
