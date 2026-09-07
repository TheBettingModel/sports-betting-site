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

  it("makes a canonical sports-only domain snapshot without treating optional QB evidence as a blocker", () => {
    const rows = [
      row("home", "x", 2025, "home-current"), row("home", "x", 2024, "home-prior"),
      row("away", "y", 2025, "away-current"), row("away", "y", 2024, "away-prior"),
    ];
    const snapshot = buildNcaafFootballIntelligenceSnapshot(target, rows, cutoff);
    expect(snapshot.teams.home.teamPerformance.state).toBe("VALID");
    expect(snapshot.teams.away.earlySeasonPrior.state).toBe("VALID");
    expect(snapshot.teams.home.quarterback.state).toBe("UNSUPPORTED");
    expect(snapshot.teams.home.venue.state).toBe("VALID");
    expect(snapshot.readiness).toMatchObject({ state: "PARTIAL", blockedReasons: [] });
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

  it("distinguishes blocking absent team evidence from partial scored evidence", () => {
    const incomplete = row("home", "x", 2025, "home-incomplete");
    incomplete.pointsAgainst = null;
    const partial = buildNcaafFootballIntelligenceSnapshot(target, [
      row("home", "x", 2025, "home-complete"), incomplete,
      row("away", "y", 2025, "away-complete"),
    ], cutoff);
    expect(partial.teams.home.teamPerformance.state).toBe("PARTIAL");
    expect(partial.readiness).toMatchObject({
      state: "PARTIAL",
      blockedReasons: [],
      partialReasons: expect.arrayContaining(["home.teamPerformance:PARTIAL"]),
    });
    expect(buildNcaafFootballIntelligenceSnapshot(target, [], cutoff).readiness.state).toBe("BLOCKED");
  });

  it("recursively rejects exact market keys without rejecting sports statistics", () => {
    for (const key of [
      "odds", "price", "line", "spread", "total", "moneyline", "impliedProbability",
      "book", "sportsbook", "marketPrice", "openingLine", "closingLine",
    ]) {
      expect(() => assertNoNcaafMarketShapedKeys({ nested: [{ [key]: 1 }] })).toThrow(/market-shaped/);
    }
    expect(() => assertNoNcaafMarketShapedKeys({
      pointsPerOpportunity: 4.2,
      pointsPerDrive: 2.9,
      yardsPerPlay: 6.1,
      successRate: 0.48,
      explosiveness: 1.2,
      havoc: 0.17,
      lineYards: 3.4,
      ppa: 0.22,
    })).not.toThrow();
    expect(() => buildNcaafFootballIntelligenceSnapshot(target, [], kickoff)).toThrow(/strictly before kickoff/);
  });

  it("allows direct and composed verified havoc totals while keeping sportsbook totals blocked recursively", () => {
    for (const domain of ["teamPerformance", "earlySeasonPrior", "advanced"]) {
      for (const unit of ["offense", "defense"]) {
        for (const key of ["total", "totals"]) {
          expect(() => assertNoNcaafMarketShapedKeys(
            { [key]: 12.4 },
            `suppliedDomains.home.${domain}.payload.${unit}.havoc`,
          )).not.toThrow();
        }
      }
    }

    for (const path of [
      "suppliedDomains.home.earlySeasonPrior.payload.components[0].payload.defense.havoc",
      "suppliedDomains.home.earlySeasonPrior.payload.components[1].payload.defense.havoc",
      "suppliedDomains.away.earlySeasonPrior.payload.components[2].payload.defense.havoc",
      "suppliedDomains.home.earlySeasonPrior.payload.components[0].payload.components[1].payload.defense.havoc",
    ]) {
      expect(() => assertNoNcaafMarketShapedKeys({ total: 12.4 }, path)).not.toThrow();
    }

    for (const [path, payload] of [
      ["payload", { total: 44.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload", { total: 44.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload", { totals: 44.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload", { over: 44.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload", { under: 44.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload", { marketTotal: 44.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.market", { total: 44.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.defense", { total: 12 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.defense.havoc", { openingTotal: 42.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.defense.havoc", { closingTotal: 43.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.defense.havoc", { sportsbook: { total: 44.5 } }],
      ["suppliedDomains.home.earlySeasonPrior.payload.defense.havoc", { odds: -110 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.defense.havoc", { price: -110 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.defense.havoc", { impliedProbability: 0.52 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.components[0].payload", { total: 44.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.components[0].payload.market", { total: 44.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.components[0].payload.sportsbook", { total: 44.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.components[0].payload.defense", { total: 12 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.components[0].payload", { openingTotal: 42.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.components[0].payload", { closingTotal: 43.5 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.components[0].payload", { odds: -110 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.components[0].payload", { price: -110 }],
      ["suppliedDomains.home.earlySeasonPrior.payload.components[0].payload", { impliedProbability: 0.52 }],
    ] as const) {
      expect(() => assertNoNcaafMarketShapedKeys(payload, path)).toThrow(/market-shaped/);
    }
  });

  it("accepts a complete production-shaped composed early-season prior", () => {
    const composedPrior = {
      state: "VALID",
      payload: {
        components: [
          { source: "completed_games", payload: { defense: { havoc: { total: 0.18 } } } },
          { source: "supplied_prior", payload: { defense: { havoc: { total: 0.21 } } } },
        ],
      },
    };
    expect(() => assertNoNcaafMarketShapedKeys(
      composedPrior,
      "suppliedDomains.home.earlySeasonPrior",
    )).not.toThrow();
  });

  it("retains mapped supplied team performance and composes supported early-season priors with provenance", () => {
    const suppliedPerformance = {
      state: "VALID" as const, provider: "college_football_data", quality: 0.9, reliability: 0.8,
      evidence: [{ id: 98, providerEventId: "cfbd-home", payloadHash: "cfbd-hash", capturedAt: "2025-09-19T10:00:00.000Z" }],
      provenance: [{ endpoint: "season_team_stats", pitClassification: "B" }],
      sample: { observations: 1 }, missingReason: null, payload: { pointsPerOpportunity: 4.2 },
    };
    const suppliedPrior = {
      ...suppliedPerformance,
      evidence: [{ id: 99, providerEventId: "cfbd-prior", payloadHash: "prior-hash", capturedAt: "2025-09-19T10:00:00.000Z" }],
      provenance: [{ endpoint: "sp", pitClassification: "B" }], payload: { rating: 12 },
    };
    const snapshot = buildNcaafFootballIntelligenceSnapshot({
      ...target, suppliedDomains: { home: { teamPerformance: suppliedPerformance, earlySeasonPrior: suppliedPrior } },
    }, [row("home", "x", 2024, "home-prior")], cutoff);
    expect(snapshot.teams.home.teamPerformance).toMatchObject({
      state: "VALID", provider: "college_football_data", payload: { pointsPerOpportunity: 4.2 },
    });
    expect(snapshot.teams.home.earlySeasonPrior.evidence).toHaveLength(2);
    expect(snapshot.teams.home.earlySeasonPrior.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "scoreboard" }),
      expect.objectContaining({ endpoint: "sp" }),
    ]));
    expect(snapshot.teams.home.earlySeasonPrior.payload).toMatchObject({
      components: expect.arrayContaining([expect.objectContaining({ source: "completed_games" }), expect.objectContaining({ source: "supplied_prior" })]),
    });
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

  it("persists a production-equivalent snapshot containing composed havoc totals", async () => {
    dbMocks.execute.mockResolvedValueOnce({ rows: [{ id: 216 }] });
    const suppliedPrior = {
      state: "VALID" as const,
      provider: "college_football_data",
      quality: 0.9,
      reliability: 0.9,
      evidence: [{
        id: 216,
        providerEventId: "cfbd-prior",
        payloadHash: "cfbd-prior-hash",
        capturedAt: "2025-09-19T10:00:00.000Z",
      }],
      provenance: [{ endpoint: "advanced_stats", pitClassification: "B" }],
      sample: { observations: 1 },
      missingReason: null,
      payload: { defense: { havoc: { total: 0.21 } } },
    };
    const result = await createNcaafFootballIntelligenceSnapshot({
      ...target,
      suppliedDomains: { home: { earlySeasonPrior: suppliedPrior } },
    }, cutoff);
    expect(result).toMatchObject({ id: 216, persistence: "inserted" });
    expect(result.snapshot.teams.home.earlySeasonPrior.payload).toMatchObject({
      components: expect.arrayContaining([
        expect.objectContaining({
          source: "supplied_prior",
          payload: { defense: { havoc: { total: 0.21 } } },
        }),
      ]),
    });
    expect(dbMocks.execute).toHaveBeenCalledTimes(1);
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