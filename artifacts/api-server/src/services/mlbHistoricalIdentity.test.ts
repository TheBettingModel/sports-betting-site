import { describe, expect, it } from "vitest";
import { resolveHistoricalMlbIdentities } from "./mlbHistoricalIdentity";
import { parseHistoricalSchedulePayload } from "./mlbHistoricalSource";

function game(gamePk = 1, overrides: Record<string, unknown> = {}) {
  return {
    gamePk,
    season: 2024,
    gameType: "R",
    gameDate: "2024-04-01T17:00:00Z",
    officialDate: "2024-04-01",
    status: { abstractGameState: "Final", codedGameState: "F", detailedState: "Final" },
    teams: {
      home: { team: { id: 1, name: "Home" }, score: 4 },
      away: { team: { id: 2, name: "Away" }, score: 3 },
    },
    linescore: { currentInning: 9 },
    ...overrides,
  };
}

describe("MLB historical identity", () => {
  it("uses exact numeric provider IDs", () => {
    const result = resolveHistoricalMlbIdentities(parseHistoricalSchedulePayload({ dates: [{ games: [game()] }] }));
    expect(result.admitted[0]).toMatchObject({
      canonicalGameId: "mlb-game:1",
      homeCanonicalTeamId: "mlb-team:1",
      awayCanonicalTeamId: "mlb-team:2",
    });
  });

  it("deduplicates identical rows and quarantines unfinished games", () => {
    const rows = parseHistoricalSchedulePayload({ dates: [{ games: [
      game(),
      game(),
      game(2, { status: { abstractGameState: "Live", codedGameState: "I", detailedState: "In Progress" } }),
    ] }] });
    const result = resolveHistoricalMlbIdentities(rows);
    expect(result.admitted).toHaveLength(1);
    expect(result.duplicateSourceRows).toBe(1);
    expect(result.quarantined.flatMap((row) => row.reasons)).toContain("UNFINISHED_GAME");
  });

  it("quarantines every conflicting duplicate identity", () => {
    const rows = parseHistoricalSchedulePayload({ dates: [{ games: [
      game(),
      game(1, {
        teams: {
          home: { team: { id: 1, name: "Home" }, score: 9 },
          away: { team: { id: 2, name: "Away" }, score: 3 },
        },
      }),
    ] }] });
    const result = resolveHistoricalMlbIdentities(rows);
    expect(result.admitted).toHaveLength(0);
    expect(result.duplicateSourceRows).toBe(1);
    expect(result.quarantined).toEqual([{
      providerGameId: "1",
      reasons: ["DUPLICATE_PROVIDER_GAME_ID"],
    }]);
  });
});