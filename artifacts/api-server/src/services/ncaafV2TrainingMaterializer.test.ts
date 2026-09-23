import { describe, expect, it } from "vitest";
import {
  NCAAF_V2_TRAINING_ARTIFACT_KEY, NCAAF_V2_TRAINING_SCHEMA_VERSION,
  materializeNcaafV2TrainingRows, ncaafCompletedAtomicGamesFromCfbdEvidence,
  type NcaafV2TrainingMaterializerStore,
} from "./ncaafV2TrainingMaterializer";

const captured = new Date("2024-08-20T00:00:00Z");
const kickoff = new Date("2024-09-01T18:00:00Z");
const source = {
  games: [
    { id: 1, provider: "college_football_data", providerEventId: "cfbd-2024-a", season: 2024, week: 1, kickoffAt: kickoff,
      homeProviderTeamId: "cfbd-home", awayProviderTeamId: "cfbd-away", homeScore: 28, awayScore: 14, gameStatus: "final", neutralSite: true,
      payload: { game: { homeClassification: "fbs", awayClassification: "fbs" }, classifications: { ingestion: "retrospective_aggregate_not_pregame" } } },
    { id: 2, provider: "college_football_data", providerEventId: "cfbd-2024-b", season: 2024, week: 2, kickoffAt: new Date("2024-09-08T18:00:00Z"),
      homeProviderTeamId: "cfbd-home", awayProviderTeamId: "cfbd-away-2", homeScore: 21, awayScore: 17, gameStatus: "final", neutralSite: false,
      payload: { homeClassification: "fbs", awayClassification: "fbs" } },
    { id: 3, provider: "college_football_data", providerEventId: "not-exact-fbs", season: 2024, kickoffAt: kickoff,
      homeProviderTeamId: "x", awayProviderTeamId: "y", homeScore: 1, awayScore: 0, gameStatus: "final", neutralSite: false,
      payload: { homeClassification: "fbs", awayClassification: "FBS" } },
  ],
  domainEvidence: [{ id: 10, endpoint: "elo", season: 2024, cfbdGameId: "cfbd-2024-a", cfbdTeamId: null,
    pitClassification: "B", providerEffectiveAt: captured, capturedAt: captured, payload: { rating: 1500 } }],
} as unknown as Awaited<ReturnType<NcaafV2TrainingMaterializerStore["load"]>>;

describe("NCAAF v2 CFBD training materializer", () => {
  it("converts completed exact-FBS evidence with native CFBD identities and context", () => {
    const games = ncaafCompletedAtomicGamesFromCfbdEvidence(source);
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({
      stableGameId: "cfbd-2024-a", homeTeamId: "cfbd-home", awayTeamId: "cfbd-away",
      neutralSite: true, homeClassification: "FBS", awayClassification: "FBS",
    });
    expect(games[0]?.pitLineage?.[0]).toMatchObject({ source: "cfbd:elo", sourceId: "10", pitClass: "B" });
  });

  it("inserts chronological replay rows with v2 identity, frozen features, targets, and lineage", async () => {
    const persisted: any[] = [];
    const result = await materializeNcaafV2TrainingRows({ seasons: [2024] }, {
      load: async () => source,
      insert: async (row) => { persisted.push(row); return true; },
    });
    expect(result).toMatchObject({ attempted: 2, inserted: 2, artifactKey: NCAAF_V2_TRAINING_ARTIFACT_KEY,
      schemaVersion: NCAAF_V2_TRAINING_SCHEMA_VERSION });
    expect(persisted[0]).toMatchObject({
      canonicalProvider: "college_football_data", canonicalEventId: "cfbd-2024-a",
      homeCanonicalTeamId: "cfbd-home", awayCanonicalTeamId: "cfbd-away",
      targets: { homeWin: 1, homeMargin: 14, totalPoints: 42 },
      features: { context: { homeField: false, neutralSite: true } },
    });
    expect(persisted[0].pregameCutoffAt.toISOString()).toBe("2024-09-01T17:59:59.999Z");
    expect(persisted[0].pitLineage).toHaveLength(1);
    expect(persisted[0].quality.featureFreeze).toBe("replayNcaafChronologically_before_targets");
  });

  it("resumes a bounded batch and is idempotent on retry", async () => {
    const identities = new Set<string>();
    const store: NcaafV2TrainingMaterializerStore = {
      load: async () => source,
      insert: async (row) => {
        const key = `${row.schemaVersion}:${row.artifactKey}:${row.canonicalEventId}`;
        if (identities.has(key)) return false;
        identities.add(key);
        return true;
      },
    };
    const first = await materializeNcaafV2TrainingRows({ seasons: [2024], batchSize: 1 }, store);
    expect(first).toMatchObject({ attempted: 1, inserted: 1, nextCursor: { offset: 1 } });
    const resumed = await materializeNcaafV2TrainingRows({ seasons: [2024], batchSize: 1, cursor: first.nextCursor }, store);
    expect(resumed).toMatchObject({ attempted: 1, inserted: 1, nextCursor: null });
    const retry = await materializeNcaafV2TrainingRows({ seasons: [2024], batchSize: 1 }, store);
    expect(retry).toMatchObject({ inserted: 0, alreadyMaterialized: 1 });
  });

  it("isolates requested seasons rather than loading or replaying another season", async () => {
    const mixed = structuredClone(source);
    mixed.games.push({
      id: 20, provider: "college_football_data", providerEventId: "cfbd-2023-a", season: 2023, kickoffAt: new Date("2023-09-01T18:00:00Z"),
      homeProviderTeamId: "old-home", awayProviderTeamId: "old-away", homeScore: 7, awayScore: 3, gameStatus: "final", neutralSite: false,
      payload: { homeClassification: "fbs", awayClassification: "fbs" },
    } as never);
    const persisted: any[] = [];
    await materializeNcaafV2TrainingRows({ seasons: [2024] }, {
      load: async (seasons) => ({
        games: mixed.games.filter((game: any) => seasons.includes(game.season)),
        domainEvidence: mixed.domainEvidence.filter((row: any) => seasons.includes(row.season)),
      }) as Awaited<ReturnType<NcaafV2TrainingMaterializerStore["load"]>>,
      insert: async (row) => { persisted.push(row); return true; },
    });
    expect(persisted.map((row) => row.season)).toEqual([2024, 2024]);
  });
});