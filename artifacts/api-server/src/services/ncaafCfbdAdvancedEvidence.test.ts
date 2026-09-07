import { describe, expect, it } from "vitest";
import {
  CFBD_ADVANCED_ENDPOINT_PRIORITY, cfbdEndpointDue, cfbdItemIdentity, cfbdQueryForEndpoint,
  prioritizedCfbdEndpoints, scheduledCfbdEndpoints,
} from "./ncaafCfbdAdvancedEvidence";
import { decideCfbdGameMapping, decideCfbdTeamMapping, normalizeNcaafSchoolIdentity, providerOnlyPlayerMapping } from "./ncaafCfbdIdentity";
import { assertNoNcaafMarketShapedKeys, buildNcaafFootballIntelligenceSnapshot, ncaafFootballIntelligenceInputHash } from "./ncaafFootballIntelligenceSnapshots";

describe("NCAAF CFBD advanced contracts", () => {
  it("uses endpoint-specific queries and a success-based schedule", () => {
    expect(cfbdQueryForEndpoint("plays", 2026, 2, "100")).toEqual({ year: 2026, week: 2 });
    expect(cfbdQueryForEndpoint("teams", 2026, 2)).toEqual({});
    expect(scheduledCfbdEndpoints(new Date("2026-09-07T03:02:00Z"))).toContain("advanced_stats");
    expect(scheduledCfbdEndpoints(new Date("2026-09-07T03:02:00Z"))).toContain("plays");
    expect(cfbdEndpointDue("teams", new Date("2026-09-07T17:00:00Z"), new Date("2026-09-07T01:00:00Z"))).toBe(false);
    expect(cfbdEndpointDue("teams", new Date("2026-09-07T17:00:00Z"), new Date("2026-09-06T23:59:00Z"))).toBe(true);
    expect(cfbdEndpointDue("advanced_stats", new Date("2026-09-13T23:00:00Z"), new Date("2026-09-07T23:00:00Z"))).toBe(false);
    expect(cfbdEndpointDue("advanced_stats", new Date("2026-09-14T00:00:00Z"), new Date("2026-09-13T23:00:00Z"))).toBe(true);
    expect(scheduledCfbdEndpoints(new Date("2026-09-07T17:00:00Z"), new Map([["teams", new Date("2026-09-07T01:00:00Z")]]))).not.toContain("teams");
  });
  it("activates identity and prior domains first on a fresh installation", () => {
    const at = new Date("2026-09-07T17:00:00Z");
    expect(prioritizedCfbdEndpoints(at)).toEqual(["teams", "sp", "elo", "srs", "fpi"]);
    expect(CFBD_ADVANCED_ENDPOINT_PRIORITY).toEqual([
      "teams",
      "sp", "elo", "srs", "fpi", "talent", "returning_production", "coaches",
      "conferences", "venues", "season_team_stats", "advanced_stats",
      "plays", "roster", "player_stats", "recruiting", "transfers",
    ]);
  });
  it("keeps a failed prior ahead of due large backfills until it succeeds", () => {
    const at = new Date("2026-09-07T17:00:00Z");
    const thisPeriod = new Date("2026-09-07T01:00:00Z");
    const successful = new Map([
      ["teams", thisPeriod], ["elo", thisPeriod], ["srs", thisPeriod], ["fpi", thisPeriod],
      ["talent", thisPeriod], ["returning_production", thisPeriod], ["coaches", thisPeriod],
      ["conferences", thisPeriod], ["venues", thisPeriod],
      ["season_team_stats", thisPeriod], ["advanced_stats", thisPeriod],
    ] as const);
    // sp has only failed (and therefore has no last-success entry), while all
    // high-volume families need their initial backfill.
    expect(prioritizedCfbdEndpoints(at, successful)).toEqual([
      "sp", "plays", "roster", "player_stats", "recruiting",
    ]);
  });
  it("does not let large backfills starve remaining critical priors", () => {
    const at = new Date("2026-09-07T17:00:00Z");
    const thisPeriod = new Date("2026-09-07T01:00:00Z");
    const successful = new Map([
      ["teams", thisPeriod], ["sp", thisPeriod], ["elo", thisPeriod], ["srs", thisPeriod], ["fpi", thisPeriod],
    ] as const);
    expect(prioritizedCfbdEndpoints(at, successful)).toEqual([
      "talent", "returning_production", "coaches", "conferences", "venues",
    ]);
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
  it("uses only curated exact aliases for CFBD and ESPN school names", () => {
    expect(normalizeNcaafSchoolIdentity("Ole Miss", "college_football_data")).toBe("mississippi");
    expect(normalizeNcaafSchoolIdentity("UConn", "espn")).toBe("connecticut");
    expect(normalizeNcaafSchoolIdentity("SMU")).toBe("southern methodist");
    expect(normalizeNcaafSchoolIdentity("UNLV")).toBe("nevada las vegas");
    expect(decideCfbdTeamMapping({ id: "2", school: "Ole Miss" },
      [{ provider: "espn", teamId: "25", school: "Mississippi" }]).canonicalTeamId).toBe("25");
    expect(decideCfbdTeamMapping({ id: "2", school: "Miami" },
      [{ provider: "espn", teamId: "25", school: "Miami (OH)" }]).state).toBe("UNMAPPED");
  });
  it("maps only unique ordered games within tolerance", () => {
    const at = new Date("2026-09-03T18:00:00Z");
    expect(decideCfbdGameMapping({ id: 2, homeCanonicalTeamId: "h", awayCanonicalTeamId: "a", kickoffAt: at },
      [{ provider: "espn", eventId: "x", homeTeamId: "h", awayTeamId: "a", kickoffAt: at }]).state).toBe("MAPPED");
    expect(decideCfbdGameMapping({ id: 2, homeCanonicalTeamId: "h", awayCanonicalTeamId: "a", kickoffAt: new Date("invalid") },
      [{ provider: "espn", eventId: "x", homeTeamId: "h", awayTeamId: "a", kickoffAt: at }]).state).toBe("INVALID");
    expect(decideCfbdGameMapping({ id: 2, homeCanonicalTeamId: "h", awayCanonicalTeamId: "a", kickoffAt: at },
      [{ provider: "espn", eventId: "x", homeTeamId: "h", awayTeamId: "a", kickoffAt: new Date("invalid") }]).state).toBe("UNMATCHED");
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