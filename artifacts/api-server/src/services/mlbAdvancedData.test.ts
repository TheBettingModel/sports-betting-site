import { describe, expect, it } from "vitest";
import {
  aggregateLineupResearch, assertAdvancedPitEvidence, bullpenAvailabilityResearch,
  sampleReliability, supportedMetricValues,
} from "./mlbAdvancedData";

const player = (id: number) => ({ canonicalPlayerId: id, provider: "mlb_stats_api", providerPlayerId: String(id) });
const cutoff = new Date("2026-09-03T18:00:00Z");
const start = new Date("2026-09-03T19:00:00Z");

describe("MLB advanced research boundary", () => {
  it("keeps provider missing values missing and separately grades sample support", () => {
    expect(supportedMetricValues({ era: 3.2 }, ["era", "xera"])).toEqual({
      values: { era: 3.2, xera: null }, missingFields: ["xera"],
    });
    expect(sampleReliability(310)).toBe("HIGH");
    expect(sampleReliability(10)).toBe("VERY_LOW");
    expect(sampleReliability(null)).toBe("UNKNOWN");
  });

  it("requires provider-mapped player identity and rejects target/future leakage", () => {
    expect(() => assertAdvancedPitEvidence({
      domain: "hitter_conventional", provider: "mlb_stats_api", player: { ...player(1), providerPlayerId: "" },
      retrievedAt: cutoff, cutoff, gameStart: start, qualityState: "VALID", historicalAvailability: "PARTIAL_HISTORICAL_PIT", values: {}, rawPayload: {},
    })).toThrow(/mapping/);
    expect(() => assertAdvancedPitEvidence({
      domain: "hitter_conventional", provider: "mlb_stats_api", retrievedAt: cutoff, cutoff, gameStart: start,
      statThroughAt: new Date("2026-09-03T18:01:00Z"), qualityState: "VALID", historicalAvailability: "PARTIAL_HISTORICAL_PIT", values: {}, rawPayload: {},
    })).toThrow(/stat-through/);
    expect(() => assertAdvancedPitEvidence({
      domain: "hitter_conventional", provider: "mlb_stats_api", retrievedAt: cutoff, cutoff, gameStart: start,
      targetGameProviderId: "1", includedGameIds: ["1"], qualityState: "VALID", historicalAvailability: "PARTIAL_HISTORICAL_PIT", values: {}, rawPayload: {},
    })).toThrow(/excluded/);
  });

  it("aggregates only mapped, ordered, finite lineup evidence", () => {
    const aggregate = aggregateLineupResearch([
      { player: player(1), battingOrder: 1, metrics: { woba: .400 } },
      { player: player(2), battingOrder: 9, metrics: { woba: .300 } },
      { player: player(3), battingOrder: null, metrics: { woba: .999 } },
    ], ["woba"]);
    expect(aggregate.values.woba).toBeCloseTo(.39);
    expect(aggregate.coverage.woba).toEqual({ knownPlayers: 2, totalPlayers: 3 });
  });

  it("never includes appearances at or after cutoff in bullpen availability", () => {
    const output = bullpenAvailabilityResearch([
      { player: player(7), appearanceAt: new Date("2026-09-03T10:00:00Z"), pitches: 31 },
    ], cutoff);
    expect(output[0]?.availabilityState).toBe("UNAVAILABLE");
    expect(() => bullpenAvailabilityResearch([
      { player: player(7), appearanceAt: cutoff, pitches: 10 },
    ], cutoff)).toThrow(/future bullpen/);
  });
});