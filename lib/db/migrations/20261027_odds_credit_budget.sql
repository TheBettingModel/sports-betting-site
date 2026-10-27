-- Prepared migration only. Apply separately after target identity/backup review.
-- No startup DDL; raw API keys and user identifiers must never be stored here.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS odds_api_credit_state (
  scope text PRIMARY KEY,
  month date NOT NULL,
  day date NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  outstanding integer NOT NULL DEFAULT 0 CHECK (outstanding >= 0),
  day_used integer NOT NULL DEFAULT 0 CHECK (day_used >= 0),
  provider_used integer NOT NULL DEFAULT 0 CHECK (provider_used >= 0),
  provider_remaining integer NOT NULL DEFAULT 100000 CHECK (provider_remaining >= 0),
  pricing_fault boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS odds_api_collection_state (
  scope text NOT NULL REFERENCES odds_api_credit_state(scope),
  feed text NOT NULL,
  next_allowed_at timestamptz NOT NULL,
  lease_id text,
  lease_until timestamptz,
  fetched_at timestamptz,
  payload jsonb,
  PRIMARY KEY (scope, feed)
);
COMMIT;
