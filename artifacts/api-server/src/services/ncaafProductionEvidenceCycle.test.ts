import { describe, expect, it } from "vitest";
import {
  bootstrapNcaafCurrentSeasonPerformanceEvidence,
  createNcaafProductionEvidenceCycle,
  type NcaafProductionEvidenceGame,
} from "./ncaafProductionEvidenceCycle";
import type { NcaafPregameCohortStore } from "./ncaafPregameCohorts";

const now = new Date("2026-09-10T19:20:00Z");
const game: NcaafProductionEvidenceGame = {
  id: 1, provider: "espn", eventId: "401", season: 2026, week: 2,
  kickoffAt: new Date("2026-09-10T20:00:00Z"), homeTeamId: "h", awayTeamId: "a",
  homeTeamName: "Home", awayTeamName: "Away", neutralSite: false, venue: {},
  capturedAt: now, modeledAsOf: now,
};

function store(): NcaafPregameCohortStore {
  const assigned = new Map<string, any>();
  return {
    getFeatureSnapshot: async () => undefined,
    getAssignment: async (type, provider, event) => assigned.get(`${type}:${provider}:${event}`),
    insertAssignment: async (value) => {
      assigned.set(`${value.cohortType}:${value.targetProvider}:${value.targetEventId}`, value);
      return value;
    },
  };
}

describe("NCAAF production evidence cycle", () => {
  it("single-flights duplicate invocations", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const run = createNcaafProductionEvidenceCycle({
      now: () => now, reconcile: async () => 0,
      captureCurrent: async () => { await wait; return { games: 0, markets: 0, matchedMarkets: 0, missingEntityObservations: 0, teamPerformanceRows: 0, skippedTeamPerformanceRows: 0, providerErrors: {} }; },
      listUpcomingGames: async () => [],
    });
    const first = run();
    expect((await run()).skipped).toBe(true);
    release();
    expect((await first).skipped).toBe(false);
  });

  it("continues existing evidence after capture failure and isolates game failures", async () => {
    let featureCalls = 0;
    const run = createNcaafProductionEvidenceCycle({
      now: () => now, reconcile: async () => 2, captureCurrent: async () => { throw new Error("provider down"); },
      listUpcomingGames: async () => [game, { ...game, eventId: "bad" }],
      createFeatureSnapshot: (async () => {
        featureCalls++;
        if (featureCalls === 1) throw new Error("bad event evidence");
        return { id: 2, snapshot: {}, inputHash: "x" };
      }) as never,
      createIntelligenceSnapshot: (async () => ({ id: 3, snapshot: {}, inputHash: "x" })) as never,
      cohortStore: {
        getFeatureSnapshot: async () => undefined,
        getAssignment: async () => ({}) as any,
        insertAssignment: async () => ({}) as any,
      },
    });
    const result = await run();
    expect(result.staleRunsReconciled).toBe(2);
    expect(result.captureCause).toContain("provider down");
    expect(result.gameFailures).toHaveLength(1);
  });

  it("creates both snapshots and assigns final only in its pre-kickoff window", async () => {
    let final = 0;
    const run = createNcaafProductionEvidenceCycle({
      now: () => now, reconcile: async () => 0, captureCurrent: async () => ({ games: 0, markets: 0, matchedMarkets: 0, missingEntityObservations: 0, teamPerformanceRows: 0, skippedTeamPerformanceRows: 0, providerErrors: {} }),
      listUpcomingGames: async () => [game], cohortStore: store(),
      createFeatureSnapshot: (async () => ({ id: 1, snapshot: {}, inputHash: "x" })) as never,
      createIntelligenceSnapshot: (async () => ({ id: 2, snapshot: {}, inputHash: "x" })) as never,
      assignLiveShadow: (async () => ({})) as never,
      assignFinalPregame: (async () => { final++; return {}; }) as never,
    });
    const result = await run();
    expect(result.featureSnapshots).toBe(1);
    expect(result.intelligenceSnapshots).toBe(1);
    expect(result.finalPregameAssignments).toBe(1);
    expect(final).toBe(1);
  });

  it("bootstrap captures bounded completed performance dates without cohorts", async () => {
    const captured: Date[] = [];
    await bootstrapNcaafCurrentSeasonPerformanceEvidence(
      new Date("2025-09-01T00:00:00Z"), new Date("2025-09-02T00:00:00Z"),
      async (date) => { captured.push(date); },
    );
    expect(captured).toHaveLength(2);
  });
});