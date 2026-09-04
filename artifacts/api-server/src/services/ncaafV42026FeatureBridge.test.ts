import { describe, expect, it } from "vitest";
import { buildNcaafV42026FeatureBridge } from "./ncaafV42026FeatureBridge";

const at = (s: string) => new Date(s);
const completed = { provider: "college_football_data", providerEventId: "old", season: 2026, kickoffAt: at("2026-08-29T12:00:00Z"), gameStatus: "final", homeScore: 28, awayScore: 14, homeProviderTeamId: "A", awayProviderTeamId: "B", neutralSite: false, providerObservedAt: at("2026-08-29T15:00:00Z"), capturedAt: at("2026-08-29T15:00:00Z"), modeledAsOf: at("2026-08-29T15:00:00Z"), payload: { game: { homeClassification: "fbs", awayClassification: "fbs" } } };
const snapshot = { id: 1, schemaVersion: "ncaaf-football-intelligence-v2", targetProvider: "college_football_data", targetEventId: "next", season: 2026, week: 2, kickoffAt: at("2026-09-06T12:00:00Z"), homeProviderTeamId: "A", awayProviderTeamId: "C", dataCutoffAt: at("2026-09-05T00:00:00Z"), evidenceMaxCapturedAt: at("2026-08-29T15:00:00Z"), evidenceMaxModeledAt: null, domainPayload: { home: { venue: { payload: { neutralSite: false } } } } };
describe("NCAAF V4 2026 feature bridge", () => {
  it("reconstructs core replay state before the strict snapshot cutoff without retaining targets", () => {
    const result = buildNcaafV42026FeatureBridge({ snapshots: [snapshot], evidence: [completed], assessedAt: at("2026-09-05T12:00:00Z") });
    expect(result.inputs).toHaveLength(1);
    expect(result.inputs[0]!.features.home.seasonToDate).toMatchObject({ games: 1, offensePointsPerGame: 28 });
    expect(result.inputs[0]!.sourceAudit).toMatchObject({ targetResultUsed: false, completedGamesBeforeCutoff: 1 });
    expect(result.audit).toMatchObject({ sameGameLeakage: 0, futureGameLeakage: 0, marketLeakage: 0 });
  });
  it("fails closed for unsafe target mapping and post-cutoff completed evidence", () => {
    const unsafe = buildNcaafV42026FeatureBridge({ snapshots: [{ ...snapshot, targetProvider: "espn" }], evidence: [completed], assessedAt: at("2026-09-05T12:00:00Z") });
    expect(unsafe.exclusions[0]).toMatchObject({ reason: "unsafe_target_team_identity_mapping" });
    const late = buildNcaafV42026FeatureBridge({ snapshots: [snapshot], evidence: [{ ...completed, capturedAt: at("2026-09-05T00:00:00Z") }], assessedAt: at("2026-09-05T12:00:00Z") });
    expect(late.inputs[0]!.features.home.seasonToDate.games).toBe(0);
    expect(late.audit.excludedCompletedEvidence.post_cutoff_evidence).toBe(1);
  });
  it("rejects market-shaped evidence rather than generating a bridge input from it", () => {
    const result = buildNcaafV42026FeatureBridge({ snapshots: [{ ...snapshot, domainPayload: { odds: 3 } }], evidence: [completed], assessedAt: at("2026-09-05T12:00:00Z") });
    expect(result.inputs).toHaveLength(0);
    expect(result.audit).toMatchObject({ marketLeakage: 0, marketShapedSnapshotsRejected: 1 });
  });
  it("keeps challenger output in the returned in-memory bridge only", () => {
    const result = buildNcaafV42026FeatureBridge({ snapshots: [snapshot], evidence: [completed], assessedAt: at("2026-09-05T12:00:00Z"),
      predict: input => ({ predictionId: "internal", gameId: input.stableGameId, sport: "NCAAF", modelVersion: "challenger",
        datasetVersion: "v4", featureSchemaVersion: "v4", featureCutoff: input.featureCutoff, expectedHomePoints: 27, expectedAwayPoints: 20,
        expectedMargin: 7, expectedTotal: 47, homeWinProbability: .7, awayWinProbability: .3, scoreUncertainty: 1, marginUncertainty: 12,
        totalUncertainty: 15, dataQuality: "LOW", diagnostics: { currentGames: [1, 0], missingIndicators: 1, configurationHash: "x", parameterHash: "x" },
        probabilityHomeCovers: () => .5, probabilityAwayCovers: () => .5, probabilityOver: () => .5, probabilityUnder: () => .5 }),
    });
    expect(result.predictions[0]).toMatchObject({ gameId: "college_football_data:next", featureAvailability: "PASS", modelVersion: "challenger" });
  });
});