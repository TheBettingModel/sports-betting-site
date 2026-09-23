export const GUARDED_SERVING_APPEND_ONLY_TABLES = [
  "model_artifact_approval_ledger",
  "guarded_serving_audits",
  "candidate_execution_audits",
  "official_prediction_identity",
  "official_prediction_lifecycle",
  "model_review_policies",
] as const;

export const GUARDED_SERVING_APPEND_ONLY_SQL = `
CREATE OR REPLACE FUNCTION prevent_guarded_serving_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Guarded serving ledger is append-only: % on % is prohibited', TG_OP, TG_TABLE_NAME;
END; $$;
DO $$
DECLARE table_name text; row_trigger text; truncate_trigger text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[${GUARDED_SERVING_APPEND_ONLY_TABLES.map((name) => `'${name}'`).join(",")}]
  LOOP
    row_trigger := table_name || '_block_row_mutation';
    truncate_trigger := table_name || '_block_truncate';
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', row_trigger, table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_guarded_serving_mutation()', row_trigger, table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', truncate_trigger, table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION prevent_guarded_serving_mutation()', truncate_trigger, table_name);
  END LOOP;
END; $$;`;