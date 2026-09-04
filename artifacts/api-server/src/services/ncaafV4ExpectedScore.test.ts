import { describe, expect, it } from "vitest";
import { auditNcaafV4PitAndMarket, compareNcaafV4Candidates, evaluateNcaafV4, fairAmericanOdds, NCAAF_V4_REPLAY_AUDIT_CHECKSUM, splitNcaafV4Chronologically, trainNcaafV4, type V4Row } from "./ncaafV4ExpectedScore";
import { replayNcaafChronologically, type NcaafCompletedAtomicGame } from "./ncaafChronologicalReplay";

function rows(): V4Row[] {
  const games: NcaafCompletedAtomicGame[] = [];
  for (const [season, weeks] of [[2023, 2], [2024, 2], [2025, 9]] as const) for (let week = 1; week <= weeks; week++) games.push({
    stableGameId: `${season}-${week}`, season, kickoffAt: new Date(`${season}-09-${String(week).padStart(2, "0")}T12:00:00Z`), homeTeamId: "H", awayTeamId: "A",
    homeScore: 24 + week, awayScore: 14 + week, neutralSite: week === 2, completed: true, homeClassification: "FBS", awayClassification: "FBS",
  });
  return replayNcaafChronologically(games).rows.map((row) => ({
    ...row,
    week: Number(row.stableGameId.split("-")[1]),
    sourceAudit: {
      featureFreeze: "replayNcaafChronologically_before_targets",
      replayAuditChecksum: NCAAF_V4_REPLAY_AUDIT_CHECKSUM,
      eligiblePitLineage: row.features.pitLineage.length,
      leakage: {
        postKickoffPitExcluded: 0,
        postKickoffAvailabilityExcluded: 0,
        invalidPitExcluded: 0,
      },
    },
  }));
}
describe("NCAAF V4 expected-score challenger", () => {
  it("uses a frozen chronological split and deterministic sports-only forecast", () => {
    const input = rows(); const split = splitNcaafV4Chronologically(input);
    expect([split.training.length, split.validation.length, split.oos.length]).toEqual([4, 7, 2]);
    const first = trainNcaafV4(input), second = trainNcaafV4(input);
    const a = first.oos[0]!, b = second.oos[0]!;
    expect(a.predictionId).toBe(b.predictionId);
    expect(a.expectedMargin).toBeCloseTo(a.expectedHomePoints - a.expectedAwayPoints);
    expect(a.expectedTotal).toBeCloseTo(a.expectedHomePoints + a.expectedAwayPoints);
    expect(a.homeWinProbability + a.awayWinProbability).toBeCloseTo(1);
    expect(a.probabilityHomeCovers(0)).toBeGreaterThan(0);
    expect(a.probabilityHomeCovers(-3.5) + a.probabilityAwayCovers(3.5)).toBeCloseTo(1);
    expect(a.probabilityOver(50)).toBeGreaterThanOrEqual(0);
    expect(first.immutableManifest).toMatchObject({ approval: "UNVALIDATED", champion: false, publication: false, compatibility2026: "PARTIAL", generated2026Predictions: 0 });
    expect(first.audit).toMatchObject({ marketLeakage: 0, postKickoffEvidence: 0 });
  });
  it("compares declared baselines and candidates only on validation", () => {
    const input = rows(), compared = compareNcaafV4Candidates(input), result = trainNcaafV4(input);
    expect(compared.baselines.map(x => x.name)).toHaveLength(4);
    expect(compared.candidates.map(x => x.name)).toEqual(["simple-expected-score-linear", "ridge-score-4", "ridge-score-8"]);
    expect(result.oosMetrics.count).toBe(2);
    expect(evaluateNcaafV4(result.validation, result.split.validation).count).toBe(7);
    expect(auditNcaafV4PitAndMarket(input).marketLeakage).toBe(0);
  });
  it("rejects undeclared week and returns fair model odds", () => {
    expect(() => splitNcaafV4Chronologically(rows().map((r, i) => i ? r : { ...r, week: 0 }))).toThrow(/declared positive week/);
    expect(fairAmericanOdds(.5)).toBe(-100);
    expect(fairAmericanOdds(.25)).toBe(300);
  });
  it("counts same-game and future-game lineage instead of assuming zero", () => {
    const input = rows();
    const kickoff = new Date(input[0]!.kickoffAt);
    const leaked = {
      ...input[0]!,
      lineageOrigins: {
        "evidence-1": {
          gameId: input[0]!.stableGameId,
          season: input[0]!.season,
          effectiveAt: new Date(kickoff.getTime() - 1).toISOString(),
        },
      },
      features: {
        ...input[0]!.features,
        pitLineage: [{
          source: "cfbd",
          sourceId: "evidence-1",
          pitClass: "B" as const,
          effectiveAt: new Date(kickoff.getTime() - 1),
          capturedAt: new Date(kickoff.getTime() - 1),
        }],
      },
    };
    expect(auditNcaafV4PitAndMarket([leaked, ...input.slice(1)])).toMatchObject({
      sameGameLeakage: 1,
      futureGameLeakage: 1,
    });
  });
  it("rejects missing or checksum-mismatched replay proof", () => {
    const input = rows();
    const missing = { ...input[0]!, sourceAudit: undefined } as unknown as V4Row;
    expect(() => trainNcaafV4([missing, ...input.slice(1)])).toThrow(/PIT\/market audit failed/);
    const mismatch = {
      ...input[0]!,
      sourceAudit: { ...input[0]!.sourceAudit, replayAuditChecksum: "wrong" },
    };
    expect(() => trainNcaafV4([mismatch, ...input.slice(1)])).toThrow(/PIT\/market audit failed/);
  });
});