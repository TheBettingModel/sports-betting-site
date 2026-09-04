import { describe, expect, it } from "vitest";
import { evaluateNcaafV4Prospective, type NcaafV4FrozenProspectivePrediction } from "./ncaafV4ProspectiveEvaluation";
import type { NcaafV42026InternalPrediction } from "./ncaafV42026FeatureBridge";

const prediction = (overrides: Partial<NcaafV4FrozenProspectivePrediction> = {}): NcaafV4FrozenProspectivePrediction => ({
  snapshotId: 1, gameId: "espn:1", espnGameId: "1", cfbdHomeTeamId: "10", cfbdAwayTeamId: "20",
  featureCutoff: "2026-09-04T12:00:00.000Z", predictionTimestamp: "2026-09-04T13:40:00.000Z",
  modelVersion: "tbm-ncaaf-v4-expected-score", expectedHomePoints: 28, expectedAwayPoints: 21,
  expectedMargin: 7, expectedTotal: 49, homeWinProbability: .7, awayWinProbability: .3,
  marginUncertainty: 14, totalUncertainty: 18, dataQuality: "MEDIUM", featureAvailability: "PASS",
  configurationHash: "config", parameterHash: "params", featureSchemaVersion: "schema", datasetVersion: "dataset",
  homeIdentityMethod: "EXACT_EXISTING_LEDGER", awayIdentityMethod: "EXACT_EXISTING_LEDGER",
  homeIdentityEvidenceRef: "home", awayIdentityEvidenceRef: "away", ...overrides,
  scheduledKickoffAt: overrides.scheduledKickoffAt ?? "2026-09-04T22:30:00.000Z",
});

describe("NCAAF V4 prospective evaluation", () => {
  it("keeps unfinished frozen predictions pending without inventing results", () => {
    const result = evaluateNcaafV4Prospective([prediction()], [], new Date("2026-09-04T14:00:00Z"), 3);
    expect(result.cohorts).toEqual({ PREGAME_FROZEN_PENDING: 1, PREGAME_FROZEN_GRADED: 0, INVALID_AFTER_CUTOFF: 0, OUT_OF_DOMAIN: 3 });
    expect(result.metrics).toBeNull();
    expect(result.evidenceClassification).toBe("INCONCLUSIVE");
  });
  it("grades only an authoritative final captured after kickoff", () => {
    const result = evaluateNcaafV4Prospective([prediction()], [{
      gameId: "espn:1", kickoffAt: new Date("2026-09-04T22:30:00Z"), status: "final",
      homeScore: 31, awayScore: 20, capturedAt: new Date("2026-09-05T02:00:00Z"),
    }], new Date("2026-09-05T03:00:00Z"));
    expect(result.cohorts.PREGAME_FROZEN_GRADED).toBe(1);
    expect(result.metrics).toMatchObject({ count: 1, homeMae: 3, awayMae: 1, marginMae: 4, totalMae: 2 });
    expect(result.metrics!.brier).toBeCloseTo(.09, 12);
  });
  it("rejects a prediction generated at or after kickoff", () => {
    expect(() => evaluateNcaafV4Prospective([prediction({ predictionTimestamp: "2026-09-04T22:30:00.000Z" })], [{
      gameId: "espn:1", kickoffAt: new Date("2026-09-04T22:30:00Z"), status: "final",
      homeScore: 31, awayScore: 20, capturedAt: new Date("2026-09-05T02:00:00Z"),
    }], new Date("2026-09-05T03:00:00Z"))).toThrow(/Malformed/);
  });
  it("rejects an after-kickoff prediction before an outcome exists", () => {
    expect(() => evaluateNcaafV4Prospective([
      prediction({ predictionTimestamp: "2026-09-04T22:30:00.000Z" }),
    ], [], new Date("2026-09-04T23:00:00Z"))).toThrow(/Malformed/);
  });
  it("fails closed on duplicate IDs and malformed values", () => {
    expect(() => evaluateNcaafV4Prospective([prediction(), prediction()], [], new Date("2026-09-05T03:00:00Z"))).toThrow(/Duplicate/);
    expect(() => evaluateNcaafV4Prospective([prediction({ homeWinProbability: Number.NaN })], [], new Date("2026-09-05T03:00:00Z"))).toThrow(/Malformed/);
    const outcome = { gameId: "espn:1", kickoffAt: new Date("2026-09-04T22:30:00Z"), status: "final", homeScore: -1, awayScore: 20, capturedAt: new Date("2026-09-05T02:00:00Z") };
    expect(() => evaluateNcaafV4Prospective([prediction()], [outcome], new Date("2026-09-05T03:00:00Z"))).toThrow(/Malformed/);
    const valid = { ...outcome, homeScore: 31 };
    expect(() => evaluateNcaafV4Prospective([prediction()], [valid, valid], new Date("2026-09-05T03:00:00Z"))).toThrow(/Duplicate/);
  });
});