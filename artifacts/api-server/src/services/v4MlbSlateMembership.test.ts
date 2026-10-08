import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, gamesTable } from "@workspace/db";
import * as espn from "./espn";
import { classifyDiscoveredEvent, discoverV4Slate } from "./v4FullSlate";

describe("MLB provider-owned slate membership", () => {
  type StoredEvent = Parameters<typeof classifyDiscoveredEvent>[0];
  let stored: StoredEvent[];
  const providerGame = (overrides: Partial<espn.FetchedGame> = {}): espn.FetchedGame => ({
    espnId: "MLB-401907993", sport: "MLB",
    homeTeamId: "4", awayTeamId: "5",
    homeTeamName: "Chicago White Sox", awayTeamName: "Cleveland Guardians",
    homeTeamAbbr: "CHW", awayTeamAbbr: "CLE",
    homeTeamRecord: "", awayTeamRecord: "",
    gameTime: "8:00 PM", gameDate: "2026-10-08",
    commenceTimeISO: "2026-10-09T00:00:00Z", status: "upcoming",
    ...overrides,
  });
  const upsert = vi.fn();

  beforeEach(() => {
    stored = [
      {
        gameId: "MLB-401907988", homeParticipantName: "New York Yankees",
        awayParticipantName: "Tampa Bay Rays",
      },
      {
        gameId: "MLB-401907993", homeParticipantName: "Chicago White Sox",
        awayParticipantName: "Cleveland Guardians",
      },
    ].map((row) => ({
      ...row, sport: "MLB", eventStart: new Date("2026-10-09T00:00:00Z"),
      homeParticipantId: "h", awayParticipantId: "a",
    }));
    upsert.mockReset().mockResolvedValue(undefined);
    vi.spyOn(espn, "fetchSportGamesByDate").mockResolvedValue([providerGame()]);
    vi.spyOn(db, "insert").mockReturnValue({
      values: (values: Record<string, unknown>[]) => ({
        onConflictDoUpdate: async () => {
          for (const value of values) {
            const row = {
              gameId: value.id as string, sport: value.sport as string,
              eventStart: value.startsAt as Date,
              homeParticipantId: value.homeTeamId as string,
              awayParticipantId: value.awayTeamId as string,
              homeParticipantName: value.homeTeamName as string,
              awayParticipantName: value.awayTeamName as string,
            };
            const index = stored.findIndex((entry) => entry.gameId === row.gameId);
            if (index < 0) stored.push(row);
            else stored[index] = row;
          }
          return upsert(values);
        },
      }),
    } as unknown as ReturnType<typeof db.insert>);
    vi.spyOn(db, "select").mockReturnValue({
      from: () => ({ where: () => ({ orderBy: async () => stored }) }),
    } as unknown as ReturnType<typeof db.select>);
    vi.spyOn(db, "delete");
    vi.spyOn(db, "update");
  });

  afterEach(() => vi.restoreAllMocks());

  it("excludes Rays–Yankees on October 8 and retains Guardians–White Sox", async () => {
    const retainedRaysRow = stored[0];
    expect(await discoverV4Slate("MLB", "2026-10-08")).toEqual([
      expect.objectContaining({
        gameId: "MLB-401907993", homeParticipantName: "Chicago White Sox",
        awayParticipantName: "Cleveland Guardians",
        eventStart: "2026-10-09T00:00:00.000Z",
      }),
    ]);
    expect(stored).toHaveLength(2);
    expect(stored[0]).toBe(retainedRaysRow);
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledWith(gamesTable);
    expect(espn.fetchSportGamesByDate)
      .toHaveBeenCalledWith("MLB", "20261008", { throwOnError: true });
  });

  it("returns a genuine empty schedule without deleting historical rows", async () => {
    vi.mocked(espn.fetchSportGamesByDate).mockResolvedValue([]);
    expect(await discoverV4Slate("MLB", "2026-10-08")).toEqual([]);
    expect(stored).toHaveLength(2);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("propagates provider outages instead of showing stale games or a false empty slate", async () => {
    vi.mocked(espn.fetchSportGamesByDate).mockRejectedValue(new Error("schedule unavailable"));
    await expect(discoverV4Slate("MLB", "2026-10-08")).rejects.toThrow("schedule unavailable");
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("deduplicates confirmed games and excludes events moved to another Eastern date", async () => {
    vi.mocked(espn.fetchSportGamesByDate).mockResolvedValue([
      providerGame(), providerGame(),
      providerGame({ espnId: "MLB-401907988", gameDate: "2026-10-09" }),
    ]);
    expect((await discoverV4Slate("MLB", "2026-10-08")).map((event) => event.gameId))
      .toEqual(["MLB-401907993"]);
    expect(upsert.mock.calls[0][0]).toHaveLength(1);
  });

  it("includes newly scheduled games while retaining unrelated stored games", async () => {
    vi.mocked(espn.fetchSportGamesByDate).mockResolvedValue([
      providerGame({ espnId: "MLB-new-confirmed" }),
    ]);
    expect((await discoverV4Slate("MLB", "2026-10-08")).map((event) => event.gameId))
      .toEqual(["MLB-new-confirmed"]);
    expect(stored).toHaveLength(3);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("preserves discovery behavior for other sports", async () => {
    vi.mocked(espn.fetchSportGamesByDate).mockResolvedValue([]);
    stored = stored.map((row) => ({ ...row, sport: "NFL" }));
    expect(await discoverV4Slate("NFL", "2026-10-08")).toHaveLength(2);
    expect(espn.fetchSportGamesByDate).toHaveBeenCalledWith("NFL", "20261008");
  });
});
