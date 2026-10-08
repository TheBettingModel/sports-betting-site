import { afterEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-10-08T19:45:00Z");
const kickoff = "2026-10-08T23:00:00Z";

function providerEvent(options: { home?: string; kickoff?: string } = {}) {
  const home = options.home ?? "Liberty Flames";
  return {
    id: "sam-houston-liberty-provider-event",
    home_team: home,
    away_team: "Sam Houston State Bearkats",
    commence_time: options.kickoff ?? kickoff,
    bookmakers: [
      { key: "fanduel", title: "FanDuel", prices: [-520, 385] },
      { key: "pinnacle", title: "Pinnacle", prices: [-565, 430] },
    ].map((book) => ({
      key: book.key,
      title: book.title,
      last_update: now.toISOString(),
      markets: [{
        key: "h2h",
        outcomes: [
          { name: home, price: book.prices[0]! },
          { name: "Sam Houston State Bearkats", price: book.prices[1]! },
        ],
      }],
    })),
  };
}

async function lookup(event = providerEvent(), at = now) {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(at);
  vi.stubEnv("ODDS_API_KEY", "test-key");
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify([event]), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const oddsApi = await import("./oddsApi");
  const result = await oddsApi.getOddsForGameWithStatus(
    "NCAAF", null, "Liberty Flames", "Sam Houston Bearkats", kickoff,
  );
  return { result, fetchMock, oddsApi };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Sam Houston–Liberty Analytics market matching", () => {
  it("matches the verified provider alias and makes both public and sharp quotes capturable", async () => {
    const { result, fetchMock } = await lookup();
    expect(result.odds?.providerEventId).toBe("sam-houston-liberty-provider-event");
    expect(result.marketBlockedByProviderStart).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toContain("/americanfootball_ncaaf/odds/");

    const { buildMoneylineSnapshotRows } = await import("./marketSnapshotCapture");
    const rows = buildMoneylineSnapshotRows("NCAAF", result.odds!.bookmakerOdds, now);
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => !row.isSharp).map((row) => row.price)).toEqual([-520, 385]);
    expect(rows.filter((row) => row.isSharp).map((row) => row.price)).toEqual([-565, 430]);
    expect(rows.every((row) => row.capturedAt.getTime() === now.getTime())).toBe(true);
  });

  it("does not match the alias to a different opponent", async () => {
    const { result } = await lookup(providerEvent({ home: "Troy Trojans" }));
    expect(result.odds).toBeNull();
  });

  it("does not match another day's meeting between the same teams", async () => {
    const { result } = await lookup(providerEvent({ kickoff: "2026-10-09T23:00:00Z" }));
    expect(result.odds).toBeNull();
  });

  it("does not revive a started fixture as a pregame market", async () => {
    const { result } = await lookup(providerEvent(), new Date("2026-10-08T23:01:00Z"));
    expect(result.odds).toBeNull();
    expect(result.marketBlockedByProviderStart).toBe(true);
  });

  it("does not broadly remove State or conflate other Houston schools", async () => {
    const { oddsApi } = await lookup();
    expect(oddsApi.canonicalTeamName("Sam Houston State Bearkats"))
      .toBe(oddsApi.canonicalTeamName("Sam Houston Bearkats"));
    expect(oddsApi.canonicalTeamName("Texas State Bobcats"))
      .not.toBe(oddsApi.canonicalTeamName("Texas Bobcats"));
    expect(oddsApi.canonicalTeamName("Sam Houston State Bearkats"))
      .not.toBe(oddsApi.canonicalTeamName("Houston Cougars"));
  });
});
