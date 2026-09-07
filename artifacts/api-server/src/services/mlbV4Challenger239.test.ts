import { describe, expect, it } from "vitest";
import {
  MLB_239_CANDIDATE_FAMILIES,
  MLB_239_CURRENT_CHAMPION,
  MLB_239_OUTPUT_VERSION,
  InMemoryMlb239ShadowStore,
  assertMarketFree239,
  buildMlb239Readiness,
  buildMlb239RunOutput,
  compareMlb239ToMarket,
  createDeterministicTrainingConfiguration,
  evaluateMlb239Calibration,
  evaluateMlb239Pairs,
  freezeExpectedRunsArtifact,
  pairMlb239FinalOutcome,
  validateExactLiveExecutor239,
  type GateApprovedDataset,
} from "./mlbV4Challenger239";
import { stableLocalHash, type ExpectedRunsModel } from "./mlbV4ExpectedRuns";

const hash = (value: string) => stableLocalHash(value);
const dataset: GateApprovedDataset = {
  datasetId: "dataset-239", datasetHash: hash("dataset"),
  inputContractVersion: "mlb-input-v1", sport: "MLB", approved: true,
  approvalId: "approval-239", approvedAt: "2026-01-01T00:00:00.000Z",
  chronology: "POINT_IN_TIME", marketFree: true,
};
const model: ExpectedRunsModel = {
  modelFamily: "poisson",
  featureSchema: { ownOffense: ["runs"], leagueEnvironment: ["runs"], opponentBullpen: ["era"] },
  transform: {
    featureNames: ["ownOffense.runs", "leagueEnvironment.runs", "opponentBullpen.era"],
    medians: [4.5, 4.5, 4.2], means: [4.5, 4.5, 4.2], standardDeviations: [1, 1, 1],
  },
  coefficients: [.1, .2, -.1], intercept: 1.5, regularization: 1,
  alpha: null, trainingRows: 100, iterations: 4, converged: true, objective: "test fixture",
};

function fixture() {
  const configuration = createDeterministicTrainingConfiguration({
    dataset,
    cohort: {
      training: { start: "2023-01-01T00:00:00Z", end: "2024-01-01T00:00:00Z" },
      validation: { start: "2024-01-01T00:00:00Z", end: "2025-01-01T00:00:00Z" },
      historicalBenchmarkOnly: {
        start: "2025-01-01T00:00:00Z",
        end: "2026-01-01T00:00:00Z",
      },
    },
    orderedGameIds: ["1", "2"],
  });
  const artifact = freezeExpectedRunsArtifact({
    artifactId: "artifact-239", modelId: "tbm-mlb-moneyline-v4-239",
    modelVersion: "239.1", datasetHash: dataset.datasetHash,
    configurationHash: configuration.configurationHash, model,
  });
  const forecast = buildMlb239RunOutput({
    gameId: "game-1", featureSnapshotId: "snapshot-1", featureHash: hash("features"),
    generatedAt: "2026-04-01T12:00:00.000Z", homeExpectedRuns: 4.8,
    awayExpectedRuns: 4.1, artifact, distribution: { kind: "poisson" },
    featurePayload: { ownOffense: { runs: 4.8 } },
  });
  return { configuration, artifact, forecast };
}

describe("Task 239 deterministic non-production challenger framework", () => {
  it("predeclares the full bounded candidate family and deterministic cohort", () => {
    expect(MLB_239_CANDIDATE_FAMILIES.map((candidate) => candidate.family))
      .toEqual(["ridge-linear", "poisson", "nb2"]);
    const a = fixture().configuration;
    const b = fixture().configuration;
    expect(a).toEqual(b);
    expect(a.configurationHash).toHaveLength(64);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it("refuses training configuration without authentic gate approval", () => {
    expect(() => createDeterministicTrainingConfiguration({
      dataset: { ...dataset, approved: false } as unknown as GateApprovedDataset,
      cohort: {
        training: { start: "2023-01-01", end: "2024-01-01" },
        validation: { start: "2024-01-01", end: "2025-01-01" },
        historicalBenchmarkOnly: { start: "2025-01-01", end: "2026-01-01" },
      },
      orderedGameIds: ["1"],
    })).toThrow(/gate-approved/);
  });

  it("freezes normalization, parameters, and complete artifact hashes", () => {
    const { artifact } = fixture();
    expect(artifact.normalization.normalizationHash).toHaveLength(64);
    expect(artifact.parameterHash).toHaveLength(64);
    expect(artifact.artifactHash).toHaveLength(64);
    expect(Object.isFrozen(artifact.model.transform.medians)).toBe(true);
  });

  it("uses the expected-runs count convolution and explicit tie formula deterministically", () => {
    const { forecast } = fixture();
    expect(forecast.schemaVersion).toBe(MLB_239_OUTPUT_VERSION);
    expect(forecast.homeWinProbability + forecast.awayWinProbability).toBeCloseTo(1, 12);
    expect(forecast.distributionFormula).toBe("P(H>A)+0.5*P(H=A)");
    expect(forecast.projectedTotalExact).toBeCloseTo(8.9, 12);
    expect(forecast.officialUnits).toBe(0);
    expect(forecast.publicationStatus).toBe("NOT_PUBLISHABLE");
    expect(forecast).toEqual(fixture().forecast);
  });

  it("rejects market fields at any feature depth", () => {
    expect(() => assertMarketFree239({ offense: { consensusOdds: -110 } }))
      .toThrow(/Market field forbidden/);
    expect(() => buildMlb239RunOutput({
      gameId: "x", featureSnapshotId: "x", featureHash: hash("x"),
      generatedAt: "2026-01-01T00:00:00Z", homeExpectedRuns: 4,
      awayExpectedRuns: 4, artifact: fixture().artifact,
      distribution: { kind: "poisson" }, featurePayload: { market: {} },
    })).toThrow(/Market field forbidden/);
  });

  it("requires exact live executor identity without tolerant matching", () => {
    const { artifact } = fixture();
    const identity = {
      sport: "MLB" as const, modelId: artifact.modelId, modelVersion: artifact.modelVersion,
      artifactId: artifact.artifactId, artifactHash: artifact.artifactHash,
      configurationHash: artifact.configurationHash,
      normalizationHash: artifact.normalization.normalizationHash,
      parameterHash: artifact.parameterHash, outputSchemaVersion: MLB_239_OUTPUT_VERSION,
    } as const;
    expect(validateExactLiveExecutor239(identity, artifact)).toBe(true);
    expect(() => validateExactLiveExecutor239({ ...identity, parameterHash: hash("other") }, artifact))
      .toThrow(/exactly match/);
  });

  it("stores immutable records idempotently and rejects semantic conflicts", () => {
    const { forecast } = fixture();
    const store = new InMemoryMlb239ShadowStore();
    const first = store.append(forecast, "2026-04-01T12:01:00Z");
    const second = store.append(forecast, "2026-04-01T12:02:00Z");
    expect(second).toBe(first);
    expect(store.list()).toHaveLength(1);
    expect(Object.isFrozen(first.forecast)).toBe(true);
    const conflicting = { ...forecast, forecastHash: hash("conflict") };
    expect(() => store.append(conflicting, "2026-04-01T12:03:00Z")).toThrow();
  });

  it("pairs only hash-authentic finals and calculates run/probability metrics", () => {
    const { forecast } = fixture();
    const finalBase = {
      gameId: "game-1", status: "FINAL" as const, homeRuns: 5, awayRuns: 3,
      completedAt: "2026-04-01T22:00:00Z",
    };
    const pair = pairMlb239FinalOutcome(forecast, {
      ...finalBase, outcomeHash: stableLocalHash(finalBase),
    });
    const metrics = evaluateMlb239Pairs([pair]);
    expect(metrics.sampleSize).toBe(1);
    expect(metrics.runs.home.mae).toBeCloseTo(.2);
    expect(metrics.probability.brier).toBeGreaterThanOrEqual(0);
  });

  it("keeps market comparison downstream and cannot alter forecast identity", () => {
    const { forecast } = fixture();
    const before = forecast.forecastHash;
    const comparison = compareMlb239ToMarket(forecast, {
      homeAmerican: -120, awayAmerican: 110, capturedAt: "2026-04-01T12:02:00Z",
    });
    expect(comparison.downstreamOnly).toBe(true);
    expect(comparison.officialUnits).toBe(0);
    expect(forecast.forecastHash).toBe(before);
    expect("homeAmerican" in forecast).toBe(false);
  });

  it("evaluates calibration separately with explicit metric deltas", () => {
    const result = evaluateMlb239Calibration([
      { rawProbability: .8, calibratedProbability: .7, outcome: 1 },
      { rawProbability: .8, calibratedProbability: .6, outcome: 0 },
    ]);
    expect(result.sampleSize).toBe(2);
    expect(result.deltas.brier).toBeLessThan(0);
  });

  it("separates readiness dimensions while making promotion impossible", () => {
    const readiness = buildMlb239Readiness({
      pipeline: { collectorHealthy: true, pitIntegrity: true },
      model: { artifactFrozen: true, executorExact: true, reproducible: true },
      shadow: { forecasts: 1000, immutable: true, marketFree: true },
      evidence: { finalPairs: 1000, metricsFrozen: true, calibrationEvaluated: true },
    });
    expect(readiness.pipeline.ready).toBe(true);
    expect(readiness.model.ready).toBe(true);
    expect(readiness.shadow.ready).toBe(true);
    expect(readiness.evidence.ready).toBe(true);
    expect(readiness.promotion).toEqual(expect.objectContaining({ ready: false, possible: false }));
    expect(readiness.productionChanged).toBe(false);
  });

  it("proves MLB V1 remains champion and other sports are isolated", () => {
    expect(MLB_239_CURRENT_CHAMPION).toBe("tbm-mlb-moneyline-v1");
    const { artifact } = fixture();
    expect(() => validateExactLiveExecutor239({
      sport: "NCAAF", modelId: artifact.modelId, modelVersion: artifact.modelVersion,
      artifactId: artifact.artifactId, artifactHash: artifact.artifactHash,
      configurationHash: artifact.configurationHash,
      normalizationHash: artifact.normalization.normalizationHash,
      parameterHash: artifact.parameterHash, outputSchemaVersion: MLB_239_OUTPUT_VERSION,
    } as never, artifact)).toThrow(/exactly match/);
  });
});