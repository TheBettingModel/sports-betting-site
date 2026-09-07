BEGIN;

CREATE TABLE IF NOT EXISTS v4_model_artifacts (
  id BIGSERIAL PRIMARY KEY,
  sport TEXT NOT NULL CHECK (sport IN ('MLB','NCAAF','NFL','NBA','WNBA','NHL','SOCCER','UFC','NCAAMB')),
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  artifact_hash TEXT NOT NULL CHECK (artifact_hash ~ '^[0-9a-f]{64}$'),
  contract_id TEXT NOT NULL,
  contract_hash TEXT NOT NULL CHECK (contract_hash ~ '^[0-9a-f]{64}$'),
  approval_state TEXT NOT NULL CHECK (approval_state IN ('UNVALIDATED','SHADOW','PROVISIONAL','PRODUCTION_APPROVED','SUSPENDED')),
  maturity TEXT NOT NULL CHECK (maturity IN ('EXPERIMENTAL','DEVELOPING','VALIDATED','MATURE')),
  publication_permitted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  replacement_artifact_hash TEXT,
  UNIQUE (sport, model_id, model_version, artifact_hash, contract_hash),
  CHECK (NOT publication_permitted OR approval_state = 'PRODUCTION_APPROVED')
);

CREATE UNIQUE INDEX IF NOT EXISTS v4_one_active_production_artifact_per_sport
  ON v4_model_artifacts (sport)
  WHERE approval_state = 'PRODUCTION_APPROVED' AND retired_at IS NULL;

CREATE TABLE IF NOT EXISTS v4_evidence_snapshots (
  id BIGSERIAL PRIMARY KEY,
  sport TEXT NOT NULL,
  game_id TEXT NOT NULL,
  feature_snapshot_id TEXT NOT NULL,
  feature_hash TEXT NOT NULL CHECK (feature_hash ~ '^[0-9a-f]{64}$'),
  contract_id TEXT NOT NULL,
  contract_hash TEXT NOT NULL CHECK (contract_hash ~ '^[0-9a-f]{64}$'),
  source_manifest JSONB NOT NULL,
  evidence_payload JSONB NOT NULL,
  data_cutoff TIMESTAMPTZ NOT NULL,
  materialized_at TIMESTAMPTZ NOT NULL,
  event_start TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sport, feature_snapshot_id, feature_hash),
  CHECK (data_cutoff <= materialized_at AND materialized_at < event_start)
);

CREATE TABLE IF NOT EXISTS v4_forecasts (
  id BIGSERIAL PRIMARY KEY,
  prediction_id TEXT NOT NULL UNIQUE,
  sport TEXT NOT NULL,
  game_id TEXT NOT NULL,
  artifact_id BIGINT NOT NULL REFERENCES v4_model_artifacts(id),
  evidence_snapshot_id BIGINT NOT NULL REFERENCES v4_evidence_snapshots(id),
  forecast_payload JSONB NOT NULL,
  data_cutoff TIMESTAMPTZ NOT NULL,
  predicted_at TIMESTAMPTZ NOT NULL,
  event_start TIMESTAMPTZ NOT NULL,
  publication_state TEXT NOT NULL DEFAULT 'NOT_ELIGIBLE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sport, game_id, artifact_id, evidence_snapshot_id),
  CHECK (data_cutoff <= predicted_at AND predicted_at < event_start)
);

CREATE INDEX IF NOT EXISTS v4_forecasts_game_idx ON v4_forecasts (sport, game_id);
CREATE INDEX IF NOT EXISTS v4_forecasts_prediction_time_idx ON v4_forecasts (predicted_at);

CREATE TABLE IF NOT EXISTS v4_engine_runs (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  scheduler_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('SHADOW','PRODUCTION')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  sport_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  forecasts_created INTEGER NOT NULL DEFAULT 0,
  picks_published INTEGER NOT NULL DEFAULT 0,
  results_graded INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED'))
);

COMMIT;