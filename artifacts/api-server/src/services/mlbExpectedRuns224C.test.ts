import { describe, expect, it } from "vitest";
import {
  MLB_224C_COUNTS,
  MLB_224C_FEATURE_SCHEMA,
  MLB_224C_FOUNDATION_ARTIFACT,
  MLB_224C_FOUNDATION_HASH,
  MLB_224C_REPLAY_HASH,
  MLB_224C_SPLIT_FOUNDATION_HASH,
  MLB_224C_SPLIT_SCHEMA_VERSION,
  MLB_224C_SOURCE_MANIFEST_HASH,
  assertAuthoritativeFoundation,
  assertSealedSplitBinding,
  buildDirectedSideFeatures,
  buildTrainingManifest,
  chronologicalWalkForwardFolds,
  forecastGame,
  selectCandidate,
  type CandidateScore,
  type DevelopmentGame,
  type SplitMember,
} from "./mlbExpectedRuns224C";
import { fitPoissonExpectedRunsFixed } from "./mlbV4ExpectedRuns";

const members: SplitMember[] = [
  ...Array.from({ length: MLB_224C_COUNTS.TRAIN }, (_, i) => ({
    canonicalGameId: `t-${i}`, cohort: "TRAIN" as const, assignmentHash: `t${i}`, immutable: true,
  })),
  ...Array.from({ length: MLB_224C_COUNTS.VALIDATION }, (_, i) => ({
    canonicalGameId: `v-${i}`, cohort: "VALIDATION" as const, assignmentHash: `v${i}`, immutable: true,
  })),
  ...Array.from({ length: MLB_224C_COUNTS.LOCKED_OOS }, (_, i) => ({
    canonicalGameId: `o-${i}`, cohort: "LOCKED_OOS" as const, assignmentHash: `o${i}`, immutable: true,
  })),
];

describe("MLB TASK 224C pipeline contract", () => {
  it("binds only the exact authoritative artifact and sealed split", () => {
    const identity = {
      artifactKey: MLB_224C_FOUNDATION_ARTIFACT, foundationHash: MLB_224C_FOUNDATION_HASH,
      replayHash: MLB_224C_REPLAY_HASH, sourceManifestHash: MLB_224C_SOURCE_MANIFEST_HASH,
      status: "SEALED_PITCHER_BULLPEN_FOUNDATION",
    };
    expect(() => assertAuthoritativeFoundation(identity)).not.toThrow();
    expect(() => assertAuthoritativeFoundation({ ...identity, replayHash: "wrong" })).toThrow(/replayHash/);
    const first = buildTrainingManifest(members, { quarantined: 3 });
    const second = buildTrainingManifest([...members].reverse(), { quarantined: 3 });
    expect(first).toEqual(second);
    expect([first.trainGameCount, first.validationGameCount, first.oosOriginalGameCount])
      .toEqual([4700, 2361, 2012]);
    expect(new Set(first.trainGameIds).has(first.oosGameIds[0]!)).toBe(false);
    const bound = members.map((row) => ({
      ...row,
      schemaVersion: MLB_224C_SPLIT_SCHEMA_VERSION,
      foundationChecksum: MLB_224C_SPLIT_FOUNDATION_HASH,
      gameDate: row.cohort === "TRAIN"
        ? "2024-10-30T00:00:00.000Z"
        : row.cohort === "VALIDATION"
          ? "2025-11-01T00:00:00.000Z"
          : "2026-04-01T00:00:00.000Z",
    }));
    expect(assertSealedSplitBinding(bound).LOCKED_OOS.count).toBe(2012);
    expect(() => assertSealedSplitBinding(bound.map((row, index) =>
      index === 0 ? { ...row, foundationChecksum: "wrong" } : row)))
      .toThrow(/binding/);
  });

  it("requires exact offense/opponent-bullpen direction and PIT chronology", () => {
    const cutoff = new Date("2024-06-01T16:00:00Z");
    const offense = {
      canonicalGameId: "g", teamSide: "home" as const, canonicalTeamId: "H",
      opponentCanonicalTeamId: "A", featureCutoff: cutoff,
      scheduledFirstPitch: new Date("2024-06-01T17:00:00Z"), eligibilityState: "CORE_ELIGIBLE",
      coreFeatures: {
        team: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.ownOffense.map((key) => [key, 4])),
        league: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.leagueEnvironment
          .filter((key) => key !== "isHome").map((key) => [key, 4.5])),
      },
      checksum: "offense",
    };
    const bullpen = {
      canonicalGameId: "g", canonicalTeamId: "A", opponentCanonicalTeamId: "H",
      featureCutoff: cutoff, statThroughTime: new Date("2024-05-31T23:00:00Z"), checksum: "pen",
      ...Object.fromEntries(MLB_224C_FEATURE_SCHEMA.opponentBullpen.map((key) => [key, 3])),
    };
    const vector = buildDirectedSideFeatures(offense, bullpen);
    expect(vector.leagueEnvironment.isHome).toBe(1);
    expect(Object.keys(vector.ownOffense)).toEqual(MLB_224C_FEATURE_SCHEMA.ownOffense);
    expect(() => buildDirectedSideFeatures(offense, { ...bullpen, canonicalTeamId: "H" }))
      .toThrow(/direction/);
    expect(() => buildDirectedSideFeatures(offense, {
      ...bullpen, statThroughTime: new Date("2024-06-01T16:30:00Z"),
    })).toThrow(/point-in-time/);
    expect(() => buildDirectedSideFeatures({
      ...offense, coreFeatures: { ...(offense.coreFeatures as object), hidden: { actualStarterEra: 2.1 } },
    }, bullpen)).toThrow(/prohibited/i);
  });

  it("uses chronological folds and the predeclared selection tie-break", () => {
    const games = ["2023-04-01", "2023-07-01", "2024-04-01", "2024-07-01"].map((date, i) =>
      ({ gameId: String(i), date, season: Number(date.slice(0, 4)), cohort: "TRAIN" }) as DevelopmentGame);
    const folds = chronologicalWalkForwardFolds(games);
    expect(folds.length).toBeGreaterThan(1);
    expect(folds.every((fold) => fold.train.at(-1)!.date < fold.validation[0]!.date)).toBe(true);
    const base: CandidateScore = {
      id: "poisson", family: "poisson", lambda: 1, alpha: null, totalMae: 4,
      totalBias: .2, brier: .24, logLoss: .68, ece: .04, worstFoldDegradation: .1,
      integrityIssues: 0, numericalIssues: 0,
    };
    expect(selectCandidate([base, { ...base, id: "ridge", family: "ridge-linear",
      totalMae: 4.015, totalBias: .1 }]).id).toBe("ridge");
    expect(() => selectCandidate([{ ...base, numericalIssues: 1 }])).toThrow(/integrity-clean/);
  });

  it("freezes exact score math, no-draw probability and fair odds", () => {
    const vector = {
      ownOffense: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.ownOffense.map((key) => [key, 4])),
      leagueEnvironment: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.leagueEnvironment.map((key) => [key, 1])),
      opponentBullpen: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.opponentBullpen.map((key) => [key, 3])),
    };
    const game = {
      gameId: "g", date: "2024-08-01", season: 2024, cohort: "TRAIN" as const,
      home: vector, away: { ...vector, leagueEnvironment: { ...vector.leagueEnvironment, isHome: 0 } },
      homeRuns: 5, awayRuns: 3, featureSnapshotHash: "x", forecastCutoff: "2024-08-01T00:00:00Z",
    };
    const model = fitPoissonExpectedRunsFixed([
      { features: game.home, runs: 5 }, { features: game.away, runs: 3 },
      { features: { ...game.home, ownOffense: { ...game.home.ownOffense, priorGames: 5 } }, runs: 4 },
    ], MLB_224C_FEATURE_SCHEMA, 10);
    const forecast = forecastGame(model, {
      distribution: { kind: "poisson", alpha: null }, calibration: { kind: "identity" },
    }, game);
    expect(forecast.projected_total_exact).toBe(
      forecast.home_expected_runs_exact + forecast.away_expected_runs_exact);
    expect(forecast.home_win_probability + forecast.away_win_probability).toBe(1);
    expect(Number.isFinite(forecast.fair_home_moneyline)).toBe(true);
  });
});