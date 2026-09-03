import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@workspace/db")>(),
  db: {
    execute: dbMocks.execute,
    select: dbMocks.select,
  },
}));

import {
  assertNoNcaafMarketShapedKeys,
  buildNcaafFootballIntelligenceSnapshot,
  createNcaafFootballIntelligenceSnapshot,
  NCAAF_FOOTBALL_INTELLIGENCE_SNAPSHOT_SCHEMA_VERSION,
  ncaafFootballIntelligenceInputHash,
  type NcaafIntelligenceTarget,
  type NcaafPerformanceEvidenceRow,
} from "./ncaafFootballIntelligenceSnapshots";

const kickoff = new Date("2025-09-20T16:00:00Z");
const cutoff = new Date("2025-09-20T15:00:00Z");
const target: NcaafIntelligenceTarget = {
  provider: "espn", eventId: "next", season: 2025, week: 3, kickoffAt: kickoff,
  homeTeamId: "home", awayTeamId: "away", venue: { neutralSite: false, name: "Campus Stadium" },
};

function row(team: string, opponent: string, season: number, event: string): NcaafPerformanceEvidenceRow {
  return {
    id: season === 2025 ? 1 : 2, provider: "espn", providerEventId: event, providerTeamId: team,
    providerOpponentTeamId: opponent, season, kickoffAt: new Date(`${season}-09-01T12:00:00Z`),
    pointsFor: 24, pointsAgainst: 17, quality: 1, reliability: 1,
    capturedAt: new Date(`${season}-09-02T12:00:00Z`), payloadHash: `${team}-${season}`,
    provenance: { source: "scoreboard" },
  };
}

describe("NCAAF football intelligence snapshots", () => {
  beforeEach(() => {
    dbMocks.execute.mockReset();
    dbMocks.select.mockReset();
    dbMocks.select.mockImplementation(() => ({
      from: () => ({ where: async () => [] }),
    }));
  });

  it("makes a canonical sports-only domain snapshot and blocks missing critical QB evidence", () => {
    const rows = [
      row("home", "x", 2025, "home-current"), row("home", "x", 2024, "home-prior"),
      row("away", "y", 2025, "away-current"), row("away", "y", 2024, "away-prior"),
    ];
    const snapshot = buildNcaafFootballIntelligenceSnapshot(target, rows, cutoff);
    expect(snapshot.teams.home.teamPerformance.state).toBe("VALID");
    expect(snapshot.teams.away.earlySeasonPrior.state).toBe("VALID");
    expect(snapshot.teams.home.quarterback.state).toBe("UNSUPPORTED");
    expect(snapshot.teams.home.venue.state).toBe("VALID");
    expect(snapshot.readiness).toMatchObject({ state: "BLOCKED" });
    expect(JSON.stringify(snapshot)).not.toMatch(/odds|probability|recommendation/i);
  });

  it("excludes evidence captured at or after the cutoff and keeps its input hash canonical", () => {
    const after = row("home", "x", 2025, "after");
    after.capturedAt = cutoff;
    const snapshot = buildNcaafFootballIntelligenceSnapshot(target, [after], cutoff);
    expect(snapshot.teams.home.teamPerformance.state).toBe("MISSING");
    expect(ncaafFootballIntelligenceInputHash(target, [after], cutoff))
      .toBe(ncaafFootballIntelligenceInputHash({ ...target }, [after], cutoff));
    after.capturedAt = new Date(cutoff.getTime() + 1);
    expect(buildNcaafFootballIntelligenceSnapshot(target, [after], cutoff)
      .teams.home.teamPerformance.state).toBe("MISSING");
  });

  it("rejects market-shaped keys recursively and requires a strict cutoff", () => {
    expect(() => assertNoNcaafMarketShapedKeys({ nested: { moneyline: 3 } })).toThrow(/market-shaped/);
    expect(() => buildNcaafFootballIntelligenceSnapshot(target, [], kickoff)).toThrow(/strictly before kickoff/);
  });

  it("executes the v2 insert and reports newly persisted snapshots", async () => {
    dbMocks.execute.mockResolvedValueOnce({ rows: [{ id: 221 }] });
    const result = await createNcaafFootballIntelligenceSnapshot(target, cutoff);
    expect(result).toMatchObject({ id: 221, persistence: "inserted" });
    expect(dbMocks.execute).toHaveBeenCalledTimes(1);
    const statement = JSON.stringify(dbMocks.execute.mock.calls[0]![0]);
    expect(statement).toContain("INSERT INTO ncaaf_football_intelligence_snapshots");
    expect(statement).toContain(NCAAF_FOOTBALL_INTELLIGENCE_SNAPSHOT_SCHEMA_VERSION);
  });

  it("reports conflict-resolved snapshots as deduped", async () => {
    dbMocks.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 221 }] });
    const result = await createNcaafFootballIntelligenceSnapshot(target, cutoff);
    expect(result).toMatchObject({ id: 221, persistence: "deduped" });
    expect(dbMocks.execute).toHaveBeenCalledTimes(2);
  });
});