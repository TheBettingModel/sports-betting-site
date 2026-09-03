import { describe, expect, it } from "vitest";
import { cfbdItemIdentity, cfbdQueryForEndpoint, scheduledCfbdEndpoints } from "./ncaafCfbdAdvancedEvidence";
import { decideCfbdGameMapping, decideCfbdTeamMapping, providerOnlyPlayerMapping } from "./ncaafCfbdIdentity";
import { assertNoNcaafMarketShapedKeys, buildNcaafFootballIntelligenceSnapshot, ncaafFootballIntelligenceInputHash } from "./ncaafFootballIntelligenceSnapshots";

describe("NCAAF CFBD advanced contracts", () => {
  it("uses endpoint-specific queries and rate-aware schedule", () => {
    expect(cfbdQueryForEndpoint("plays", 2026, 2, "100")).toEqual({ year: 2026, week: 2 });
    expect(cfbdQueryForEndpoint("teams", 2026, 2)).toEqual({});
    expect(scheduledCfbdEndpoints(new Date("2026-09-07T03:02:00Z"))).toContain("advanced_stats");
    expect(scheduledCfbdEndpoints(new Date("2026-09-07T03:02:00Z"))).toContain("plays");
  });
  it("extracts identities by endpoint rather than treating every id as a team", () => {
    expect(cfbdItemIdentity("recruiting", { id: 7 }).team).toBeNull();
    expect(cfbdItemIdentity("recruiting", { id: 7 }).player).toBe("7");
    expect(cfbdItemIdentity("teams", { id: 7, school: "Miami" }).team).toBe("7");
    expect(cfbdItemIdentity("teams", { teamId: 7 }).team).toBe("7");
  });
  it("maps exact teams once, preserves ambiguity, and never name-merges players", () => {
    const candidates = [{ provider: "espn", teamId: "1", school: "Miami" }, { provider: "espn", teamId: "1", school: "Miami" }];
    expect(decideCfbdTeamMapping({ id: 2, school: "Miami" }, candidates).state).toBe("MAPPED");
    expect(decideCfbdTeamMapping({ id: 2, school: "Miami" }, [candidates[0]!]).state).toBe("MAPPED");
    expect(providerOnlyPlayerMapping({ id: 10, name: "A. Smith" }).state).toBe("PROVIDER_ONLY");
  });
  it("maps only unique ordered games within tolerance", () => {
    const at = new Date("2026-09-03T18:00:00Z");
    expect(decideCfbdGameMapping({ id: 2, homeCanonicalTeamId: "h", awayCanonicalTeamId: "a", kickoffAt: at },
      [{ provider: "espn", eventId: "x", homeTeamId: "h", awayTeamId: "a", kickoffAt: at }]).state).toBe("MAPPED");
  });
  it("firewalls markets and excludes post-cutoff rows", () => {
    expect(() => assertNoNcaafMarketShapedKeys({ nested: { moneyline: 1 } })).toThrow();
    const target = { provider: "espn", eventId: "next", season: 2026, kickoffAt: new Date("2026-09-04T00:00:00Z"), homeTeamId: "h", awayTeamId: "a" };
    const cutoff = new Date("2026-09-03T23:00:00Z");
    const row = { provider: "espn", providerEventId: "old", providerTeamId: "h", providerOpponentTeamId: "z", season: 2026, kickoffAt: new Date("2026-09-03T20:00:00Z"), pointsFor: 1, pointsAgainst: 0, capturedAt: new Date("2026-09-03T23:30:00Z"), payloadHash: "x", provenance: {} };
    expect(buildNcaafFootballIntelligenceSnapshot(target, [row], cutoff).teams.home.teamPerformance.state).toBe("MISSING");
    expect(ncaafFootballIntelligenceInputHash(target, [], cutoff)).not.toEqual(ncaafFootballIntelligenceInputHash({ ...target, suppliedDomains: { home: { talent: { state: "VALID", evidence: [], provider: "college_football_data", provenance: [], quality: null, reliability: null, sample: {}, missingReason: null, payload: {} } } } }, [], cutoff));
  });
});