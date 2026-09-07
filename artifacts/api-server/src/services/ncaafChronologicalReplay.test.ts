import { describe, expect, it } from "vitest";
import { replayNcaafChronologically, type NcaafCompletedAtomicGame } from "./ncaafChronologicalReplay";

const game = (stableGameId: string, kickoffAt: string, homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number, season = 2024): NcaafCompletedAtomicGame => ({
  stableGameId, season, kickoffAt: new Date(kickoffAt), homeTeamId, awayTeamId, homeScore, awayScore, neutralSite: false,
  completed: true, homeClassification: "FBS", awayClassification: "FBS",
});

describe("NCAAF chronological replay", () => {
  it("orders by kickoff then stable ID and creates frozen pregame features before labels", () => {
    const result = replayNcaafChronologically([
      game("z", "2024-09-01T19:00:00Z", "A", "B", 30, 10),
      game("b", "2024-09-01T18:00:00Z", "A", "C", 20, 14),
      game("a", "2024-09-01T18:00:00Z", "B", "C", 7, 21),
    ]);
    expect(result.rows.map((row) => row.stableGameId)).toEqual(["a", "b", "z"]);
    expect(result.rows[1]?.features.home.seasonToDate).toMatchObject({ games: 0 });
    expect(result.rows[2]?.features.home.seasonToDate).toMatchObject({ games: 1, offensePointsPerGame: 20, defensePointsAllowedPerGame: 14 });
    expect(Object.isFrozen(result.rows[0]?.features)).toBe(true);
    expect(result.audit.leakage).toMatchObject({ featuresFrozenBeforeTargets: 3, stateUpdatedAfterTargets: 3 });
  });

  it("exposes season, rolling, opponent-adjusted, prior-season, Elo, and neutral context without future games", () => {
    const result = replayNcaafChronologically([
      game("2023-a", "2023-09-01T18:00:00Z", "A", "B", 28, 14, 2023),
      game("2024-a", "2024-09-01T18:00:00Z", "A", "C", 24, 17),
      { ...game("2024-b", "2024-09-08T18:00:00Z", "A", "B", 21, 20), neutralSite: true },
    ]);
    const row = result.rows[2]!;
    expect(row.features.context).toEqual({ homeField: false, neutralSite: true });
    expect(row.features.home.seasonToDate).toMatchObject({ games: 1, offensePointsPerGame: 24, defensePointsAllowedPerGame: 17 });
    expect(row.features.home.last3.games).toBe(1);
    expect(row.features.home.last5.games).toBe(1);
    expect(row.features.home.priorSeason).toMatchObject({ games: 1, offensePointsPerGame: 28 });
    expect(row.features.home.opponentAdjusted).toMatchObject({ games: 1, offensePointsPerGame: 24 });
    expect(row.features.elo.home).toBeGreaterThan(1500);
    expect(row.targets).toEqual({ homeWin: 1, homeMargin: 1, totalPoints: 41 });
  });

  it("keeps only dated A/B pregame PIT and availability lineage and audits rejected evidence", () => {
    const dated = new Date("2024-08-30T00:00:00Z");
    const kickoff = new Date("2024-09-01T18:00:00Z");
    const result = replayNcaafChronologically([{ ...game("a", kickoff.toISOString(), "A", "B", 17, 10),
      pitLineage: [
        { source: "cfbd", sourceId: "good", pitClass: "B", effectiveAt: dated, capturedAt: dated },
        { source: "cfbd", sourceId: "late", pitClass: "A", effectiveAt: kickoff, capturedAt: dated },
      ],
      availability: { home: { source: "cfbd", sourceId: "qb", pitClass: "A", effectiveAt: dated, capturedAt: dated, status: "limited", impact: -2 },
        away: { source: "cfbd", sourceId: "late-qb", pitClass: "B", effectiveAt: dated, capturedAt: kickoff, status: "out" } },
    }]);
    expect(result.rows[0]?.features.pitLineage.map((item) => item.sourceId)).toEqual(["good"]);
    expect(result.rows[0]?.features.availability.home).toMatchObject({ status: "limited", impact: -2 });
    expect(result.rows[0]?.features.availability.away).toBeNull();
    expect(result.audit.leakage).toMatchObject({ postKickoffPitExcluded: 1, postKickoffAvailabilityExcluded: 1 });
  });

  it("is idempotent, leaves input untouched, and excludes invalid or duplicate atomic games", () => {
    const valid = game("same", "2024-09-01T18:00:00Z", "A", "B", 10, 3);
    const input: NcaafCompletedAtomicGame[] = [valid, { ...valid },
      { ...game("bad", "2024-09-02T18:00:00Z", "A", "C", 3, 0), completed: false } as unknown as NcaafCompletedAtomicGame];
    const first = replayNcaafChronologically(input);
    const second = replayNcaafChronologically(input);
    expect(first.audit.checksum).toBe(second.audit.checksum);
    expect(first.rows.map((row) => row.checksum)).toEqual(second.rows.map((row) => row.checksum));
    expect(valid.kickoffAt.toISOString()).toBe("2024-09-01T18:00:00.000Z");
    expect(first.audit.excluded).toMatchObject({ duplicate_stable_game_id: 1, invalid_atomic_completed_game: 1 });
  });
});