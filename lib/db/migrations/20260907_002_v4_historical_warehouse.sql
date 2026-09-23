BEGIN;

CREATE TABLE IF NOT EXISTS v4_historical_sources (
  id BIGSERIAL PRIMARY KEY,
  source_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  retrieval_method TEXT NOT NULL,
  source_uri TEXT,
  retrieved_at TIMESTAMPTZ NOT NULL,
  raw_payload_hash TEXT NOT NULL CHECK (raw_payload_hash ~ '^[0-9a-f]{64}$'),
  raw_row_count INTEGER NOT NULL CHECK (raw_row_count >= 0),
  provenance JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v4_historical_identities (
  id BIGSERIAL PRIMARY KEY,
  sport TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_entity_id TEXT NOT NULL,
  canonical_entity_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  season TEXT,
  competition TEXT,
  proof JSONB NOT NULL,
  identity_hash TEXT NOT NULL CHECK (identity_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS v4_historical_identity_provider_unique
  ON v4_historical_identities (sport, provider, provider_entity_id, COALESCE(season,''), COALESCE(competition,''));

CREATE TABLE IF NOT EXISTS v4_historical_events (
  id BIGSERIAL PRIMARY KEY,
  sport TEXT NOT NULL,
  league TEXT,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  canonical_event_id TEXT NOT NULL,
  season TEXT NOT NULL,
  event_start TIMESTAMPTZ NOT NULL,
  completion_time TIMESTAMPTZ,
  completion_time_kind TEXT NOT NULL CHECK (completion_time_kind IN ('SOURCE_REPORTED','CONSERVATIVE_BOUND','UNAVAILABLE')),
  home_participant_id TEXT,
  away_participant_id TEXT,
  participant_a_id TEXT,
  participant_b_id TEXT,
  home_score INTEGER,
  away_score INTEGER,
  participant_a_won BOOLEAN,
  target_available_at TIMESTAMPTZ,
  source_id BIGINT NOT NULL REFERENCES v4_historical_sources(id),
  raw_event_hash TEXT NOT NULL CHECK (raw_event_hash ~ '^[0-9a-f]{64}$'),
  canonical_event_hash TEXT NOT NULL CHECK (canonical_event_hash ~ '^[0-9a-f]{64}$'),
  eligibility TEXT NOT NULL CHECK (eligibility IN ('ELIGIBLE','QUARANTINED')),
  quarantine_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((eligibility='ELIGIBLE' AND quarantine_reason IS NULL) OR (eligibility='QUARANTINED' AND quarantine_reason IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS v4_historical_event_identity_unique
  ON v4_historical_events (sport, provider, provider_event_id, canonical_event_hash);
CREATE INDEX IF NOT EXISTS v4_historical_event_chronology_idx
  ON v4_historical_events (sport, event_start);

CREATE TABLE IF NOT EXISTS v4_historical_cohorts (
  id BIGSERIAL PRIMARY KEY,
  sport TEXT NOT NULL,
  cohort_id TEXT NOT NULL,
  cohort_version TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  contract_hash TEXT NOT NULL CHECK (contract_hash ~ '^[0-9a-f]{64}$'),
  source_manifest JSONB NOT NULL,
  date_start TIMESTAMPTZ NOT NULL,
  date_end TIMESTAMPTZ NOT NULL,
  raw_rows INTEGER NOT NULL,
  eligible_rows INTEGER NOT NULL,
  quarantined_rows INTEGER NOT NULL,
  feature_count INTEGER NOT NULL,
  training_rows INTEGER NOT NULL,
  validation_rows INTEGER NOT NULL,
  cohort_hash TEXT NOT NULL CHECK (cohort_hash ~ '^[0-9a-f]{64}$'),
  frozen_at TIMESTAMPTZ NOT NULL,
  UNIQUE (sport, cohort_id, cohort_version, cohort_hash)
);

CREATE TABLE IF NOT EXISTS v4_full_slate_runs (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  sport TEXT NOT NULL,
  sport_date TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('DRY_RUN','SHADOW','PRODUCTION')),
  scheduled_events INTEGER NOT NULL,
  eligible_events INTEGER NOT NULL,
  forecasted_events INTEGER NOT NULL,
  failed_events INTEGER NOT NULL,
  coverage_basis_points INTEGER NOT NULL CHECK (coverage_basis_points BETWEEN 0 AND 10000),
  failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (scheduled_events >= eligible_events AND eligible_events = forecasted_events + failed_events)
);

CREATE TABLE IF NOT EXISTS v4_forecast_versions (
  id BIGSERIAL PRIMARY KEY,
  prediction_id TEXT NOT NULL UNIQUE,
  sport TEXT NOT NULL,
  game_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  supersedes_prediction_id TEXT,
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  contract_hash TEXT NOT NULL,
  feature_snapshot_id TEXT NOT NULL,
  feature_hash TEXT NOT NULL,
  data_cutoff TIMESTAMPTZ NOT NULL,
  predicted_at TIMESTAMPTZ NOT NULL,
  event_start TIMESTAMPTZ NOT NULL,
  approval_state TEXT NOT NULL,
  maturity TEXT NOT NULL,
  forecast_status TEXT NOT NULL CHECK (forecast_status IN ('V4_VALIDATING','V4_PROVISIONAL','V4_APPROVED')),
  official_pick_status TEXT NOT NULL CHECK (official_pick_status IN ('NOT_PUBLICATION_ELIGIBLE','NO_OFFICIAL_PLAY','OFFICIAL_TBM_PLAY')),
  forecast_payload JSONB NOT NULL,
  forecast_hash TEXT NOT NULL CHECK (forecast_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sport, game_id, version),
  CHECK (data_cutoff <= predicted_at AND predicted_at < event_start)
);
CREATE INDEX IF NOT EXISTS v4_forecast_latest_idx
  ON v4_forecast_versions (sport, game_id, predicted_at DESC);

COMMIT;