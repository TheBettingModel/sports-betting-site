import { describe, expect, it } from "vitest";
import { isAuthoritativeNcaafFinal, verifyFrozenFbsVsFbsDomain } from "./ncaafV4ProspectiveContinuation";
import type { NcaafV4FrozenProspectivePrediction } from "./ncaafV4ProspectiveEvaluation";

const prediction = {
  gameId: "espn:NCAAF-1", cfbdHomeTeamId: "10", cfbdAwayTeamId: "20",
} as NcaafV4FrozenProspectivePrediction;

describe("NCAAF V4 prospective continuation guards", () => {
  it("requires every frozen prediction to remain inside the proven FBS universe", () => {
    expect(verifyFrozenFbsVsFbsDomain([prediction], new Set(["10", "20"]), 2))
      .toEqual({ frozenFbsIds: 2, verifiedPredictions: 1 });
    expect(() => verifyFrozenFbsVsFbsDomain([prediction], new Set(["10"]), 1)).toThrow(/Out-of-domain/);
    expect(() => verifyFrozenFbsVsFbsDomain([prediction], new Set(["10", "20"]), 3)).toThrow(/universe mismatch/);
  });
  it("accepts only observed ESPN finals captured after kickoff with complete scores", () => {
    const final = {
      provider: "espn", evidenceStatus: "observed", gameStatus: "final", payloadHash: "hash",
      homeScore: 31, awayScore: 24, kickoffAt: new Date("2026-09-04T22:30:00Z"),
      capturedAt: new Date("2026-09-05T02:00:00Z"),
    };
    expect(isAuthoritativeNcaafFinal(final)).toBe(true);
    expect(isAuthoritativeNcaafFinal({ ...final, provider: "other" })).toBe(false);
    expect(isAuthoritativeNcaafFinal({ ...final, evidenceStatus: "missing" })).toBe(false);
    expect(isAuthoritativeNcaafFinal({ ...final, gameStatus: "live" })).toBe(false);
    expect(isAuthoritativeNcaafFinal({ ...final, homeScore: null })).toBe(false);
    expect(isAuthoritativeNcaafFinal({ ...final, capturedAt: new Date("2026-09-04T21:00:00Z") })).toBe(false);
  });
});