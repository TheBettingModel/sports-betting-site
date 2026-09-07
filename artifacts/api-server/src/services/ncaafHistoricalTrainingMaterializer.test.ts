import { describe, expect, it } from "vitest";
import {
  historicalGamesFromCfbdEvidence, materializeNcaafHistoricalTrainingRows,
  type NcaafHistoricalMaterializerStore,
} from "./ncaafHistoricalTrainingMaterializer";

const captured = new Date("2024-08-20T00:00:00Z");
const kickoff = new Date("2024-09-01T18:00:00Z");
const source = {
  games: [{
    id: 1, provider: "college_football_data", providerEventId: "cfbd-game", season: 2024, week: 1, kickoffAt: kickoff,
    homeProviderTeamId: "cfbd-home", awayProviderTeamId: "cfbd-away", homeScore: 28, awayScore: 14, gameStatus: "final", neutralSite: false,
    payload: { homeClassification: "FBS", awayClassification: "FBS" },
  }],
  teamMappings: [
    { id: 1, cfbdTeamId: "cfbd-home", canonicalProvider: "espn", canonicalTeamId: "espn-home", state: "MAPPED", capturedAt: captured },
    { id: 2, cfbdTeamId: "cfbd-away", canonicalProvider: "espn", canonicalTeamId: "espn-away", state: "MAPPED", capturedAt: captured },
  ],
  gameMappings: [{ id: 1, cfbdGameId: "cfbd-game", canonicalProvider: "espn", canonicalEventId: "espn-event", state: "MAPPED", capturedAt: captured }],
  domainEvidence: [{
    id: 1, endpoint: "elo", season: 2024, cfbdGameId: null, cfbdTeamId: "cfbd-home", cfbdPlayerId: null,
    pitClassification: "B", providerEffectiveAt: captured, capturedAt: captured, payload: { rating: 1 },
  }],
} as unknown as Awaited<ReturnType<NcaafHistoricalMaterializerStore["load"]>>;

describe("NCAAF historical training materializer", () => {
  it("uses only exact mapped CFBD/ESPN identities and persists idempotently", async () => {
    const persisted: unknown[] = [];
    const store: NcaafHistoricalMaterializerStore = {
      load: async () => source,
      insert: async (row) => { persisted.push(row); return persisted.length === 1; },
    };
    expect(historicalGamesFromCfbdEvidence(source)).toHaveLength(1);
    const result = await materializeNcaafHistoricalTrainingRows({ seasons: [2024] }, store);
    expect(result).toMatchObject({ attempted: 1, inserted: 1, alreadyMaterialized: 0 });
    expect(persisted).toHaveLength(1);
  });
  it("fails closed when evidence is retrospective rather than pregame", async () => {
    const retrospective = structuredClone(source);
    retrospective.domainEvidence[0]!.capturedAt = new Date("2024-09-02T00:00:00Z");
    const result = await materializeNcaafHistoricalTrainingRows({ seasons: [2024] }, {
      load: async () => retrospective,
      insert: async () => true,
    } as NcaafHistoricalMaterializerStore);
    expect(result.attempted).toBe(0);
    expect(result.blockers.no_eligible_pregame_lineage).toBe(1);
  });
});