import { describe, expect, it } from "vitest";
import { computeWnbaTeamInjuryImpact, computeWnbaInjuryAdvantage } from "./wnbaInjuries";

describe("WNBA injury evidence", () => {
  it("keeps provider uncertainty explicit and bounds the adjustment", () => {
    const impact = computeWnbaTeamInjuryImpact([{
      status: "Out",
      comment: "Left knee",
      athlete: { id: "42", displayName: "Player", position: { abbreviation: "C" } },
    }]);
    expect(impact.players?.[0]).toMatchObject({
      athleteId: "42", expectedAvailabilityProbability: 0,
      expectedMinutesLost: null, role: "unknown", minutesRestriction: "unknown",
    });
    expect(impact.impactScore).toBeLessThan(0);
    expect(computeWnbaInjuryAdvantage({ impactScore: 0, keyInjuries: [] }, impact)).toBeLessThanOrEqual(0);
  });
});