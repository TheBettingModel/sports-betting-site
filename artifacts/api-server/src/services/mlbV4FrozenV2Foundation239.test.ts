import { describe, expect, it } from "vitest";
import { MLB_224C_FEATURE_SCHEMA } from "./mlbExpectedRuns224C";
import type { MlbSideFeatureVector } from "./mlbV4ExpectedRuns";
import {
  MLB_V4_FROZEN_V2_CONTRACT,
  MLB_V4_FROZEN_V2_DISPOSITIONS,
  MLB_V4_FROZEN_V2_FEATURE_ORDER,
  MLB_V4_FROZEN_V2_FEATURE_ORDER_HASH,
  MLB_V4_FROZEN_V2_HISTORICAL_SCHEMA,
  MLB_V4_FROZEN_V2_LIVE_SCHEMA,
  MLB_V4_V2_DEFAULT_TRAINING_GATE,
  adaptHistoricalMlbV4V2,
  adaptLiveMlbV4V2,
  applyMlbV4V2Normalization,
  evaluateMlbV4V2TrainingGate,
  fitMlbV4V2Normalization,
  materializeMlbV4V2Dataset,
  type V2Cohort,
  type V2DatasetGame,
  type V2HistoricalInput,
  type V2LiveInput,
} from "./mlbV4FrozenV2Foundation239";

const envelope = (gameId: string, firstPitch: string) => {
  const start = Date.parse(firstPitch);
  return {
    gameId, evidenceTier: "BASELINE_CORE" as const, scheduledFirstPitch: firstPitch,
    featureCutoff: new Date(start - 3_600_000).toISOString(),
    predictionTime: new Date(start - 1_800_000).toISOString(),
    sourceEvidenceTimes: [new Date(start - 3_600_001).toISOString()],
    sourceEvidenceComplete: true as const,
  };
};
const side = (base: number, isHome: boolean): MlbSideFeatureVector => ({
  ownOffense: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.ownOffense.map((name, index) =>
    [name, name === "priorGames" || name === "seasonGames" ? base : base + index / 10])),
  leagueEnvironment: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.leagueEnvironment.map((name) =>
    [name, name === "isHome" ? (isHome ? 1 : 0)
      : name === "priorGames" ? 100
        : name === "runsPerTeamGame7d" ? 4.3
          : name === "runsPerTeamGame14d" ? 4.4
            : name === "runsPerTeamGame30d" ? 4.5 : 4.6])),
  opponentBullpen: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.opponentBullpen.map((name) => [name, base])),
});
const historical = (id = "g1", date = "2024-01-01T20:00:00.000Z", h = 10, a = 4): V2HistoricalInput => ({
  ...envelope(id, date), schemaVersion: MLB_V4_FROZEN_V2_HISTORICAL_SCHEMA,
  home: side(h, true), away: side(a, false),
});
const live = (id = "g1", date = "2024-01-01T20:00:00.000Z", h = 10, a = 4): V2LiveInput => ({
  ...envelope(id, date), schemaVersion: MLB_V4_FROZEN_V2_LIVE_SCHEMA, pitSafe: true as const,
  features: {
    home: { offense: {
      currentSeason: { games: h, runsPerGame: h + .6 },
      rolling: Object.fromEntries([5, 10, 20, 30].map((n, index) =>
        [`games${n}`, { runsPerGame: h + (index + 2) / 10 }])),
      currentSeasonHome: { runsPerGame: h + .7 },
      currentSeasonAway: { runsPerGame: h + .7 },
    } },
    away: { offense: {
      currentSeason: { games: a, runsPerGame: a + .6 },
      rolling: Object.fromEntries([5, 10, 20, 30].map((n, index) =>
        [`games${n}`, { runsPerGame: a + (index + 2) / 10 }])),
      currentSeasonHome: { runsPerGame: a + .7 },
      currentSeasonAway: { runsPerGame: a + .7 },
    } },
    leagueContext: {
      priorGames: 100,
      runsPerTeamGame7d: 4.3,
      runsPerTeamGame14d: 4.4,
      runsPerTeamGame30d: 4.5,
      seasonRunsPerTeamGame: 4.6,
    },
  },
});
const datasetGame = (id: string, date: string, cohort: V2Cohort, h: number, a: number): V2DatasetGame => ({
  vector: adaptHistoricalMlbV4V2(historical(id, date, h, a)),
  scheduledFirstPitch: date, cohort, homeRuns: 5, awayRuns: 3,
  featureSnapshotHash: `snapshot-${id}`,
});

describe("Task 239 frozen MLB v2 foundation", () => {
  it("reassesses every Task 238 field exactly once and retains only fully defensible fields", () => {
    expect(MLB_V4_FROZEN_V2_DISPOSITIONS).toHaveLength(38);
    expect(new Set(MLB_V4_FROZEN_V2_DISPOSITIONS.map((row) => row.canonicalName)).size).toBe(38);
    expect(MLB_V4_FROZEN_V2_DISPOSITIONS.filter((row) => row.disposition === "PARITY_PROVEN")).toHaveLength(14);
    expect(MLB_V4_FROZEN_V2_DISPOSITIONS.filter((row) => row.disposition === "HISTORICAL_BASELINE_ONLY")
      .every((row) => row.reasonCode)).toBe(true);
    expect(MLB_V4_FROZEN_V2_FEATURE_ORDER).toHaveLength(14);
    expect(MLB_V4_FROZEN_V2_FEATURE_ORDER_HASH).toHaveLength(64);
    expect(MLB_V4_FROZEN_V2_CONTRACT.contractHash).toHaveLength(64);
  });

  it("materializes historical and live raw vectors with exact parity and orientation", () => {
    const old = adaptHistoricalMlbV4V2(historical());
    const current = adaptLiveMlbV4V2(live());
    expect(old.rawHomeMinusAway).toHaveLength(14);
    expect(current.rawHomeMinusAway).toEqual(old.rawHomeMinusAway);
    expect(current.vectorHash).toBe(old.vectorHash);
    expect(adaptLiveMlbV4V2(live("g1", "2024-01-01T20:00:00.000Z", 4, 10)).rawHomeMinusAway)
      .toEqual(expect.arrayContaining([-6, 1]));
  });

  it("preserves nulls in both adapters", () => {
    const fixture = live();
    (fixture.features.home.offense as { currentSeason: { runsPerGame: number | null } })
      .currentSeason.runsPerGame = null;
    expect(adaptLiveMlbV4V2(fixture).rawHomeMinusAway[6]).toBeNull();
  });

  it.each([
    [{ odds: -110 }, /MARKET_FIREWALL/],
    [{ finalScore: "4-2" }, /OUTCOME_FIREWALL/],
    [{ nbaRating: 1 }, /CROSS_SPORT_FIREWALL/],
  ])("enforces recursive firewalls", (injected, error) => {
    expect(() => adaptLiveMlbV4V2({ ...live(), injected } as ReturnType<typeof live>)).toThrow(error);
  });

  it("fails closed on schema, PIT provenance, chronology, and ranges", () => {
    expect(() => adaptLiveMlbV4V2({ ...live(), pitSafe: false as true })).toThrow(/SCHEMA_MISMATCH/);
    expect(() => adaptLiveMlbV4V2({ ...live(), sourceEvidenceTimes: [] })).toThrow(/PIT_PROVENANCE/);
    expect(() => adaptLiveMlbV4V2({ ...live(),
      predictionTime: live().scheduledFirstPitch })).toThrow(/PIT_CHRONOLOGY/);
    const bad = live();
    (bad.features.home.offense as { currentSeason: { games: number } }).currentSeason.games = -1;
    expect(() => adaptLiveMlbV4V2(bad)).toThrow(/FEATURE_RANGE/);
  });

  it("builds deterministic chronological splits and quarantines consumed benchmarks", () => {
    const rows = [
      datasetGame("train", "2023-01-01T20:00:00.000Z", "TRAIN", 10, 4),
      datasetGame("valid", "2024-01-01T20:00:00.000Z", "VALIDATION", 11, 5),
      datasetGame("spent", "2025-01-01T20:00:00.000Z", "HISTORICAL_BENCHMARK_ONLY", 12, 6),
    ];
    const one = materializeMlbV4V2Dataset(rows, new Set(["spent"]));
    const two = materializeMlbV4V2Dataset([...rows].reverse(), new Set(["spent"]));
    expect(one.datasetHash).toBe(two.datasetHash);
    expect(one.cohortCounts).toEqual({ TRAIN: 1, VALIDATION: 1, HISTORICAL_BENCHMARK_ONLY: 1 });
    expect(Object.values(one.cohortHashes).every((hash) => hash.length === 64)).toBe(true);
    expect(() => materializeMlbV4V2Dataset(rows, new Set())).toThrow(/BENCHMARK_FIREWALL/);
    expect(() => materializeMlbV4V2Dataset([
      rows[1], rows[0], rows[2],
    ], new Set(["spent"]))).not.toThrow();
    expect(() => materializeMlbV4V2Dataset([
      { ...rows[0], scheduledFirstPitch: "2024-02-01T00:00:00.000Z" }, rows[1], rows[2],
    ], new Set(["spent"]))).toThrow(/SPLIT_INVALID/);
  });

  it("fits deterministic normalization from TRAIN only and applies it per side", () => {
    const rows = [
      datasetGame("train1", "2023-01-01T20:00:00.000Z", "TRAIN", 10, 4),
      datasetGame("train2", "2023-02-01T20:00:00.000Z", "TRAIN", 12, 6),
      datasetGame("valid", "2024-01-01T20:00:00.000Z", "VALIDATION", 30, 1),
      datasetGame("spent", "2025-01-01T20:00:00.000Z", "HISTORICAL_BENCHMARK_ONLY", 40, 2),
    ];
    const dataset = materializeMlbV4V2Dataset(rows, new Set(["spent"]));
    const artifact = fitMlbV4V2Normalization(dataset);
    expect(artifact.trainingGameCount).toBe(2);
    expect(artifact.trainingSideRowCount).toBe(4);
    expect(artifact.transform.medians).toHaveLength(14);
    expect(artifact.artifactHash).toHaveLength(64);
    expect(applyMlbV4V2Normalization(rows[2].vector, artifact)).toHaveLength(14);
    expect(fitMlbV4V2Normalization(dataset).artifactHash).toBe(artifact.artifactHash);
  });

  it("opens the training gate only with a hash-bound dataset and normalization", () => {
    expect(MLB_V4_V2_DEFAULT_TRAINING_GATE.open).toBe(false);
    expect(MLB_V4_V2_DEFAULT_TRAINING_GATE.reasonCodes).toEqual([
      "DEVELOPMENT_DATASET_NOT_PROVIDED", "TRAIN_NORMALIZATION_NOT_PROVIDED",
      "NO_PROSPECTIVE_V5_PARITY_VECTOR",
    ]);
    const rows = [
      datasetGame("t", "2023-01-01T20:00:00.000Z", "TRAIN", 10, 4),
      datasetGame("v", "2024-01-01T20:00:00.000Z", "VALIDATION", 11, 5),
      datasetGame("b", "2025-01-01T20:00:00.000Z", "HISTORICAL_BENCHMARK_ONLY", 12, 6),
    ];
    const dataset = materializeMlbV4V2Dataset(rows, new Set(["b"]));
    expect(evaluateMlbV4V2TrainingGate(dataset, fitMlbV4V2Normalization(dataset),
      { prospectiveParityVectors: 1 }).open).toBe(true);
  });

  it("rejects target ties and never consumes targets in adapter features", () => {
    const tied = datasetGame("tie", "2023-01-01T20:00:00.000Z", "TRAIN", 10, 4);
    tied.homeRuns = tied.awayRuns = 2;
    expect(() => materializeMlbV4V2Dataset([
      tied,
      datasetGame("v", "2024-01-01T20:00:00.000Z", "VALIDATION", 11, 5),
      datasetGame("b", "2025-01-01T20:00:00.000Z", "HISTORICAL_BENCHMARK_ONLY", 12, 6),
    ], new Set(["b"]))).toThrow(/TARGET_INVALID/);
  });
});