import { describe, expect, it } from "vitest";
import {
  CandidateExecutorRegistry, canonicalExecutionHash, type CandidateExecutor,
} from "./executorRegistry";
import {
  ncaafCandidateExecutor, toDryRunModelPredictionBridge,
  buildNcaafModelPredictionBridge, type MaterializedNcaafCandidateInput,
} from "./ncaafCandidateExecutor";
import { getCurrentNcaafCandidateIdentity } from "./candidateRegistry";
import { ncaafV42026InputChecksum } from "../ncaafV42026FeatureBridge";
import { pool } from "@workspace/db";

const identity = {
  sport: "NCAAF" as const, modelFamily: "fixture", modelId: "fixture",
  modelVersion: "1", artifactId: "fixture-1", artifactHash: "a".repeat(64),
  inputContractVersion: "fixture-v1",
  supportedMarkets: { moneyline: "EXECUTOR_SUPPORTED" as const },
};
const fixtureExecutor: CandidateExecutor = {
  identity, reproducibility: {
    deterministic: true, comparison: "EXACT_CANONICAL_OUTPUT_HASH", tolerance: 0, runtime: "fixture",
  },
  async health() { return { status: "HEALTHY", reproducibilityReady: true, reason: "fixture", checkedAt: new Date(0).toISOString() }; },
  validateInput() {
    return { snapshotId: "1", inputHash: "x", featureCutoff: new Date(0).toISOString(),
      materializedAt: new Date(0).toISOString(), pitSafe: true, leakageSafe: true,
      fresh: true, complete: true, reasons: [] };
  },
  async execute(input) {
    return { output: input, outputHash: canonicalExecutionHash(input), executedAt: new Date(0).toISOString(),
      evidence: this.validateInput(input) };
  },
  validateOutput() {},
};

describe("Task235 exact candidate executor registry", () => {
  it("resolves only every exact immutable identity field and direct market support", () => {
    const registry = new CandidateExecutorRegistry();
    registry.register(fixtureExecutor);
    expect(registry.resolve({ ...identity, market: "moneyline" })).toBe(fixtureExecutor);
    expect(registry.resolve({ ...identity, market: "moneyline", artifactHash: "b".repeat(64) })).toBeNull();
    expect(registry.resolve({ ...identity, market: "spread" })).toBeNull();
    expect(registry.resolve({ ...identity, market: "moneyline", inputContractVersion: "wrong" })).toBeNull();
  });

  it("rejects duplicate exact registrations", () => {
    const registry = new CandidateExecutorRegistry();
    registry.register(fixtureExecutor);
    expect(() => registry.register(fixtureExecutor)).toThrow(/Duplicate exact candidate executor/);
  });
});

describe("Task235 candidate execution audit immutability", () => {
  it("rejects UPDATE and DELETE for the candidate execution ledger", async () => {
    const client = await pool.connect();
    const executionId = `task235-guard-${Date.now()}`;
    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO candidate_execution_audits (
          execution_id, dry_run, sport, game_id, market, model_family, model_id, model_version,
          artifact_id, artifact_hash, input_contract_version, input_snapshot_id, input_hash,
          feature_cutoff, materialized_at, executed_at, raw_output, output_hash, second_output_hash,
          reproducible, executor_health, pit_safe, leakage_safe, resolver_reason, publication_disposition, evidence
        ) VALUES ($1, true, 'NCAAF', 'guard-fixture', 'moneyline', 'fixture', 'fixture', '1',
          'fixture', 'fixture', 'fixture', 'fixture', 'fixture', now(), now(), now(), '{}'::jsonb,
          'fixture', 'fixture', true, 'HEALTHY', true, true, 'FIXTURE', 'NONPUBLISHING', '{}'::jsonb)`,
      [executionId]);
      await client.query("SAVEPOINT mutation_test");
      await expect(client.query("UPDATE candidate_execution_audits SET model_id = 'changed' WHERE execution_id = $1", [executionId])).rejects.toThrow(/append-only/i);
      await client.query("ROLLBACK TO SAVEPOINT mutation_test");
      await client.query("SAVEPOINT deletion_test");
      await expect(client.query("DELETE FROM candidate_execution_audits WHERE execution_id = $1", [executionId])).rejects.toThrow(/append-only/i);
      await client.query("ROLLBACK TO SAVEPOINT deletion_test");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});

describe("Task235 authentic NCAAF executor", () => {
  const features: any = {
    home: { seasonToDate: { games: 3, offensePointsPerGame: 30, defensePointsAllowedPerGame: 20 }, priorSeason: { offensePointsPerGame: 28, defensePointsAllowedPerGame: 23 } },
    away: { seasonToDate: { games: 3, offensePointsPerGame: 24, defensePointsAllowedPerGame: 25 }, priorSeason: { offensePointsPerGame: 25, defensePointsAllowedPerGame: 26 } },
    elo: { difference: 50 }, context: { homeField: true },
  };
  const input: MaterializedNcaafCandidateInput = {
    snapshotId: "snapshot-1", materializedAt: "2026-09-06T12:00:00.000Z",
    input: {
      stableGameId: "espn:123", season: 2026, week: 2,
      kickoffAt: "2026-09-06T17:00:00.000Z", featureCutoff: "2026-09-06T12:00:00.000Z",
      features, checksum: ncaafV42026InputChecksum("a".repeat(64), "2026-09-06T12:00:00.000Z"),
      sourceAudit: {
        featureFreeze: "replayNcaafChronologically_before_targets", targetResultUsed: false,
        replayRowChecksum: "a".repeat(64), snapshotId: "snapshot-1", targetProvider: "espn",
        targetEventId: "123", snapshotKickoffAt: "2026-09-06T17:00:00.000Z",
        snapshotDataCutoffAt: "2026-09-06T12:00:00.000Z",
      },
    },
  };
  const now = new Date("2026-09-06T13:00:00.000Z");

  it("matches frozen identity, executes twice exactly, and creates a non-persisted bridge", async () => {
    const expected = getCurrentNcaafCandidateIdentity();
    expect(ncaafCandidateExecutor.identity).toMatchObject({
      modelId: expected.modelId, modelVersion: expected.modelVersion,
      artifactHash: expected.artifactHash, inputContractVersion: expected.inputContractVersion,
    });
    const first = await ncaafCandidateExecutor.execute(input, now);
    const second = await ncaafCandidateExecutor.execute(input, now);
    expect(first.outputHash).toBe(second.outputHash);
    expect(first.evidence).toMatchObject({ pitSafe: true, leakageSafe: true, complete: true, fresh: true });
    expect(first.output.configurationHash).toBe(expected.configurationHash);
    expect(toDryRunModelPredictionBridge(first.output, "snapshot-1", now.toISOString())).toMatchObject({
      persisted: false, persistenceReady: false, sport: "NCAAF", market: "moneyline",
    });
  });

  it("rejects malformed checksums, post-cutoff targets, and market leakage", async () => {
    await expect(ncaafCandidateExecutor.execute({
      ...input, input: { ...input.input, checksum: "old-shadow", kickoffAt: input.input.featureCutoff },
    }, now)).rejects.toThrow(/input rejected/);
    await expect(ncaafCandidateExecutor.execute({
      ...input, input: { ...input.input, features: { ...features, odds: -110 } },
    }, now)).rejects.toThrow(/input rejected/);
  });

  it("does not treat caller-supplied downstream fixture values as authentic evidence", async () => {
    const output = (await ncaafCandidateExecutor.execute(input, now)).output;
    expect(buildNcaafModelPredictionBridge(output, "snapshot-1", now.toISOString()).persistenceReady).toBe(false);
    expect(buildNcaafModelPredictionBridge(output, "snapshot-1", now.toISOString(), {
      modelVersionId: 1, odds: -110, impliedProbability: .524, edge: .03,
      confidence: "Medium", recommendation: "Neutral", units: 1, podScore: 1, finalRating: 50,
    })).toMatchObject({ persisted: false, persistenceReady: false });
  });
});