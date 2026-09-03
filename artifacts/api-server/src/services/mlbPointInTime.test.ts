import { describe, expect, it } from "vitest";
import {
  assertPregameEvidence, calculateResidual, evaluateProbability, evidenceHash, noVig,
  buildLeagueRunEnvironment,
  classifyMlbResearchMarketQuality,
  selectLatestEligibleMlbClosing,
} from "./mlbPointInTime";

describe("MLB PIT pure contract", () => {
  const start = new Date("2026-09-03T19:00:00Z");
  const cutoff = new Date("2026-09-03T18:00:00Z");
  it("uses stable hashes and never converts missing values to zero", () => {
    expect(evidenceHash({ b: 2, a: 1 })).toBe(evidenceHash({ a: 1, b: 2 }));
    expect(calculateResidual(null, 2)).toBeNull();
    expect(calculateResidual(2, null)).toBeNull();
  });
  it("rejects post-cutoff and post-start evidence", () => {
    expect(() => assertPregameEvidence({ retrievedAt: new Date("2026-09-03T18:01:00Z"), cutoff, gameStart: start })).toThrow();
    expect(() => assertPregameEvidence({ retrievedAt: cutoff, effectiveAt: start, cutoff, gameStart: start })).toThrow();
  });
  it("keeps probability evaluation bounded and separate from market", () => {
    const result = evaluateProbability(.6, true, .55);
    expect(result.brier).toBeCloseTo(.16);
    expect(result.marketBrier).toBeCloseTo(.2025);
    expect(noVig(-110, -110)).toEqual({ home: .5, away: .5 });
  });
  it("excludes future completions from chronological league windows", () => {
    const ledger = buildLeagueRunEnvironment([
      { completedAt: new Date("2026-09-01T01:00:00Z"), homeRuns: 6, awayRuns: 4 },
      { completedAt: new Date("2026-09-03T19:01:00Z"), homeRuns: 99, awayRuns: 99 },
    ], start, "last_7d");
    expect(ledger.sampleGames).toBe(1);
    expect(ledger.runsPerTeamGame).toBe(5);
  });
  it("selects only a non-stale closing observation after decision and before start", () => {
    const choice = selectLatestEligibleMlbClosing([
      { capturedAt: new Date("2026-09-03T17:00:00Z"), price: -110, isAvailable: true, isStale: false, marketStatus: "open" },
      { capturedAt: new Date("2026-09-03T18:30:00Z"), price: -130, isAvailable: true, isStale: false, marketStatus: "open" },
      { capturedAt: new Date("2026-09-03T18:45:00Z"), price: -140, isAvailable: true, isStale: true, marketStatus: "open" },
      { capturedAt: new Date("2026-09-03T19:01:00Z"), price: -150, isAvailable: true, isStale: false, marketStatus: "open" },
    ], cutoff, start);
    expect(choice?.price).toBe(-130);
  });
  it("classifies late-market capture without feeding any sports feature", () => {
    expect(classifyMlbResearchMarketQuality({ capturedAt: new Date("2026-09-03T18:45:00Z"), gameStart: start, homeOdds: -110, awayOdds: -110 })).toBe("VALID");
    expect(classifyMlbResearchMarketQuality({ capturedAt: new Date("2026-09-03T16:00:00Z"), gameStart: start, homeOdds: -110, awayOdds: -110 })).toBe("STALE");
    expect(classifyMlbResearchMarketQuality({ capturedAt: start, gameStart: start, homeOdds: -110, awayOdds: -110 })).toBe("UNAVAILABLE");
  });
});