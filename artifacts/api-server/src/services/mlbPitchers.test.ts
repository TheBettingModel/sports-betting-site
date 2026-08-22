import { describe, expect, it } from "vitest";
import {
  computePitcherAdvantage,
  type PitcherStats,
} from "./mlbPitchers";

function pitcher(overrides: Partial<PitcherStats>): PitcherStats {
  return {
    name: "Starter",
    playerId: 1,
    pitchHand: "R",
    seasonEra: 3.5,
    seasonWhip: 1.15,
    fip: 3.5,
    kPct: 0.25,
    bbPct: 0.08,
    kMinusBbPct: 0.17,
    recentEra: 3.5,
    recentIpAvg: 6,
    seasonIp: 80,
    seasonBattersFaced: 320,
    recentPitchCountAvg: 92,
    recentStartCount: 3,
    ...overrides,
  };
}

describe("MLB starter reliability", () => {
  it("shrinks the same skill gap when either starter has a thin workload sample", () => {
    const established = computePitcherAdvantage({
      home: pitcher({ fip: 2.8, recentEra: 2.9, kMinusBbPct: 0.23 }),
      away: pitcher({ fip: 4.8, recentEra: 4.9, kMinusBbPct: 0.10 }),
    });
    const thinSample = computePitcherAdvantage({
      home: pitcher({
        fip: 2.8,
        recentEra: 2.9,
        kMinusBbPct: 0.23,
        seasonIp: 4,
        seasonBattersFaced: 16,
        recentPitchCountAvg: 58,
        recentStartCount: 1,
      }),
      away: pitcher({ fip: 4.8, recentEra: 4.9, kMinusBbPct: 0.10 }),
    });

    expect(established).toBeGreaterThan(0);
    expect(thinSample).toBeGreaterThan(0);
    expect(thinSample).toBeLessThan(established);
  });
});