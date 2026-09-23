export const MLB_HISTORICAL_APPEND_ONLY_TABLES = [
  "mlb_historical_artifacts",
  "mlb_historical_games",
  "mlb_historical_team_identity",
  "mlb_historical_team_game_rows",
  "mlb_historical_outcomes",
  "mlb_historical_completion_evidence",
  "mlb_historical_raw_completion_snapshots",
  "mlb_historical_chronology_decisions",
  "mlb_historical_exclusions",
  "mlb_historical_splits",
  "mlb_historical_raw_boxscore_snapshots",
  "mlb_historical_pitcher_identities",
  "mlb_historical_pitcher_appearances",
  "mlb_historical_bullpen_outcomes",
  "mlb_historical_pregame_pitcher_snapshots",
  "mlb_historical_pregame_bullpen_snapshots",
  "mlb_historical_pitching_eligibility",
  "mlb_historical_training_manifests",
  "mlb_historical_model_artifacts",
  "mlb_historical_pre_oos_locks",
  "mlb_historical_expected_runs_forecasts",
  "mlb_historical_evaluation_runs",
  "mlb_pregame_starter_evidence_snapshots",
  "mlb_research_experiment_disposition_ledger",
  "mlb_v4_collection_runs",
  "mlb_v4_collection_run_events",
  "mlb_v4_game_discoveries",
  "mlb_v4_starter_pit_states",
  "mlb_v4_team_pit_states",
  "mlb_v4_context_states",
  "mlb_v4_pregame_feature_snapshots",
  "mlb_v4_game_outcomes",
  "mlb_v4_starter_outcomes",
  "mlb_v4_bullpen_outcomes",
  "mlb_v4_evidence_pairs",
  "mlb_v4_shadow_forecasts",
  "mlb_v4_market_snapshots",
  "mlb_v4_forecast_evaluations",
  "mlb_v4_model_registry",
] as const;

export const MLB_HISTORICAL_APPEND_ONLY_SQL = `
CREATE OR REPLACE FUNCTION prevent_mlb_historical_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'MLB historical foundation is append-only: % on % is prohibited', TG_OP, TG_TABLE_NAME;
END;
$$;

DO $$
DECLARE
  table_name text;
  row_trigger text;
  truncate_trigger text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'mlb_historical_artifacts',
    'mlb_historical_games',
    'mlb_historical_team_identity',
    'mlb_historical_team_game_rows',
    'mlb_historical_outcomes',
    'mlb_historical_completion_evidence',
    'mlb_historical_raw_completion_snapshots',
    'mlb_historical_chronology_decisions',
    'mlb_historical_exclusions',
    'mlb_historical_splits',
    'mlb_historical_raw_boxscore_snapshots',
    'mlb_historical_pitcher_identities',
    'mlb_historical_pitcher_appearances',
    'mlb_historical_bullpen_outcomes',
    'mlb_historical_pregame_pitcher_snapshots',
    'mlb_historical_pregame_bullpen_snapshots',
    'mlb_historical_pitching_eligibility',
    'mlb_historical_training_manifests',
    'mlb_historical_model_artifacts',
    'mlb_historical_pre_oos_locks',
    'mlb_historical_expected_runs_forecasts',
    'mlb_historical_evaluation_runs'
    ,'mlb_pregame_starter_evidence_snapshots'
    ,'mlb_research_experiment_disposition_ledger'
    ,'mlb_v4_collection_runs'
    ,'mlb_v4_collection_run_events'
    ,'mlb_v4_game_discoveries'
    ,'mlb_v4_starter_pit_states'
    ,'mlb_v4_team_pit_states'
    ,'mlb_v4_context_states'
    ,'mlb_v4_pregame_feature_snapshots'
    ,'mlb_v4_game_outcomes'
    ,'mlb_v4_starter_outcomes'
    ,'mlb_v4_bullpen_outcomes'
    ,'mlb_v4_evidence_pairs'
    ,'mlb_v4_shadow_forecasts'
    ,'mlb_v4_market_snapshots'
    ,'mlb_v4_forecast_evaluations'
    ,'mlb_v4_model_registry'
  ]
  LOOP
    row_trigger := table_name || '_block_row_mutation';
    truncate_trigger := table_name || '_block_truncate';
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', row_trigger, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_mlb_historical_mutation()',
      row_trigger,
      table_name
    );
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', truncate_trigger, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION prevent_mlb_historical_mutation()',
      truncate_trigger,
      table_name
    );
  END LOOP;
END;
$$;
`;