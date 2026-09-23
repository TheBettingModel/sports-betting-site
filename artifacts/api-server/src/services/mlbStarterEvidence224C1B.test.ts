import { describe, expect, it } from "vitest";
import {
  buildMlb224C1BReport,
  latestSafePregameSnapshot,
  marketLeakagePaths,
  pregameOutcomeLeakagePaths,
  renderMlb224C1BMarkdown,
  starterStateClass,
  type AuditInputs,
  type AuditSnapshot,
} from "./mlbStarterEvidence224C1B";

const cutoff = new Date("2026-09-05T20:00:00.000Z");
const snapshot = (overrides: Partial<AuditSnapshot> = {}): AuditSnapshot => ({
  id: 1, officialGameId: "1", officialTeamId: "10", officialOpponentTeamId: "20",
  officialPlayerId: "100", teamSide: "HOME", scheduledFirstPitch: cutoff,
  featureCutoff: cutoff, observedAt: new Date("2026-09-05T18:00:00.000Z"),
  starterState: "PROBABLE_PREGAME", identityState: "OFFICIAL_ID", identityConfidence: "HIGH",
  starterName: "Pitcher", metricsState: "IDENTITY_ONLY", metricsThroughTime: null,
  starterPitMetrics: {}, recentWorkload: {}, pitSafe: true, rawGamePayload: {},
  rawGamePayloadHash: "a".repeat(64),
  evidenceStateHash: "b".repeat(64), evidenceChecksum: "c".repeat(64), ...overrides,
});

const inputs = (): AuditInputs => ({
  generatedAt: new Date("2026-09-05T19:00:00.000Z"),
  snapshots: [
    snapshot(),
    snapshot({ id: 2, officialTeamId: "20", officialOpponentTeamId: "10",
      officialPlayerId: "200", teamSide: "AWAY" }),
  ],
  games: [{
    providerGameId: "1", gameStatus: "Final", outcomeEligible: true, homeRuns: 3, awayRuns: 2,
    homeProviderTeamId: "10", awayProviderTeamId: "20", homeTeamName: "Home",
    awayTeamName: "Away", venueName: "Park",
  }],
  teamDirectory: [{ teamId: "10", name: "Home" }, { teamId: "20", name: "Away" }],
  snapshotVerification: { verified: 2, total: 2 },
  verificationLedger: { checks: [{ name: "Focused", status: "PASS" }] },
  separationAudit: { actualOnlyPregameRows: 0, postOrEqualCutoffRows: 0, outcomeRowsForTargetGames: 2, pregameOutcomeFieldPaths: [] },
  targetAppearances: [
    { providerGameId: "1", providerPitcherId: "100", canonicalTeamId: "10", starterFlagActual: true,
      inningsPitched: 6, battersFaced: 22, pitchCount: 90, runsAllowed: 2, earnedRuns: 2,
      hitsAllowed: 5, walks: 1, strikeouts: 7, homeRunsAllowed: 1, appearanceCompletionTime: new Date("2026-09-05T23:00:00Z") },
    { providerGameId: "1", providerPitcherId: "200", canonicalTeamId: "20", starterFlagActual: true,
      inningsPitched: 5, battersFaced: 20, pitchCount: 80, runsAllowed: 3, earnedRuns: 3,
      hitsAllowed: 6, walks: 2, strikeouts: 5, homeRunsAllowed: 1, appearanceCompletionTime: new Date("2026-09-05T23:00:00Z") },
  ],
  bullpenGameIds: ["1"], offenseGameSides: ["1\u0000HOME", "1\u0000AWAY"],
  disposition: {
    disposition: "RESEARCH_FAILED_NOT_COMPETITIVE", oosUse: "HISTORICAL_BENCHMARK_ONLY",
    checksumValid: true,
    artifactReferences: {
      oosOpened: true, openedByModel: "224c-v3-cadb433dbbd7",
      futureUse: "HISTORICAL_BENCHMARK_ONLY", oosForecastCount: 2012,
    },
  },
  operational: {
    runsAttempted: 1, successfulRuns: 1, failedRuns: 0, sourceErrors: 0, timeouts: 0,
    rateLimits: 0, duplicateInsertAttempts: 0, newInserts: 0, unchangedGames: 13,
    afterCutoffGames: 2, invalidRowsRejected: 0, runtime: "unknown", sourceCalls: "one",
    storageBytes: 100, oomEvidence: "observed",
  },
});

describe("MLB #224C-1B prospective completeness audit", () => {
  it("selects the deterministic latest snapshot strictly before both cutoffs", () => {
    const rows = [
      snapshot({ id: 1, observedAt: new Date("2026-09-05T17:00:00Z") }),
      snapshot({ id: 2, observedAt: new Date("2026-09-05T19:00:00Z") }),
      snapshot({ id: 3, observedAt: cutoff }),
      snapshot({ id: 4, observedAt: new Date("2026-09-05T19:30:00Z"), pitSafe: false }),
    ];
    expect(latestSafePregameSnapshot(rows, cutoff)?.id).toBe(2);
  });

  it("defines state coverage without inventing rookie or strong state", () => {
    expect(starterStateClass(snapshot())).toBe("IDENTITY_ONLY");
    expect(starterStateClass(snapshot({ metricsState: "BASIC_STATE" }))).toBe("IDENTITY_ONLY");
    expect(starterStateClass(snapshot({ metricsState: "BASIC_STATE", metricsThroughTime: new Date("2026-09-05T19:00:00Z") }))).toBe("BASIC_STATE");
    expect(starterStateClass(snapshot({ metricsState: "STRONG_STATE", metricsThroughTime: new Date("2026-09-05T19:00:00Z") }))).toBe("STRONG_STATE");
    expect(starterStateClass(snapshot({ officialPlayerId: null }))).toBe("INSUFFICIENT_STATE");
  });

  it("keeps actual outcomes separate from immutable pregame snapshots", () => {
    const source = inputs();
    const evidenceBefore = JSON.stringify(source.snapshots);
    const first = buildMlb224C1BReport(source);
    source.targetAppearances[0]!.providerPitcherId = "late-actual-change";
    const second = buildMlb224C1BReport(source);
    expect(JSON.stringify(source.snapshots)).toBe(evidenceBefore);
    expect(first.artifactHash).not.toBe(second.artifactHash);
    expect(source.snapshots[0]!.officialPlayerId).toBe("100");
  });

  it("hard-fails market leakage and an invalid opened-OOS disposition", () => {
    expect(marketLeakagePaths({ nested: { moneyline: -120 } })).toEqual(["$.nested.moneyline"]);
    const market = inputs();
    market.snapshots[0]!.starterPitMetrics = { moneyline: -120 };
    expect(() => buildMlb224C1BReport(market)).toThrow(/HARD FAILURE.*market/);
    const oos = inputs();
    oos.disposition!.artifactReferences = { oosForecastCount: 2012 };
    expect(() => buildMlb224C1BReport(oos)).toThrow(/HARD FAILURE.*disposition/);
  });

  it("hard-fails actual-only and target-performance leakage in pregame inputs", () => {
    expect(pregameOutcomeLeakagePaths({ finalScore: 7 })).toEqual(["$.finalScore"]);
    const actualOnly = inputs();
    actualOnly.separationAudit.actualOnlyPregameRows = 1;
    expect(() => buildMlb224C1BReport(actualOnly)).toThrow(/HARD FAILURE.*PIT/);
    const target = inputs();
    target.separationAudit.pregameOutcomeFieldPaths = ["$.starterPitMetrics.pitchCount"];
    expect(() => buildMlb224C1BReport(target)).toThrow(/HARD FAILURE.*PIT/);
  });

  it("audits superseded snapshots for market and future-information leakage", () => {
    const market = inputs();
    market.snapshots.unshift(snapshot({
      id: 0,
      observedAt: new Date("2026-09-05T17:00:00.000Z"),
      starterPitMetrics: { moneyline: -120 },
    }));
    expect(() => buildMlb224C1BReport(market)).toThrow(/HARD FAILURE.*market/);

    const future = inputs();
    future.snapshots.unshift(snapshot({
      id: 0,
      observedAt: new Date("2026-09-05T17:00:00.000Z"),
      metricsState: "BASIC_STATE",
      metricsThroughTime: cutoff,
    }));
    expect(() => buildMlb224C1BReport(future)).toThrow(/HARD FAILURE.*PIT/);
  });

  it("builds exactly 36 deterministic JSON and Markdown sections", () => {
    const first = buildMlb224C1BReport(inputs());
    const second = buildMlb224C1BReport(inputs());
    expect(first).toEqual(second);
    expect(first.sections).toHaveLength(36);
    expect(first.sections.map((section) => section.number)).toEqual(
      Array.from({ length: 36 }, (_, index) => index + 1));
    expect(renderMlb224C1BMarkdown(first).match(/^## \d+\. /gm)).toHaveLength(36);
    expect(first.classification).toBe("C — PROSPECTIVE PIPELINE PARTIAL");
    expect(first.sections[30]?.data).toEqual(inputs().verificationLedger);
    expect((first.sections[1]?.data as { persistedRowVerification: unknown }).persistedRowVerification)
      .toEqual({ numerator: 2, denominator: 2, percentage: 100 });
  });
});