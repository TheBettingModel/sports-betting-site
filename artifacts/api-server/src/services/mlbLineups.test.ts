import { afterEach, describe, expect, it, vi } from "vitest";
import { getLineupMatchup, makeLineupGameKey } from "./mlbLineups";
import { makePitcherGameKey } from "./mlbPitchers";

const DATE = "2027-06-01";
const FIRST_START = "2027-06-01T17:10:00.000Z";
const SECOND_START = "2027-06-01T22:10:00.000Z";

function players(ids: number[]) {
  return ids.map((id, index) => ({ id, battingOrder: (index + 1) * 100 }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MLB doubleheader lineup identity", () => {
  it("keeps distinct lineups for same-day games with the same teams", async () => {
    const firstHome = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const secondHome = [21, 22, 23, 24, 25, 26, 27, 28, 29];
    const away = [41, 42, 43, 44, 45, 46, 47, 48, 49];

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/schedule")) {
        return new Response(JSON.stringify({
          dates: [{
            games: [
              {
                gamePk: 1001,
                gameDate: FIRST_START,
                teams: { home: { team: { id: 111 } }, away: { team: { id: 110 } } },
                lineups: { homePlayers: players(firstHome), awayPlayers: players(away) },
              },
              {
                gamePk: 1002,
                gameDate: SECOND_START,
                teams: { home: { team: { id: 111 } }, away: { team: { id: 110 } } },
                lineups: { homePlayers: players(secondHome), awayPlayers: players(away) },
              },
            ],
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ people: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await getLineupMatchup("BOS", "BAL", DATE, FIRST_START);
    const second = await getLineupMatchup("BOS", "BAL", DATE, SECOND_START);

    expect(first.home.confirmed).toBe(true);
    expect(second.home.confirmed).toBe(true);
    expect(first.home.playerIds).toEqual(firstHome);
    expect(second.home.playerIds).toEqual(secondHome);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/schedule"))).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("season=2027"))).toBe(true);
  });

  it("uses a precise start timestamp rather than a display-time or matchup-only key", () => {
    expect(makeLineupGameKey("BOS", "BAL", FIRST_START))
      .not.toBe(makeLineupGameKey("BOS", "BAL", SECOND_START));
    expect(makeLineupGameKey("BOS", "BAL", "not-a-time")).toBeNull();
    expect(makePitcherGameKey("BOS", "BAL", FIRST_START))
      .not.toBe(makePitcherGameKey("BOS", "BAL", SECOND_START));
  });
});