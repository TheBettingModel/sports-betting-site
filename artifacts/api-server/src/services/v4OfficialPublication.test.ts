import { describe, expect, it } from "vitest";
import { rankOfficialV4Candidates } from "./v4OfficialPublication";
import type { CanonicalV4Forecast } from "./v4Platform";

function forecast(id: string, approvalState: CanonicalV4Forecast["approvalState"] = "PRODUCTION_APPROVED"): CanonicalV4Forecast {
  return {
    predictionId: id, sport: "NFL", gameId: `game-${id}`, modelFamily: "test", modelId: "nfl-v4",
    modelVersion: "4.0.0", artifactId: "artifact-id", artifactHash: "artifact",
    inputContractVersion: "contract-v4", configurationHash: "configuration", parameterHash: "parameters", contractId: "contract",
    contractHash: "contract-hash", featureSnapshotId: "snapshot", featureHash: "features", inputHash: "features",
    dataCutoff: "2026-01-01T00:00:00.000Z", predictionTimestamp: "2026-01-01T01:00:00.000Z",
    approvalState, maturity: "MATURE", homeWinProbability: 0.6, awayWinProbability: 0.4,
    evidenceTier: "PIT", qualityFlags: [],
  };
}

describe("rankOfficialV4Candidates", () => {
  it("selects exactly one server-authoritative TOP_PLAY and flat 1U", () => {
    const decisions = rankOfficialV4Candidates([
      { forecast: forecast("second"), exactApproval: true, publicationEligible: true, rankScore: 2 },
      { forecast: forecast("top"), exactApproval: true, publicationEligible: true, rankScore: 3 },
    ]);
    expect(decisions).toEqual([
      expect.objectContaining({ predictionId: "second", role: "QUALIFIED_PLAY", rank: 2, units: 1 }),
      expect.objectContaining({ predictionId: "top", role: "TOP_PLAY", rank: 1, units: 1 }),
    ]);
  });

  it("fails closed when exact approval or a publication safety gate is absent", () => {
    const decisions = rankOfficialV4Candidates([
      { forecast: forecast("approval"), exactApproval: false, publicationEligible: true, rankScore: 4 },
      { forecast: forecast("safety"), exactApproval: true, publicationEligible: false, rankScore: 3 },
      { forecast: forecast("state", "PROVISIONAL"), exactApproval: true, publicationEligible: true, rankScore: 2 },
    ]);
    expect(decisions.map(({ role, rank, units, failureReason }) => ({ role, rank, units, failureReason }))).toEqual([
      { role: "PROJECTION", rank: null, units: 0, failureReason: "EXACT_V4_APPROVAL_MISSING" },
      { role: "PROJECTION", rank: null, units: 0, failureReason: "V4_PUBLICATION_SAFETY_GATE_BLOCKED" },
      { role: "PROJECTION", rank: null, units: 0, failureReason: "V4_NOT_PRODUCTION_APPROVED" },
    ]);
  });
});