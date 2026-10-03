import { describe, expect, it, vi } from "vitest";
import { planSharedAnalyticsFixtures, synchronizeSharedAnalyticsFixtures } from "./sharedAnalyticsFixtures";
import { ACTIVE_PRODUCT_SPORTS } from "./sportScope";
import { V4_PROVIDER_KEYS } from "./v4FullSlate";
import type { FetchedGame } from "./espn";

const now = new Date("2026-10-03T18:00:00Z"), end = new Date("2026-10-10T18:00:00Z");
const fixture = (sport = "NFL", overrides: Partial<FetchedGame> = {}) => ({
  espnId: `${sport}-123`, sport, homeTeamId: "1", awayTeamId: "2",
  homeTeamName: "Home", awayTeamName: "Away", homeTeamAbbr: "H", awayTeamAbbr: "A",
  homeTeamRecord: "1-0", awayTeamRecord: "0-1",
  commenceTimeISO: "2026-10-04T17:00:00Z", gameDate: "2026-10-04", gameTime: "1:00 PM", status: "upcoming",
  ...overrides,
}) as FetchedGame;
const stored = (game = fixture()) => ({ id: game.espnId, sport: game.sport,
  homeTeamId: game.homeTeamId!, awayTeamId: game.awayTeamId!, startsAt: new Date(game.commenceTimeISO) });

describe("shared Analytics fixture association", () => {
  it.each([...ACTIVE_PRODUCT_SPORTS])("retains the visible %s canonical fixture and orientation", sport => {
    const game = fixture(sport);
    expect(planSharedAnalyticsFixtures([game], [], now, end)).toEqual({ fixtures: [game], conflicts: [] });
  });
  it("deduplicates repeated physical fixtures and remains idempotent", () => {
    const game = fixture();
    const first = planSharedAnalyticsFixtures([game, game], [], now, end);
    const second = planSharedAnalyticsFixtures([game, game], [stored()], now, end);
    expect(first).toEqual(second);
    expect(first.fixtures).toHaveLength(1);
  });
  it("hydrates missing metadata only with corroborated ordered names, canonical ID and date", () => {
    const game = fixture("NBA");
    const existing = { ...stored(game), homeTeamId: null, awayTeamId: null, startsAt: null,
      homeTeamName: game.homeTeamName, awayTeamName: game.awayTeamName, gameDate: game.gameDate, status: "upcoming" };
    expect(planSharedAnalyticsFixtures([game], [existing], now, end).fixtures).toHaveLength(1);
    expect(planSharedAnalyticsFixtures([game], [{ ...existing, awayTeamName: game.homeTeamName }], now, end).fixtures).toHaveLength(0);
    expect(planSharedAnalyticsFixtures([game], [{ ...existing, gameDate: "2026-10-05" }], now, end).fixtures).toHaveLength(0);
  });
  it.each([
    { homeTeamId: "2", awayTeamId: "1" },
    { startsAt: new Date("2026-10-04T12:30:00Z") },
    { sport: "NBA" },
  ])("rejects ordered-team/kickoff/sport conflicts without guessing", changes => {
    const result = planSharedAnalyticsFixtures([fixture()], [{ ...stored(), ...changes }], now, end);
    expect(result.fixtures).toHaveLength(0);
    expect(result.conflicts[0]?.reason).toBe("EXISTING_ORDERED_TEAM_OR_KICKOFF_CONFLICT");
  });
  it("never inserts a second game beside a historical native alias", () => {
    const result = planSharedAnalyticsFixtures([fixture()], [{ ...stored(), id: "123" }], now, end);
    expect(result.fixtures).toHaveLength(0);
    expect(result.conflicts[0]?.reason).toBe("EXISTING_NATIVE_ALIAS_REQUIRES_VERIFIED_RESOLUTION");
  });
  it("quarantines contradictory provider duplicates rather than selecting one", () => {
    const result = planSharedAnalyticsFixtures([fixture(), fixture("NFL", { awayTeamId: "3" })], [], now, end);
    expect(result.fixtures).toHaveLength(0);
    expect(result.conflicts[0]?.reason).toBe("CONFLICTING_PROVIDER_DUPLICATES");
  });
  it("never synchronizes already-started, final, or out-of-horizon events", () => {
    const result = planSharedAnalyticsFixtures([
      fixture("NFL", { commenceTimeISO: now.toISOString() }), fixture("NFL", { status: "final" }),
      fixture("NFL", { commenceTimeISO: end.toISOString() }),
    ], [], now, end);
    expect(result.fixtures).toHaveLength(0);
  });
  it("requires real team identities, canonical IDs and the correct Eastern date", () => {
    for (const changes of [{ homeTeamId: undefined }, { espnId: "123" }, { gameDate: "2026-10-05" }]) {
      expect(planSharedAnalyticsFixtures([fixture("NFL", changes)], [], now, end).fixtures).toHaveLength(0);
    }
  });
  it("discovers every active source from the existing registries, not a new sport list", async () => {
    const fetch = vi.fn(async (_key: string, _date: string, _options?: { throwOnError?: boolean; limit?: number }) => [] as FetchedGame[]);
    const reports = await synchronizeSharedAnalyticsFixtures(now, 7, {
      fetch, load: async () => [], persist: async () => 0,
    });
    expect(reports.map(row => row.sport)).toEqual([...ACTIVE_PRODUCT_SPORTS]);
    const expected = ACTIVE_PRODUCT_SPORTS.flatMap(sport =>
      V4_PROVIDER_KEYS[(sport === "NCAAB" ? "NCAAMB" : sport.toUpperCase()) as keyof typeof V4_PROVIDER_KEYS]
        .flatMap(key => Array(8).fill(key)));
    expect(fetch.mock.calls.map(call => call[0])).toEqual(expected);
    expect(fetch).toHaveBeenCalledWith("NFL", "20261004", { throwOnError: true });
    expect(fetch.mock.calls.every(call => /^\d{8}$/.test(call[1]))).toBe(true);
    expect(reports.every(row => row.status === "NO_CURRENT_SLATE")).toBe(true);
    expect(fetch).not.toHaveBeenCalledWith("UFC", expect.anything(), expect.anything());
  });
  it("associates tomorrow's NFL slate automatically and writes it idempotently", async () => {
    const games = new Map<string, ReturnType<typeof stored>>();
    const fetch = vi.fn(async (key: string) => key === "NFL" ? [fixture(), fixture()] : []);
    const dependencies = {
      fetch,
      load: async (ids: string[]) => [...games.values()].filter(row => ids.includes(row.id)),
      persist: async (fixtures: readonly FetchedGame[]) => {
        for (const game of fixtures) games.set(game.espnId, stored(game));
        return fixtures.length;
      },
    };
    for (let i = 0; i < 2; i++) {
      const reports = await synchronizeSharedAnalyticsFixtures(now, 7, dependencies);
      expect(reports.find(row => row.sport === "NFL")).toMatchObject({ status: "READY", fixtures: 1, written: 1 });
    }
    expect(games.size).toBe(1);
  });
  it("reports provider errors explicitly without hiding another sport's valid fixture", async () => {
    const reports = await synchronizeSharedAnalyticsFixtures(now, 7, {
      fetch: async key => { if (key === "MLB") throw new Error("timeout"); return key === "NFL" ? [fixture()] : []; },
      load: async () => [], persist: async rows => rows.length,
    });
    expect(reports.find(row => row.sport === "MLB")).toMatchObject({
      status: "BLOCKED", providerFailures: expect.arrayContaining(["MLB/20261003: timeout"]),
    });
    expect(reports.find(row => row.sport === "NFL")?.status).toBe("READY");
  });
  it("retains every day when concurrent requests for the same source complete", async () => {
    const reports = await synchronizeSharedAnalyticsFixtures(now, 7, {
      fetch: async (key, date) => {
        await new Promise(resolve => setTimeout(resolve, Number(date.slice(-2)) % 3));
        return key === "NFL" && ["20261004", "20261005", "20261006"].includes(date)
          ? [fixture("NFL", { espnId: `NFL-${date}`, gameDate: `2026-10-${date.slice(-2)}`,
            commenceTimeISO: `2026-10-${date.slice(-2)}T17:00:00Z` })] : [];
      },
      load: async () => [], persist: async rows => rows.length,
    });
    expect(reports.find(row => row.sport === "NFL")).toMatchObject({ fixtures: 3, written: 3, status: "READY" });
  });
});