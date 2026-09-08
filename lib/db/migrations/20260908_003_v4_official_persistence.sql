BEGIN;

ALTER TABLE v4_forecast_versions
  ADD COLUMN IF NOT EXISTS model_family TEXT,
  ADD COLUMN IF NOT EXISTS artifact_id TEXT,
  ADD COLUMN IF NOT EXISTS input_contract_version TEXT,
  ADD COLUMN IF NOT EXISTS input_hash TEXT,
  ADD COLUMN IF NOT EXISTS configuration_hash TEXT,
  ADD COLUMN IF NOT EXISTS parameter_hash TEXT;

CREATE TABLE IF NOT EXISTS v4_market_evidence (
  id BIGSERIAL PRIMARY KEY, evidence_id TEXT NOT NULL UNIQUE, sport TEXT NOT NULL,
  game_id TEXT NOT NULL, market TEXT NOT NULL, selection TEXT NOT NULL, line REAL,
  odds INTEGER NOT NULL, fair_probability REAL NOT NULL CHECK (fair_probability BETWEEN 0 AND 1),
  sportsbook TEXT NOT NULL, source TEXT NOT NULL, captured_at TIMESTAMPTZ NOT NULL,
  snapshot_id TEXT NOT NULL, provider_identity TEXT NOT NULL, event_start TIMESTAMPTZ NOT NULL,
  payload_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, selection), CHECK (captured_at < event_start)
);
CREATE INDEX IF NOT EXISTS v4_market_evidence_game_idx ON v4_market_evidence (sport, game_id, captured_at);

CREATE TABLE IF NOT EXISTS v4_artifact_model_version_mappings (
  id BIGSERIAL PRIMARY KEY, sport TEXT NOT NULL, market TEXT NOT NULL, model_family TEXT NOT NULL,
  model_id TEXT NOT NULL, model_version TEXT NOT NULL, artifact_id TEXT NOT NULL,
  artifact_hash TEXT NOT NULL, input_contract_version TEXT NOT NULL, configuration_hash TEXT NOT NULL,
  parameter_hash TEXT NOT NULL, model_version_id INTEGER NOT NULL REFERENCES model_versions(id),
  governed_by TEXT NOT NULL, evidence_reference TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sport, market, model_family, model_id, model_version, artifact_id, artifact_hash,
          input_contract_version, configuration_hash, parameter_hash),
  UNIQUE (model_version_id)
);

DROP INDEX IF EXISTS model_predictions_original_identity_unique;
CREATE UNIQUE INDEX model_predictions_original_identity_unique
  ON model_predictions (game_id, model_version_id, market)
  WHERE policy_revision_id IS NULL AND cohort IS DISTINCT FROM 'official';

CREATE TABLE IF NOT EXISTS v4_official_decision_revisions (
  id BIGSERIAL PRIMARY KEY,
  forecast_prediction_id TEXT NOT NULL,
  forecast_version INTEGER NOT NULL,
  market_evidence_id TEXT NOT NULL,
  market_evidence_hash TEXT NOT NULL,
  model_prediction_id INTEGER NOT NULL REFERENCES model_predictions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (forecast_prediction_id, forecast_version, market_evidence_id, market_evidence_hash),
  UNIQUE (model_prediction_id)
);

COMMIT;