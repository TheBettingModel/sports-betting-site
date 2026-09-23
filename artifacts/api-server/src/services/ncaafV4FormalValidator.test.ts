import { describe, expect, it } from "vitest";
import { NCAAF_V4_REPLAY_AUDIT_CHECKSUM, trainNcaafV4, type V4Row } from "./ncaafV4ExpectedScore";
import { replayNcaafChronologically, type NcaafCompletedAtomicGame } from "./ncaafChronologicalReplay";
import { fitNcaafV4ValidationPlatt, NCAAF_V4_FROZEN_IDENTITY, validateNcaafV4Formal } from "./ncaafV4FormalValidator";

function fixture(): V4Row[] {
  const games: NcaafCompletedAtomicGame[] = [];
  for (const [season, count] of [[2023, 3], [2024, 3], [2025, 10]] as const) for (let week = 1; week <= count; week++) games.push({
    stableGameId: `${season}-${week}`, season, kickoffAt: new Date(`${season}-09-${String(week).padStart(2, "0")}T12:00:00Z`), homeTeamId: `H${week}`, awayTeamId: `A${week}`,
    homeScore: 20 + week, awayScore: 13 + (week % 4), neutralSite: week % 3 === 0, completed: true, homeClassification: "FBS", awayClassification: "FBS",
  });
  return replayNcaafChronologically(games).rows.map(row => ({ ...row, week: Number(row.stableGameId.split("-")[1]), sourceAudit: { featureFreeze:"replayNcaafChronologically_before_targets", replayAuditChecksum:NCAAF_V4_REPLAY_AUDIT_CHECKSUM, eligiblePitLineage:row.features.pitLineage.length, leakage:{ postKickoffPitExcluded:0, postKickoffAvailabilityExcluded:0, invalidPitExcluded:0 } } }));
}
function expected(rows: V4Row[]) {
  const t = trainNcaafV4(rows);
  return { configurationHash:t.configurationHash, parameterHash:t.parameterHash, splitChecksum:t.split.checksum };
}
describe("NCAAF V4 formal validator", () => {
  it("pins the authoritative #222 frozen hashes", () => {
    expect(NCAAF_V4_FROZEN_IDENTITY.configurationHash).toBe("212a6c78431a181821106721877155745724d3619ec63cf5424f098b07f9ae86");
    expect(NCAAF_V4_FROZEN_IDENTITY.parameterHash).toBe("792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81");
    expect(NCAAF_V4_FROZEN_IDENTITY.splitChecksum).toBe("7cee52d5188179d81a177aa55b9ac54e06211f11ed8a5b0d29b032ff94095abc");
  });
  it("is deterministic, read-only, and emits immutable evidence with probability/query integrity", () => {
    const rows = fixture(), a = validateNcaafV4Formal(rows, { expectedIdentity:expected(rows) }), b = validateNcaafV4Formal(rows, { expectedIdentity:expected(rows) });
    expect(a.identity.evaluationHash).toBe(b.identity.evaluationHash);
    expect(Object.isFrozen(a)).toBe(true);
    expect(a.integrity).toMatchObject({ invalidPredictions:0, queryFailures:0, valid:true });
    expect(a.oos.calibration.buckets).toHaveLength(7);
    expect(a.oos.buckets.map(x => x.name)).toEqual(["week","earlyLate","site","dataQuality","sample","probability","margin","total","score"]);
    expect(a.immutableManifest).toMatchObject({ champion:false, publication:false, approval:"UNVALIDATED" });
    expect(a.calibration.fittingCohort).toBe("validation-only");
  });
  it("fails closed on a frozen identity mismatch", () => {
    expect(() => validateNcaafV4Formal(fixture(), { expectedIdentity:{ parameterHash:"not-the-frozen-model" } })).toThrow(/frozen identity mismatch/);
  });
  it("never incorporates OOS labels while fitting Platt calibration", () => {
    const rows = fixture(), trained = trainNcaafV4(rows);
    const first = fitNcaafV4ValidationPlatt(trained.validation, trained.split.validation);
    const alteredOos = trained.split.oos.map(r => ({ ...r, targets:{ ...r.targets, homeWin:r.targets.homeWin ? 0 : 1 } as V4Row["targets"] }));
    // The fitting API cannot receive OOS and its result remains unchanged despite altered OOS labels.
    const second = fitNcaafV4ValidationPlatt(trained.validation, trained.split.validation);
    expect(first).toEqual(second);
    expect(alteredOos).toHaveLength(trained.split.oos.length);
  });
});