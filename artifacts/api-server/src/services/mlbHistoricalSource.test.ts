import { describe, expect, it, vi } from "vitest";
import {
  fetchHistoricalMlbSchedule,
  historicalPayloadHash,
  parseHistoricalSchedulePayload,
} from "./mlbHistoricalSource";

const payload = {
  dates: [{
    games: [{
      gamePk: 718780,
      season: 2023,
      gameType: "R",
      gameDate: "2023-03-30T17:05:00Z",
      officialDate: "2023-03-30",
      doubleHeader: "S",
      gameNumber: 1,
      neutralSite: false,
      status: { abstractGameState: "Final", codedGameState: "F", detailedState: "Final" },
      teams: {
        away: { team: { id: 144, name: "Atlanta Braves" }, score: 7, probablePitcher: { id: 608331, fullName: "Max Fried" } },
        home: { team: { id: 120, name: "Washington Nationals" }, score: 2, probablePitcher: { id: 656302, fullName: "Patrick Corbin" } },
      },
      linescore: { currentInning: 9 },
    }],
  }],
};

describe("MLB historical source", () => {
  it("parses official IDs and preserves actual-only starter boundary", () => {
    const [row] = parseHistoricalSchedulePayload(payload);
    expect(row).toMatchObject({
      providerGameId: "718780",
      season: 2023,
      home: { providerTeamId: "120" },
      away: { providerTeamId: "144" },
      homeRuns: 2,
      awayRuns: 7,
      gameNumber: 1,
      doubleheaderStatus: "S",
      starterState: { home: "ACTUAL_ONLY", away: "ACTUAL_ONLY" },
    });
  });

  it("hashes equivalent object key orders identically", () => {
    expect(historicalPayloadHash({ b: 2, a: 1 })).toBe(historicalPayloadHash({ a: 1, b: 2 }));
  });

  it("makes one bounded request and rejects invalid dates", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    const result = await fetchHistoricalMlbSchedule({
      startDate: "2023-03-30",
      endDate: "2023-03-30",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.rows).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(fetchHistoricalMlbSchedule({
      startDate: "not-a-date",
      endDate: "2023-03-30",
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toThrow("Invalid MLB historical date");
  });
});