import { describe, expect, it } from "vitest";
import {
  americanImpliedProbability, buildExactNcaafMoneylineBridge,
  selectCompleteNcaafMarketPair, selectExactNcaafBook, validProviderObservation, validateNcaafCandidateRegistryRow,
} from "./ncaafMoneylineBridge";
import { getCurrentNcaafCandidateIdentity } from "./candidateRegistry";
import type { NcaafCandidateOutput } from "./ncaafCandidateExecutor";

const output: NcaafCandidateOutput = {
  predictionId: "p", gameId: "espn:1", modelVersion: "D-simple-expected-score-linear",
  datasetVersion: "ncaaf-chronological-team-game-v2", featureSchemaVersion: "ncaaf-v4-2026",
  featureCutoff: "2026-09-01T10:00:00.000Z", expectedHomePoints: 28, expectedAwayPoints: 21,
  expectedMargin: 7, expectedTotal: 49, homeWinProbability: .64, awayWinProbability: .36,
  marginUncertainty: 10, totalUncertainty: 12, dataQuality: "HIGH",
  configurationHash: "a", parameterHash: "b",
};
const now = new Date("2026-09-01T12:00:00.000Z");

describe("Task236 exact NCAAF moneyline bridge", () => {
  const exactRegistryRow = () => {
    const identity = getCurrentNcaafCandidateIdentity();
    return {
      modelId: identity.modelId, sport: "NCAAF", market: "expected-score", status: "challenger",
      approvedAt: null, deployedAt: null,
      candidateModelVersion: identity.modelVersion, candidateArtifactId: identity.artifactId,
      candidateArtifactHash: identity.artifactHash, candidateConfigurationHash: identity.configurationHash!,
      candidateParameterHash: identity.parameterHash!, candidateInputContractVersion: identity.inputContractVersion,
    };
  };

  it("accepts the governed expected-score challenger identity without approval", () => {
    const row = exactRegistryRow();
    expect(() => validateNcaafCandidateRegistryRow(row)).not.toThrow();
    expect(row.status).toBe("challenger");
    expect(row.approvedAt).toBeNull();
    expect(row.deployedAt).toBeNull();
  });

  it("rejects metadata conflicts and approved/production rows", () => {
    expect(() => validateNcaafCandidateRegistryRow({
      ...exactRegistryRow(), candidateArtifactHash: "wrong",
    })).toThrow(/identity conflict/i);
    expect(() => validateNcaafCandidateRegistryRow({
      ...exactRegistryRow(), status: "production",
    })).toThrow(/non-approved/i);
    expect(() => validateNcaafCandidateRegistryRow({
      ...exactRegistryRow(), status: "development",
    })).toThrow(/non-approved/i);
    expect(() => validateNcaafCandidateRegistryRow({
      ...exactRegistryRow(), approvedAt: new Date(),
    })).toThrow(/non-approved/i);
    expect(() => validateNcaafCandidateRegistryRow({
      ...exactRegistryRow(), deployedAt: new Date(),
    })).toThrow(/non-approved/i);
  });

  it("uses observed selected-side American odds for exact arithmetic", () => {
    const bridge = buildExactNcaafMoneylineBridge({ output, modelVersionId: 9, now, market: {
      snapshotId: 42, sportsbookId: 7, sportsbook: "Pinnacle", source: "odds-api", providerEventId: "odds-42",
      selection: "home", price: -150, capturedAt: "2026-09-01T11:45:00.000Z",
    } });
    expect(americanImpliedProbability(-150)).toBe(.6);
    expect(americanImpliedProbability(150)).toBe(.4);
    expect(bridge).toMatchObject({ persisted: false, impliedProbability: .6, marketFresh: true });
    expect(bridge.edge).toBeCloseTo(4, 12);
    expect(bridge.risk.status).toBe("UNAVAILABLE");
    expect(bridge.finalRating.status).toBe("BLOCKED");
    expect(bridge.pod.status).toBe("BLOCKED");
  });

  it("captures only a complete same-book quote and prefers Pinnacle", () => {
    const game = {
      consensusHomeOdds: -110, consensusAwayOdds: -110, commenceTime: "2026-09-01T18:00:00.000Z",
      providerEventId: "odds-event-1",
      bookmakerOdds: [
        { book: "draftkings", homeOdds: -120, awayOdds: 100, lastUpdate: "2026-09-01T11:55:00.000Z" },
        { book: "pinnacle", homeOdds: -115, awayOdds: -105, lastUpdate: "2026-09-01T11:56:00.000Z" },
        { book: "fanduel", homeOdds: -130, awayOdds: 90 },
      ],
    };
    expect(selectExactNcaafBook(game)?.book).toBe("pinnacle");
    expect(selectExactNcaafBook({ ...game, bookmakerOdds: [] })).toBeNull();
    expect(validProviderObservation("2026-09-01T11:56:00.000Z", now)?.toISOString())
      .toBe("2026-09-01T11:56:00.000Z");
    expect(validProviderObservation("2026-09-01T11:00:00.000Z", now)).toBeNull();
    expect(validProviderObservation("2026-09-01T12:01:00.000Z", now)).toBeNull();
  });

  it("rejects isolated or mixed-identity persisted market sides", () => {
    const base = {
      sportsbook: "Pinnacle", source: "odds-api", providerEventId: "event", price: -110,
      capturedAt: "2026-09-01T11:55:00.000Z",
    };
    expect(selectCompleteNcaafMarketPair([{ ...base, snapshotId: 1, sportsbookId: 1, selection: "home" }], "home"))
      .toBeNull();
    expect(selectCompleteNcaafMarketPair([
      { ...base, snapshotId: 1, sportsbookId: 1, selection: "home" },
      { ...base, snapshotId: 2, sportsbookId: 2, selection: "away" },
    ], "home")).toBeNull();
    expect(selectCompleteNcaafMarketPair([
      { ...base, snapshotId: 1, sportsbookId: 1, selection: "home" },
      { ...base, snapshotId: 2, sportsbookId: 1, selection: "away", providerEventId: "other" },
    ], "home")).toBeNull();
    expect(selectCompleteNcaafMarketPair([
      { ...base, snapshotId: 1, sportsbookId: null, selection: "home" },
      { ...base, snapshotId: 2, sportsbookId: null, selection: "away" },
    ], "home")).toBeNull();
    expect(selectCompleteNcaafMarketPair([
      { ...base, snapshotId: 1, sportsbookId: 1, selection: "home" },
      { ...base, snapshotId: 2, sportsbookId: 1, selection: "home" },
      { ...base, snapshotId: 3, sportsbookId: 1, selection: "away" },
    ], "home")).toBeNull();
    expect(selectCompleteNcaafMarketPair([
      { ...base, snapshotId: 1, sportsbookId: 1, selection: "home" },
      { ...base, snapshotId: 2, sportsbookId: 1, selection: "away" },
    ], "home")?.snapshotId).toBe(1);
  });

  it("refuses stale, missing, mismatched, or invented market values", () => {
    const stale = buildExactNcaafMoneylineBridge({ output, modelVersionId: null, now, market: {
      snapshotId: 1, sportsbookId: null, sportsbook: null, source: "espn", providerEventId: null, selection: "home",
      price: -110, capturedAt: "2026-09-01T11:00:00.000Z",
    } });
    expect(stale.impliedProbability).toBeNull();
    expect(stale.edge).toBeNull();
    expect(stale.modelVersionId).toBeNull();
    const mismatched = buildExactNcaafMoneylineBridge({ output, modelVersionId: 1, now, market: {
      snapshotId: 2, sportsbookId: 1, sportsbook: "book", source: "source", providerEventId: "odds-2", selection: "away",
      price: 120, capturedAt: "2026-09-01T11:50:00.000Z",
    } });
    expect(mismatched.impliedProbability).toBeNull();
    expect(mismatched.edge).toBeNull();
    expect(mismatched.publication).toMatchObject({
      ready: false, approval: { ready: false }, technicalReadiness: { ready: false },
    });
  });
});