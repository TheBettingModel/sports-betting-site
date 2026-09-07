import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { GUARDED_SERVING_APPEND_ONLY_TABLES } from "../src/services/guardedServing/appendOnlyGuards";

if (process.env.NODE_ENV === "production") {
  throw new Error("Guarded-serving mutation fixtures may run only in a non-production environment");
}

type MutationKind = "UPDATE" | "DELETE" | "TRUNCATE";
type Verification = Readonly<{ table: string; operation: MutationKind; rejected: true }>;

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

async function main(): Promise<void> {
  const client = await pool.connect();
  const fixture = randomUUID();
  const verifications: Verification[] = [];
  try {
    await client.query("BEGIN");
    const [{ id: modelVersionId }] = (await client.query<{ id: number }>(
      "SELECT id FROM model_versions ORDER BY id LIMIT 1",
    )).rows;
    if (!modelVersionId) throw new Error("Mutation verification requires one model_versions reference row");

    const gameId = `guarded-mutation-${fixture}`;
    await client.query(
      `INSERT INTO games (
        id, sport, home_team_abbr, home_team_name, home_team_record,
        away_team_abbr, away_team_name, away_team_record, game_time, game_date
      ) VALUES ($1, 'TEST', 'HME', 'Home Fixture', '0-0', 'AWY', 'Away Fixture', '0-0', '12:00', CURRENT_DATE)`,
      [gameId],
    );
    const [{ id: predictionId }] = (await client.query<{ id: number }>(
      `INSERT INTO model_predictions (
        game_id, model_version_id, sport, market, selection, model_probability,
        edge, confidence, recommendation, units, feature_snapshot,
        prediction_timestamp, data_cutoff_timestamp, is_challenger, cohort
      ) VALUES ($1, $2, 'TEST', 'mutation-test', 'home', 0.5, 0, 'Low',
        'Neutral', 0, '{}'::jsonb, now(), now(), true, 'shadow') RETURNING id`,
      [gameId, modelVersionId],
    )).rows;

    const fixtureIds = new Map<string, number>();
    fixtureIds.set("model_artifact_approval_ledger", (await client.query<{ id: number }>(
      `INSERT INTO model_artifact_approval_ledger (
        event_id, sport, market, model_family, model_id, model_version,
        artifact_id, artifact_hash, input_contract_version, approval_state,
        governed_actor, reason, evidence_reference, decided_at
      ) VALUES ($1, 'TEST', 'mutation-test', 'fixture', 'fixture', 'fixture',
        'fixture', 'fixture', 'fixture', 'UNVALIDATED', 'verification',
        'transactional mutation verification', 'transaction-only', now()) RETURNING id`,
      [`approval-${fixture}`],
    )).rows[0]!.id);
    fixtureIds.set("guarded_serving_audits", (await client.query<{ id: number }>(
      `INSERT INTO guarded_serving_audits (
        audit_id, dry_run, sport, game_id, market, configured_mode,
        candidate_model_id, candidate_version, candidate_artifact_hash,
        candidate_approval_state, resolution, reason, fallback_used,
        input_version, runtime_health, publication_disposition, evidence, resolved_at
      ) VALUES ($1, true, 'TEST', $2, 'mutation-test', 'disabled', 'fixture',
        'fixture', 'fixture', 'UNVALIDATED', 'PASS', 'transactional fixture',
        false, 'fixture', 'HEALTHY', 'SUPPRESSED', '{}'::jsonb, now()) RETURNING id`,
      [`audit-${fixture}`, gameId],
    )).rows[0]!.id);
    fixtureIds.set("candidate_execution_audits", (await client.query<{ id: number }>(
      `INSERT INTO candidate_execution_audits (
        execution_id, dry_run, sport, game_id, market, model_family, model_id,
        model_version, artifact_id, artifact_hash, input_contract_version,
        input_snapshot_id, input_hash, feature_cutoff, materialized_at, executed_at,
        raw_output, output_hash, second_output_hash, reproducible, executor_health,
        pit_safe, leakage_safe, resolver_reason, publication_disposition, evidence
      ) VALUES ($1, true, 'TEST', $2, 'mutation-test', 'fixture', 'fixture',
        'fixture', 'fixture', 'fixture', 'fixture', 'fixture', 'fixture',
        now(), now(), now(), '{}'::jsonb, 'fixture', 'fixture', true, 'HEALTHY',
        true, true, 'transactional fixture', 'SUPPRESSED', '{}'::jsonb) RETURNING id`,
      [`execution-${fixture}`, gameId],
    )).rows[0]!.id);
    const identityId = (await client.query<{ id: number }>(
      `INSERT INTO official_prediction_identity (
        prediction_id, sport, game_id, market, selection, engine, model_family,
        model_version, artifact_id, input_version, serving_mode,
        approval_status_at_prediction, model_probability, edge, confidence,
        recommendation, units, fallback_used, publication_status, prediction_timestamp
      ) VALUES ($1, 'TEST', $2, 'mutation-test', 'home', 'fixture', 'fixture',
        'fixture', 'fixture', 'fixture', 'disabled', 'UNVALIDATED', 0.5, 0,
        'Low', 'Neutral', 0, false, 'SUPPRESSED', now()) RETURNING id`,
      [predictionId, gameId],
    )).rows[0]!.id;
    fixtureIds.set("official_prediction_identity", identityId);
    fixtureIds.set("official_prediction_lifecycle", (await client.query<{ id: number }>(
      `INSERT INTO official_prediction_lifecycle (
        event_id, official_identity_id, state, reason, actor, evidence_reference, occurred_at
      ) VALUES ($1, $2, 'SUPPRESSED', 'transactional fixture', 'verification',
        'transaction-only', now()) RETURNING id`,
      [`lifecycle-${fixture}`, identityId],
    )).rows[0]!.id);
    fixtureIds.set("model_review_policies", (await client.query<{ id: number }>(
      `INSERT INTO model_review_policies (
        policy_id, sport, version, minimum_graded_sample, minimum_prospective_sample,
        minimum_team_diversity, minimum_opponent_diversity, minimum_observation_days,
        calibration_required, clv_required, pit_required, leakage_audit_required,
        runtime_health_required, market_requirements, governed_actor, reason, effective_at
      ) VALUES ($1, $2, 1, 1, 1, 1, 1, 1, true, true, true, true, true,
        '{}'::jsonb, 'verification', 'transactional fixture', now()) RETURNING id`,
      [`policy-${fixture}`, `TEST-${fixture}`],
    )).rows[0]!.id);

    let sequence = 0;
    for (const table of GUARDED_SERVING_APPEND_ONLY_TABLES) {
      const id = fixtureIds.get(table);
      if (!id) throw new Error(`Missing mutation fixture for ${table}`);
      for (const operation of ["UPDATE", "DELETE", "TRUNCATE"] as const) {
        const savepoint = `mutation_check_${sequence++}`;
        await client.query(`SAVEPOINT ${savepoint}`);
        const statement = operation === "UPDATE"
          ? `UPDATE ${quoteIdentifier(table)} SET id = id WHERE id = $1`
          : operation === "DELETE"
            ? `DELETE FROM ${quoteIdentifier(table)} WHERE id = $1`
            : `TRUNCATE TABLE ${quoteIdentifier(table)} CASCADE`;
        try {
          await client.query(statement, operation === "TRUNCATE" ? [] : [id]);
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          throw new Error(`${operation} unexpectedly succeeded on ${table}`);
        } catch (error) {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes("Guarded serving ledger is append-only")) throw error;
          verifications.push({ table, operation, rejected: true });
        } finally {
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        }
      }
    }
    await client.query("ROLLBACK");

    const cleanup = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM games WHERE id = $1",
      [gameId],
    );
    if (cleanup.rows[0]?.count !== 0) throw new Error("Transactional mutation fixture was not rolled back");
    console.log(JSON.stringify({
      environment: "NON_PRODUCTION",
      tables: GUARDED_SERVING_APPEND_ONLY_TABLES.length,
      checks: verifications.length,
      allRejected: verifications.length === GUARDED_SERVING_APPEND_ONLY_TABLES.length * 3,
      fixtureRolledBack: true,
      verifications,
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();