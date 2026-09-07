import { describe, expect, it } from "vitest";
import { MLB_224C_FEATURE_SCHEMA } from "./mlbExpectedRuns224C";
import { MLB_V4_INPUT_SCHEMA } from "./mlbV4LiveFoundation";
import {
  MLB_237_COMPATIBILITY, MLB_V4_FEATURE_COUNT, MLB_V4_FEATURE_DEFINITIONS,
  MLB_V4_FEATURE_ORDER, MLB_V4_FEATURE_ORDER_HASH, MLB_V4_INPUT_CONTRACT,
  MLB_V4_HISTORICAL_ADAPTER_HASH, MLB_V4_LIVE_ADAPTER_HASH,
  MLB_V4_NORMALIZATION, MLB_V4_NORMALIZATION_HASH, MLB_V4_PARITY_PROVEN_FEATURE_ORDER,
  MLB_V4_RAW_SEMANTIC_PARITY_FEATURE_ORDER, adaptHistoricalMlbV4Input, adaptLiveMlbV4Input,
  expectedScoreOutput, probabilityOutput,
} from "./mlbV4InputContract238";

const cutoff = "2026-06-01T16:00:00.000Z";
const envelope = {
  gameId: "controlled-1", evidenceTier: "BASELINE_CORE" as const,
  featureCutoff: cutoff, predictionTime: "2026-06-01T16:05:00.000Z",
  scheduledFirstPitch: "2026-06-01T17:00:00.000Z",
  sourceEvidenceTimes: ["2026-06-01T15:59:59.000Z"],
  sourceEvidenceComplete: true as const,
};
const side = (base: number, home: boolean) => {
  const vector = {
    ownOffense: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.ownOffense.map((name, index) =>
      [name, name === "seasonGames" ? base : base + index])),
    leagueEnvironment: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.leagueEnvironment.map((name, index) =>
      [name, name === "isHome" ? (home ? 1 : 0) : base + 10 + index])),
    opponentBullpen: Object.fromEntries(
      MLB_224C_FEATURE_SCHEMA.opponentBullpen.map((name, index) => [name, base + 20 + index]),
    ),
  };
  vector.opponentBullpen.bullpenSeasonKPct = 0.20 + base / 1_000;
  vector.opponentBullpen.bullpenSeasonBbPct = 0.08 + base / 1_000;
  vector.opponentBullpen.bullpenSeasonKMinusBbPct = 0.12 + base / 1_000;
  vector.opponentBullpen.bullpenSeasonHrRate = 0.03 + base / 1_000;
  vector.opponentBullpen.bullpenFeatureCompleteness = 1;
  return vector;
};
const offense = (base: number) => ({
  rolling: Object.fromEntries([5, 10, 20, 30].map((count, index) =>
    [`games${count}`, { games: count, runs: 0, runsPerGame: base + index + 2 }])),
  currentSeason: { games: base, runs: 0, runsPerGame: base + 6 },
  priorSeason: { games: 0, runs: 0, runsPerGame: null },
  currentSeasonHome: { games: base, runs: 0, runsPerGame: base + 7 },
  currentSeasonAway: { games: base, runs: 0, runsPerGame: base + 7 },
});
const bullpen = (base: number) => ({
  workload: {
    days1: { games: 1, innings: base + 1, pitches: base + 2, relievers: base + 3, era: base + 4 },
    days3: { games: 2, innings: base + 5, pitches: base + 6, relievers: base + 7, era: base + 8 },
    days7: { games: 3, innings: base + 9, pitches: base + 10, relievers: base + 11, era: base + 12 },
  },
  rolling: {
    games5: { games: 5, innings: base + 13, pitches: base + 14, relievers: base + 15, era: base + 16 },
    games10: { games: 10, innings: base + 17, pitches: base + 18, relievers: base + 19, era: base + 20 },
    games20: { games: 20, innings: base + 21, pitches: base + 22, relievers: base + 23, era: base + 24 },
    games30: { games: 30, innings: base + 25, pitches: base + 26, relievers: base + 27, era: base + 28 },
  },
  restDays: 1,
});
const historical = (homeBase = 10, awayBase = 4) => ({
  ...envelope, schemaVersion: "mlb-v4-moneyline-237-flat-38-v1" as const,
  evidenceTime: cutoff, home: side(homeBase, true), away: side(awayBase, false),
});
const live = (homeBase = 10, awayBase = 4) => ({
  ...envelope, schemaVersion: MLB_V4_INPUT_SCHEMA as typeof MLB_V4_INPUT_SCHEMA, pitSafe: true as const,
  features: {
    home: { offense: offense(homeBase), starter: null, opponentBullpen: bullpen(homeBase) },
    away: { offense: offense(awayBase), starter: null, opponentBullpen: bullpen(awayBase) },
    leagueContext: { runsPerTeamGame: 4.5 }, homeContext: {}, parkContext: null,
  },
});

describe("Task #238 frozen MLB V4 input contract", () => {
  it("freezes exactly the source-proven 38-feature order and hashes", () => {
    expect(MLB_V4_FEATURE_COUNT).toBe(38);
    expect(MLB_V4_FEATURE_ORDER).toHaveLength(38);
    expect(new Set(MLB_V4_FEATURE_ORDER).size).toBe(38);
    expect(MLB_V4_FEATURE_ORDER[0]).toBe("homeMinusAway.ownOffense.priorGames");
    expect(MLB_V4_FEATURE_ORDER.at(-1)).toBe("homeMinusAway.opponentBullpen.bullpenFeatureCompleteness");
    expect(MLB_V4_FEATURE_ORDER_HASH).toBe("9f25a6e8ff04d30df51bd86c33dd84f90d8688ac7bf4995ce397ff93fb2274ff");
    expect(MLB_V4_INPUT_CONTRACT.contractState).toBe("BLOCKED_INCOMPLETE");
    expect(MLB_V4_FEATURE_DEFINITIONS.every((feature) =>
      feature.unit && feature.requiredModelTransform && feature.missingPolicy && feature.orientation
      && feature.allowedRange.finite && feature.historicalVersion && feature.liveVersion)).toBe(true);
  });

  it("does not overclaim full parity when normalization and live semantics are blocked", () => {
    expect(MLB_V4_PARITY_PROVEN_FEATURE_ORDER).toHaveLength(0);
    expect(MLB_V4_RAW_SEMANTIC_PARITY_FEATURE_ORDER).toHaveLength(4);
    expect(MLB_V4_FEATURE_DEFINITIONS.filter((feature) => feature.status === "PARTIAL")).toHaveLength(4);
    expect(MLB_V4_FEATURE_DEFINITIONS.filter((feature) => feature.status === "FAIL")).toHaveLength(13);
    expect(MLB_V4_FEATURE_DEFINITIONS.filter((feature) => feature.status === "NOT_AVAILABLE")).toHaveLength(21);
    expect(MLB_V4_NORMALIZATION.constants).toBeNull();
    expect(MLB_V4_NORMALIZATION_HASH).toHaveLength(64);
    expect(MLB_V4_HISTORICAL_ADAPTER_HASH).toHaveLength(64);
    expect(MLB_V4_LIVE_ADAPTER_HASH).toHaveLength(64);
    expect(MLB_V4_HISTORICAL_ADAPTER_HASH).not.toBe(MLB_V4_LIVE_ADAPTER_HASH);
  });

  it("materializes deterministic historical vectors in frozen order", () => {
    const one = adaptHistoricalMlbV4Input(historical());
    const two = adaptHistoricalMlbV4Input(historical());
    expect(one.rawHomeThenAway).toHaveLength(76);
    expect(one.adapterHash).toBe(two.adapterHash);
    expect(one.vectorHash).toBe(two.vectorHash);
    expect(one.rawSemanticComparableVector.slice(0, 9)).toEqual([6, 6, null, null, null, null, 6, null, 1]);
    expect(one.fullVectorEligible).toBe(false);
    expect(one.modelVector).toBeNull();
  });

  it("proves controlled raw equality only for the four supported semantics", () => {
    const oldStyle = adaptHistoricalMlbV4Input(historical());
    const liveStyle = adaptLiveMlbV4Input(live());
    expect(liveStyle.rawSemanticComparableVector).toEqual(oldStyle.rawSemanticComparableVector);
    expect(liveStyle.vectorHash).toBe(oldStyle.vectorHash);
    expect(liveStyle.adapterHash).not.toBe(oldStyle.adapterHash);
    expect(liveStyle.rawHomeThenAway.slice(0, 8)).toEqual(oldStyle.rawHomeThenAway.slice(0, 8));
    expect(liveStyle.rawHomeThenAway.slice(38, 46)).toEqual(oldStyle.rawHomeThenAway.slice(38, 46));
    expect(liveStyle.missingFeatures).toHaveLength(21);
    expect(liveStyle.unresolvedParityFeatures).toHaveLength(38);
  });

  it("catches orientation changes with asymmetric fixtures", () => {
    expect(adaptLiveMlbV4Input(live(4, 10)).rawSemanticComparableVector.slice(0, 9))
      .toEqual([-6, -6, null, null, null, null, -6, null, 1]);
  });

  it("preserves explicit missingness instead of silently using zero", () => {
    const fixture = live();
    (fixture.features.home.offense.currentSeason as { runsPerGame: number | null }).runsPerGame = null;
    const adapted = adaptLiveMlbV4Input(fixture);
    expect(adapted.home.ownOffense.seasonRunsPerGame).toBeNull();
    expect(adapted.missingFeatures).toContain("homeMinusAway.ownOffense.seasonRunsPerGame");
    expect(adapted.rawSemanticComparableVector[6]).toBeNull();
  });

  it.each([
    ["market", { odds: -110 }, /MARKET_FIREWALL/],
    ["market total", { total: 8.5 }, /MARKET_FIREWALL/],
    ["opening line", { openingLine: -115 }, /MARKET_FIREWALL/],
    ["outcome", { finalScore: "5-2" }, /OUTCOME_FIREWALL/],
    ["starter hindsight", { actualStarter: "pitcher" }, /OUTCOME_FIREWALL/],
    ["lineup hindsight", { actualLineup: ["batter"] }, /OUTCOME_FIREWALL/],
    ["cross sport", { nflPowerRating: 1 }, /CROSS_SPORT_FIREWALL/],
  ])("rejects %s fields at any depth", (_name, injected, error) => {
    const fixture = live() as ReturnType<typeof live> & { injected?: unknown };
    fixture.injected = injected;
    expect(() => adaptLiveMlbV4Input(fixture)).toThrow(error);
  });

  it("enforces strict pregame PIT chronology and schema binding", () => {
    expect(() => adaptLiveMlbV4Input({ ...live(), predictionTime: envelope.scheduledFirstPitch })).toThrow(/PIT chronology/);
    expect(() => adaptHistoricalMlbV4Input({
      ...historical(), evidenceTime: "2026-06-01T16:00:00.001Z",
    })).toThrow(/evidence after/);
    expect(() => adaptLiveMlbV4Input({
      ...live(), sourceEvidenceTimes: ["2026-06-01T16:00:00.001Z"],
    })).toThrow(/evidence after/);
    expect(() => adaptLiveMlbV4Input({
      ...live(), sourceEvidenceTimes: [], sourceEvidenceComplete: false as true,
    })).toThrow(/provenance is incomplete/);
    expect(() => adaptLiveMlbV4Input({ ...live(), pitSafe: false as true })).toThrow(/schema\/PIT/);
  });

  it("keeps starter tiers explicit and rejects historical starter hindsight", () => {
    expect(adaptLiveMlbV4Input(live()).evidenceTier).toBe("BASELINE_CORE");
    expect(() => adaptHistoricalMlbV4Input({
      ...historical(), evidenceTier: "STARTER_CORE",
    })).toThrow(/BASELINE_CORE only/);
    expect(() => adaptLiveMlbV4Input({ ...live(), evidenceTier: "STARTER_CORE",
      features: { ...live().features, home: { ...live().features.home, starter: { actualStarter: "x" } } } }))
      .toThrow(/OUTCOME_FIREWALL/);
  });

  it("enforces frozen raw ranges and records known semantic failures", () => {
    const fixture = historical();
    fixture.home.ownOffense.priorGames = -1;
    expect(() => adaptHistoricalMlbV4Input(fixture)).toThrow(/allowed range/);
    expect(MLB_V4_FEATURE_DEFINITIONS.find((feature) =>
      feature.researchName === "ownOffense.runsPerGame5")?.semanticParity).toBe("FAIL");
    expect(MLB_V4_FEATURE_DEFINITIONS.find((feature) =>
      feature.researchName === "ownOffense.homeAwayRunsPerGame")?.mappingNote).toMatch(/lowercase/);
  });

  it("freezes score/probability type semantics and #237 incompatibility", () => {
    expect(expectedScoreOutput(4.49, 3.51)).toEqual({
      expected_home_runs_unrounded: 4.49, expected_away_runs_unrounded: 3.51,
      projected_home_score_display: 4, projected_away_score_display: 4,
    });
    expect(probabilityOutput(.57, .43).semantics).toBe("P(HOME_WIN), P(AWAY_WIN)");
    expect(() => probabilityOutput(.57, .44)).toThrow(/complementary/);
    expect(MLB_237_COMPATIBILITY.classification).toBe("INCOMPATIBLE");
    expect(MLB_237_COMPATIBILITY.coefficientsChanged).toBe(false);
    expect(MLB_V4_INPUT_CONTRACT.fullVectorEligibility).toMatch(/DENIED/);
  });
});