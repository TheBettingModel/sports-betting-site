import { describe, expect, it } from "vitest";
import { replayNcaafChronologically, type NcaafCompletedAtomicGame } from "./ncaafChronologicalReplay";
import { NCAAF_V4_REPLAY_AUDIT_CHECKSUM, type V4Row } from "./ncaafV4ExpectedScore";
import { NCAAF_V4_CANONICAL_BASELINE_D, pairedBootstrapClassification, trainNcaafV4DistinctChallenger } from "./ncaafV4DistinctChallenger";

function rows(): V4Row[] {
  const games: NcaafCompletedAtomicGame[] = [];
  for (const [season, weeks] of [[2023, 8], [2024, 8], [2025, 10]] as const) for (let week = 1; week <= weeks; week++) games.push({
    stableGameId: `${season}-${week}`, season, kickoffAt: new Date(`${season}-09-${String(week).padStart(2, "0")}T12:00:00Z`),
    homeTeamId: week % 2 ? "H" : "X", awayTeamId: week % 2 ? "A" : "Y", homeScore: 20 + week * 2, awayScore: 14 + week,
    neutralSite: week === 2, completed: true, homeClassification: "FBS", awayClassification: "FBS",
  });
  return replayNcaafChronologically(games).rows.map(row => ({ ...row, week: Number(row.stableGameId.split("-")[1]), sourceAudit: { featureFreeze: "replayNcaafChronologically_before_targets", replayAuditChecksum: NCAAF_V4_REPLAY_AUDIT_CHECKSUM, eligiblePitLineage: row.features.pitLineage.length, leakage: { postKickoffPitExcluded: 0, postKickoffAvailabilityExcluded: 0, invalidPitExcluded: 0 } } }));
}
describe("#222B distinct NCAAF challenger", () => {
  it("freezes the canonical final-distribution Baseline D, explaining table probabilities", () => {
    expect(NCAAF_V4_CANONICAL_BASELINE_D.oos.brier).toBeCloseTo(.18002337158123566);
    expect(NCAAF_V4_CANONICAL_BASELINE_D.tableProbabilityMetrics.brier).toBeCloseTo(.17828391985262818);
    expect(NCAAF_V4_CANONICAL_BASELINE_D.probabilityReconciliation).toMatch(/fixed normal margin sigma=14/);
  });
  it("uses expanded PIT-safe features, validation-only selection, and reproducible frozen output", () => {
    const input = rows(), first = trainNcaafV4DistinctChallenger(input), second = trainNcaafV4DistinctChallenger(input);
    expect(first.candidates).toHaveLength(6);
    expect(first.split.training).toHaveLength(16);
    expect(first.split.validation).toHaveLength(7);
    expect(first.split.oos).toHaveLength(3);
    expect(first.frozen).toEqual(second.frozen);
    expect(first.predictions.oosRaw.map(x => x.gameId)).toEqual(second.predictions.oosRaw.map(x => x.gameId));
    expect(first.immutableManifest).toMatchObject({ approval: "UNVALIDATED", champion: false, publication: false, oosUntouchedDuringSelection: true });
    expect(first.audit).toMatchObject({ sameGameLeakage: 0, futureGameLeakage: 0, marketLeakage: 0 });
    expect(first.validation.stability.dimensions.map(x => x.name)).toEqual(["week", "earlyLater", "site", "dataQuality", "probabilityBand", "sampleCountBand"]);
    expect(first.selectionRationale.selectedByValidationOnly).toBe(true);
  });
  it("has deterministic paired-bootstrap uncertainty classification", () => {
    const run = trainNcaafV4DistinctChallenger(rows());
    expect(pairedBootstrapClassification(run.predictions.oosRaw, run.predictions.oosRaw, run.split.oos)).toEqual(
      pairedBootstrapClassification(run.predictions.oosRaw, run.predictions.oosRaw, run.split.oos),
    );
  });
});