export const MLB_HISTORICAL_APPEND_ONLY_TABLES = [
  "mlb_historical_artifacts",
  "mlb_historical_games",
  "mlb_historical_team_identity",
  "mlb_historical_team_game_rows",
  "mlb_historical_outcomes",
  "mlb_historical_exclusions",
  "mlb_historical_splits",
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
    'mlb_historical_exclusions',
    'mlb_historical_splits'
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