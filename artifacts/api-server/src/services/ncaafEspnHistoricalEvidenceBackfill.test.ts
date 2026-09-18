import { describe, expect, it, vi } from "vitest";
import {
  backfillNcaafEspnHistoricalGameEvidence,
  ncaafEasternDateKey,
  type NcaafEspnHistoricalBackfillStore,
} from "./ncaafEspnHistoricalEvidenceBackfill";
import type { FetchedGame } from "./espn";

const kickoff = new Date("2024-09-08T00:00:00Z");
const game: FetchedGame = {
  espnId: "NCAAF-401",
  sport: "NCAAF",
  homeTeamId: "10",
  awayTeamId: "20",
  homeTeamAbbr: "H",
  awayTeamAbbr: "A",
  homeTeamName: "Home",
  awayTeamName: "Away",
  homeTeamRecord: "1-0",
  awayTeamRecord: "0-1",
  gameTime: "8:00 PM",
  gameDate: "2024-09-07",
  commenceTimeISO: kickoff.toISOString(),
  status: "final",
  homeScore: 31,
  awayScore: 14,
  week: 2,
};

describe("NCAAF ESPN historical evidence backfill", () => {
  it("uses an explicit completed-date ledger, including partial-slate repair", async () => {
    expect(ncaafEasternDateKey(kickoff)).toBe("20240907");
    const inserted: unknown[] = [];
    const completed: string[] = [];
    const store: NcaafEspnHistoricalBackfillStore = {
      loadCfbdKickoffs: async () => [
        { season: 2024, kickoffAt: kickoff },
        { season: 2024, kickoffAt: new Date("2024-09-14T20:00:00Z") },
      ],
      loadCompletedDates: async () => ["20240907"],
      insert: async (rows) => { inserted.push(...rows); return rows.length; },
      markCompletedDate: async (date) => { completed.push(date); },
    };
    const fetchByDate = vi.fn().mockResolvedValue([game]);
    const result = await backfillNcaafEspnHistoricalGameEvidence({
      seasons: [2024],
      maxDates: 10,
      capturedAt: new Date("2026-09-18T00:00:00Z"),
    }, store, fetchByDate);
    expect(fetchByDate).toHaveBeenCalledWith("20240914");
    expect(result).toMatchObject({
      candidateDates: 2,
      alreadyCapturedDates: 1,
      attemptedDates: 1,
      capturedDates: 1,
      fetchedGames: 1,
      insertedGames: 1,
      remainingDates: 0,
    });
    expect(completed).toEqual(["20240914"]);
    expect(inserted[0]).toMatchObject({
      provider: "espn",
      providerEventId: "NCAAF-401",
      modeledAsOf: new Date("2026-09-18T00:00:00Z"),
      gameStatus: "final",
    });
  });

  it("is bounded and reports provider failures without inventing rows", async () => {
    const store: NcaafEspnHistoricalBackfillStore = {
      loadCfbdKickoffs: async () => [
        { season: 2024, kickoffAt: new Date("2024-09-07T20:00:00Z") },
        { season: 2024, kickoffAt: new Date("2024-09-14T20:00:00Z") },
      ],
      loadCompletedDates: async () => [],
      insert: async () => 0,
      markCompletedDate: async () => undefined,
    };
    const result = await backfillNcaafEspnHistoricalGameEvidence(
      { seasons: [2024], maxDates: 1 },
      store,
      vi.fn().mockRejectedValue(new Error("provider unavailable")),
    );
    expect(result.attemptedDates).toBe(1);
    expect(Object.keys(result.failures)).toHaveLength(1);
    expect(result.fetchedGames).toBe(0);
  });

  it("never marks the current or a future Eastern date complete", async () => {
    const completed: string[] = [];
    const store: NcaafEspnHistoricalBackfillStore = {
      loadCfbdKickoffs: async () => [
        { season: 2024, kickoffAt: new Date("2024-09-14T20:00:00Z") },
        { season: 2024, kickoffAt: new Date("2024-09-15T20:00:00Z") },
      ],
      loadCompletedDates: async () => [],
      insert: async () => 0,
      markCompletedDate: async (date) => { completed.push(date); },
    };
    const fetchByDate = vi.fn().mockResolvedValue([]);
    const result = await backfillNcaafEspnHistoricalGameEvidence({
      seasons: [2024],
      maxDates: 10,
      capturedAt: new Date("2024-09-15T12:00:00-04:00"),
    }, store, fetchByDate);
    expect(fetchByDate).toHaveBeenCalledTimes(1);
    expect(completed).toEqual(["20240914"]);
    expect(result.candidateDates).toBe(1);
  });
});