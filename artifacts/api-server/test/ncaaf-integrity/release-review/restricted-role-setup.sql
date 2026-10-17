-- REVIEW TEMPLATE ONLY. Never loaded by application startup or an apply CLI.
-- Requires separate authorization and verified Neon host/branch binding.
-- No password/token is embedded. Provision secure authentication separately.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'UNAPPROVED_DATABASE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='tbm_ncaaf_integrity_repair') THEN
    RAISE EXCEPTION 'REPAIR_ROLE_ALREADY_EXISTS_REVIEW_REQUIRED';
  END IF;
END
$guard$;
CREATE ROLE tbm_ncaaf_integrity_repair LOGIN NOINHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2 PASSWORD NULL;
GRANT CONNECT ON DATABASE neondb TO tbm_ncaaf_integrity_repair;
GRANT USAGE ON SCHEMA public TO tbm_ncaaf_integrity_repair;
GRANT SELECT ON public.games, public.game_results TO tbm_ncaaf_integrity_repair;
GRANT UPDATE (status, home_score, away_score, updated_at)
  ON public.games TO tbm_ncaaf_integrity_repair;
GRANT UPDATE (home_score, away_score, home_team_won, raw_result_json, updated_at)
  ON public.game_results TO tbm_ncaaf_integrity_repair;
GRANT INSERT (game_id, home_score, away_score, home_team_won,
  grading_source, status_detail, raw_result_json)
  ON public.game_results TO tbm_ncaaf_integrity_repair;
GRANT USAGE ON SEQUENCE public.game_results_id_seq TO tbm_ncaaf_integrity_repair;
ALTER ROLE tbm_ncaaf_integrity_repair SET statement_timeout='30s';
ALTER ROLE tbm_ncaaf_integrity_repair SET lock_timeout='5s';
ALTER ROLE tbm_ncaaf_integrity_repair SET idle_in_transaction_session_timeout='30s';
DO $privileges$
BEGIN
  IF has_schema_privilege('tbm_ncaaf_integrity_repair','public','CREATE')
    OR has_database_privilege('tbm_ncaaf_integrity_repair',current_database(),'CREATE')
    OR EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
      AND c.relname NOT IN ('games','game_results')
      AND (has_table_privilege('tbm_ncaaf_integrity_repair',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
        OR has_any_column_privilege('tbm_ncaaf_integrity_repair',c.oid,'INSERT,UPDATE'))
    ) THEN
    RAISE EXCEPTION 'UNEXPECTED_PUBLIC_OR_SCHEMA_PRIVILEGES';
  END IF;
END
$privileges$;
COMMIT;
-- This is column-restricted, NOT database-enforced NCAA row isolation.
-- Executor sport/identity/manifest guards enforce the approved NCAA inventory.
-- Do not grant this role to another role. Revoke it after the controlled operation.
