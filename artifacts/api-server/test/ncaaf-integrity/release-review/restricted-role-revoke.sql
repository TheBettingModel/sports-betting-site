-- REVIEW TEMPLATE ONLY. Separately approve execution on the verified target.
-- End the operator's connections first; never terminate the API/cron sessions.
BEGIN;
ALTER ROLE tbm_ncaaf_integrity_repair NOLOGIN;
REVOKE UPDATE (status, home_score, away_score, updated_at)
  ON public.games FROM tbm_ncaaf_integrity_repair;
REVOKE UPDATE (home_score, away_score, home_team_won, raw_result_json, updated_at)
  ON public.game_results FROM tbm_ncaaf_integrity_repair;
REVOKE INSERT (game_id, home_score, away_score, home_team_won,
  grading_source, status_detail, raw_result_json)
  ON public.game_results FROM tbm_ncaaf_integrity_repair;
REVOKE ALL ON public.games, public.game_results FROM tbm_ncaaf_integrity_repair;
REVOKE ALL ON SEQUENCE public.game_results_id_seq FROM tbm_ncaaf_integrity_repair;
REVOKE ALL ON SCHEMA public FROM tbm_ncaaf_integrity_repair;
REVOKE CONNECT ON DATABASE neondb FROM tbm_ncaaf_integrity_repair;
COMMIT;
-- PUBLIC privileges can still exist; NOLOGIN plus revoked direct grants is
-- not a claim that active sessions or PUBLIC privileges have been revoked.
