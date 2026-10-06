import { describe, expect, it, vi } from "vitest";
import {
  ACTIONABLE_ODDS_CACHE_MAX_AGE_MS,
  canonicalTeamName,
  firstValidMoneylineMarket,
  firstValidMoneylineMarketForSport,
  hasValidMoneylineMarket,
  firstValidAmericanOdds,
  getOddsForGameWithStatus,
  getBestLine,
  isActionableOddsCache,
  isPregameCommenceTime,
  isValidAmericanOdds,
  isValidMarketPoint,
  resolveOddsLookup,
  resolveOddsApiKey,
  selectActionableMoneylineMarket,
  selectPregameGameOdds,
} from "./oddsApi";

describe("NCAAF school aliases", () => {
  it("equates Southern Miss and Southern Mississippi without conflating other Mississippi teams", () => {
    expect(canonicalTeamName("Southern Miss Golden Eagles"))
      .toBe(canonicalTeamName("Southern Mississippi Golden Eagles"));
    expect(canonicalTeamName("Southern Miss Golden Eagles"))
      .not.toBe(canonicalTeamName("Mississippi Rebels"));
    expect(canonicalTeamName("Southern Miss Golden Eagles"))
      .not.toBe(canonicalTeamName("Mississippi State Bulldogs"));
  });
});

describe("preseason provider routing", () => {
  const now = new Date("2026-10-03T23:00:00Z");
  const start = "2026-10-04T23:00:00Z";
  const event = (id: string, commenceTime = start) => ({
    id, home_team: "Denver Nuggets", away_team: "Utah Jazz",
    commence_time: commenceTime,
    bookmakers: [{
      key: "pinnacle", title: "Pinnacle", last_update: now.toISOString(),
      markets: [{ key: "h2h", outcomes: [
        { name: "Denver Nuggets", price: -120 }, { name: "Utah Jazz", price: 110 },
      ] }],
    }],
  });

  async function runLookup(responses: unknown[]) {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv("ODDS_API_KEY", "test-key");
    const fetchMock = vi.fn();
    for (const body of responses) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
    }
    vi.stubGlobal("fetch", fetchMock);
    const module = await import("./oddsApi");
    const lookup = await module.getOddsForGameWithStatus("NBA", null, "Denver Nuggets", "Utah Jazz", start);
    return { lookup, fetchMock, module };
  }

  it("uses the active NBA preseason feed only after the regular feed has no matching fixture", async () => {
    try {
      const { lookup, fetchMock } = await runLookup([
        [], [{ key: "basketball_nba_preseason", active: true }], [event("preseason-real-event")],
      ]);
      expect(lookup.odds?.providerEventId).toBe("preseason-real-event");
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[2]![0]).toContain("/basketball_nba_preseason/odds/");
    } finally {
      vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
    }
  });

  it("does not query a preseason feed when a regular-season fixture already matches", async () => {
    try {
      const { lookup, fetchMock } = await runLookup([[event("regular-real-event")]]);
      expect(lookup.odds?.providerEventId).toBe("regular-real-event");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
    }
  });

  it("does not borrow a different date's preseason event for the same teams", async () => {
    try {
      const { lookup } = await runLookup([
        [], [{ key: "basketball_nba_preseason", active: true }],
        [event("wrong-fixture", "2026-10-10T23:00:00Z")],
      ]);
      expect(lookup.odds).toBeNull();
    } finally {
      vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
    }
  });

  it("does not request inactive preseason markets and caches the catalog across games", async () => {
    try {
      const { lookup, fetchMock, module } = await runLookup([
        [], [{ key: "basketball_nba_preseason", active: false }],
      ]);
      expect(lookup.odds).toBeNull();
      await module.getOddsForGameWithStatus("NBA", null, "Other Home", "Other Away", start);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
    }
  });

  it("reports a catalog failure instead of silently treating it as absent odds", async () => {
    try {
      vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now);
      vi.stubEnv("ODDS_API_KEY", "test-key");
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response("[]"))
        .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
      vi.stubGlobal("fetch", fetchMock);
      const module = await import("./oddsApi");
      for (let index = 0; index < 3; index++) {
        expect(await module.getOddsForGameWithStatus("NBA", null, "Denver Nuggets", "Utah Jazz", start))
          .toMatchObject({ odds: null, providerUnavailable: true });
      }
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
    }
  });

  it("keeps the regular NFL key during the preseason/regular-season overlap", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05T12:00:00Z"));
    try {
      expect(resolveOddsApiKey("NFL")).toBe("americanfootball_nfl");
    } finally { vi.useRealTimers(); }
  });
});

describe("provider team identity normalization", () => {
  it.each([
    ["LA Clippers", "Los Angeles Clippers"],
    ["AFC Bournemouth", "Bournemouth"],
    ["Brighton & Hove Albion", "Brighton and Hove Albion"],
    ["Internazionale", "Inter Milan"],
    ["1. FC Union Berlin", "Union Berlin"],
    ["SV Elversberg", "Elversberg"],
    ["SC Paderborn 07", "SC Paderborn"],
    ["Mainz", "FSV Mainz 05"],
    ["FC Augsburg", "Augsburg"],
    ["Hamburg SV", "Hamburger SV"],
    ["Lens", "RC Lens"],
    ["Le Havre AC", "Le Havre"],
    ["Le Mans", "Le Mans FC"],
    ["Paris Saint-Germain", "Paris Saint Germain"],
    ["Kasimpasa", "Kasimpasa SK"],
    ["Genclerbirligi", "Genclerbirligi SK"],
    ["Amed SFK", "Amed SK"],
    ["Feyenoord Rotterdam", "Feyenoord"],
    ["FC Twente", "FC Twente Enschede"],
    ["Ajax Amsterdam", "Ajax"],
    ["Chicago Fire FC", "Chicago Fire"],
    ["Vancouver Whitecaps", "Vancouver Whitecaps FC"],
    ["Red Bull New York", "New York Red Bulls"],
    ["Columbus Crew", "Columbus Crew SC"],
  ])("matches the corroborated alias %s to %s", (espn, provider) => {
    expect(canonicalTeamName(espn)).toBe(canonicalTeamName(provider));
  });

  it("does not merge similarly named clubs or remove arbitrary club prefixes", () => {
    expect(canonicalTeamName("Inter Miami CF")).not.toBe(canonicalTeamName("Inter Milan"));
    expect(canonicalTeamName("Manchester United")).not.toBe(canonicalTeamName("Manchester City"));
    expect(canonicalTeamName("FC Unknown")).not.toBe(canonicalTeamName("Unknown"));
  });

  it("matches the current La Liga aliases used by ESPN and The Odds API", () => {
    expect(canonicalTeamName("Athletic Club")).toBe(canonicalTeamName("Athletic Bilbao"));
    expect(canonicalTeamName("Deportivo")).toBe(canonicalTeamName("Deportivo La Coruña"));
    expect(canonicalTeamName("Racing Santander")).toBe(canonicalTeamName("Real Racing Club de Santander"));
  });

  it("normalizes accents without deleting the accented letter", () => {
    expect(canonicalTeamName("Atlético Madrid")).toBe("atletico madrid");
    expect(canonicalTeamName("Málaga CF")).toBe("malaga");
  });
});

describe("American odds validation", () => {
  it("memoizes a failed provider fetch and reports the provider unavailable", async () => {
    vi.stubEnv("ODDS_API_KEY", "test-key");
    const fetchMock = vi.fn().mockRejectedValue(new Error("temporary provider outage"));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const lookups = [];
      for (let game = 0; game < 5; game++) {
        lookups.push(await getOddsForGameWithStatus("NCAAB", null, `Home ${game}`, `Away ${game}`));
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(lookups).toHaveLength(5);
      expect(lookups.every((lookup) => lookup.providerUnavailable)).toBe(true);
      expect(lookups[0]).toMatchObject({
        odds: null,
        marketBlockedByProviderStart: false,
        providerUnavailable: true,
      });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("rejects an absent zero value from an upstream feed", () => {
    expect(isValidAmericanOdds(0)).toBe(false);
    expect(isValidAmericanOdds(null)).toBe(false);
    expect(isValidAmericanOdds(undefined)).toBe(false);
  });

  it("rejects malformed and implausible pregame prices", () => {
    expect(isValidAmericanOdds(1)).toBe(false);
    expect(isValidAmericanOdds(-1)).toBe(false);
    expect(isValidAmericanOdds(-9_900)).toBe(false);
    expect(isValidAmericanOdds(3_300)).toBe(false);
    expect(isValidAmericanOdds(-160)).toBe(true);
    expect(isValidAmericanOdds(125)).toBe(true);
  });

  it("does not treat a started market as pregame pricing", () => {
    const now = Date.UTC(2026, 7, 22, 18, 0, 0);
    expect(isPregameCommenceTime("2026-08-22T18:05:00.000Z", now)).toBe(true);
    expect(isPregameCommenceTime("2026-08-22T17:59:59.000Z", now)).toBe(false);
    expect(isPregameCommenceTime("not-a-date", now)).toBe(false);
  });

  it("allows a failed-refresh cache only within the actionable freshness window", () => {
    const now = Date.UTC(2026, 7, 22, 18, 0, 0);
    expect(isActionableOddsCache(now - ACTIONABLE_ODDS_CACHE_MAX_AGE_MS, now)).toBe(true);
    expect(isActionableOddsCache(now - ACTIONABLE_ODDS_CACHE_MAX_AGE_MS - 1, now)).toBe(false);
    expect(isActionableOddsCache(now + 1, now)).toBe(false);
  });

  it("never selects a provider entry after the provider market has started", () => {
    const now = Date.UTC(2026, 7, 22, 18, 0, 0);
    const startedMarket = {
      consensusHomeOdds: -120,
      consensusAwayOdds: 100,
      bookmakerOdds: [],
      commenceTime: "2026-08-22T17:59:00.000Z",
    };

    expect(selectPregameGameOdds(
      [startedMarket],
      "2026-08-22T18:30:00.000Z",
      now,
    )).toBeNull();
  });

  it("rejects a future provider market when ESPN's scheduled start has already passed", () => {
    const now = Date.UTC(2026, 7, 22, 18, 0, 0);
    const futureProviderMarket = {
      consensusHomeOdds: -120,
      consensusAwayOdds: 100,
      bookmakerOdds: [],
      commenceTime: "2026-08-22T18:30:00.000Z",
    };

    expect(selectPregameGameOdds(
      [futureProviderMarket],
      "2026-08-22T17:59:00.000Z",
      now,
    )).toBeNull();
  });

  it("does not fall back to ESPN prices when the matching provider event is already live", () => {
    const fallbackMarket = { homeOdds: -120, awayOdds: 100 };

    expect(selectActionableMoneylineMarket(
      "MLB",
      { odds: null, marketBlockedByProviderStart: true },
      fallbackMarket,
    )).toBeUndefined();

    expect(selectActionableMoneylineMarket(
      "MLB",
      { odds: null, marketBlockedByProviderStart: false },
      fallbackMarket,
    )).toEqual(fallbackMarket);
  });

  it("carries a started provider entry through lookup into the ESPN fallback block", () => {
    const now = Date.UTC(2026, 7, 22, 18, 0, 0);
    const lookup = resolveOddsLookup(
      [{
        consensusHomeOdds: -120,
        consensusAwayOdds: 100,
        bookmakerOdds: [],
        commenceTime: "2026-08-22T17:59:00.000Z",
      }],
      "2026-08-22T18:30:00.000Z",
      now,
    );

    expect(lookup).toEqual({ odds: null, marketBlockedByProviderStart: true });
    expect(selectActionableMoneylineMarket(
      "MLB",
      lookup,
      { homeOdds: -120, awayOdds: 100 },
    )).toBeUndefined();
  });

  it("blocks ESPN fallback when a live provider event has no valid normalized moneyline", () => {
    const now = Date.UTC(2026, 7, 22, 18, 0, 0);
    const lookup = resolveOddsLookup(
      undefined,
      "2026-08-22T18:30:00.000Z",
      now,
      ["2026-08-22T17:59:00.000Z"],
    );

    expect(lookup).toEqual({ odds: null, marketBlockedByProviderStart: true });
    expect(selectActionableMoneylineMarket(
      "MLB",
      lookup,
      { homeOdds: -120, awayOdds: 100 },
    )).toBeUndefined();
  });

  it("keeps a stored valid moneyline when the new response is empty", () => {
    expect(firstValidAmericanOdds(0, null, -127)).toBe(-127);
  });

  it("always prefers a fresh valid market over an older stored line", () => {
    expect(firstValidAmericanOdds(-118, -127)).toBe(-118);
  });

  it("requires both sides of the same moneyline market", () => {
    expect(hasValidMoneylineMarket({ homeOdds: -125, awayOdds: 105 })).toBe(true);
    expect(hasValidMoneylineMarket({ homeOdds: -125, awayOdds: 0 })).toBe(false);

    const selected = firstValidMoneylineMarket(
      { homeOdds: -125, awayOdds: 0 },
      { homeOdds: -118, awayOdds: 102 },
    );
    expect(selected).toEqual({ homeOdds: -118, awayOdds: 102 });
  });

  it("requires all three Soccer outcomes from a single valid market", () => {
    const selected = firstValidMoneylineMarketForSport(
      "Soccer",
      { homeOdds: 125, awayOdds: 220, drawOdds: 0 },
      { homeOdds: 135, awayOdds: 210, drawOdds: 230 },
    );
    expect(selected).toEqual({ homeOdds: 135, awayOdds: 210, drawOdds: 230 });
    expect(firstValidMoneylineMarketForSport(
      "Soccer",
      { homeOdds: 125, awayOdds: 220 },
    )).toBeUndefined();
  });

  it("rejects malformed spread and total points", () => {
    expect(isValidMarketPoint(-1.5, "spread")).toBe(true);
    expect(isValidMarketPoint(Number.POSITIVE_INFINITY, "spread")).toBe(false);
    expect(isValidMarketPoint(120, "spread")).toBe(false);
    expect(isValidMarketPoint(8.5, "total")).toBe(true);
    expect(isValidMarketPoint(0, "total")).toBe(false);
    expect(isValidMarketPoint(999, "total")).toBe(false);
  });
});

describe("best available line", () => {
  const gameOdds = {
    consensusHomeOdds: -144,
    consensusAwayOdds: 120,
    commenceTime: "2026-08-29T00:00:00.000Z",
    bookmakerOdds: [
      { book: "everygame", homeOdds: -145, awayOdds: 125 },
      { book: "betfair_ex_eu", homeOdds: -132, awayOdds: 124 },
      { book: "betrivers", homeOdds: -148, awayOdds: 123 },
      { book: "fanduel", homeOdds: -144, awayOdds: 122 },
      { book: "draftkings", homeOdds: -143, awayOdds: 119 },
    ],
  };

  it("selects the best recognized US-facing price instead of an offshore or exchange quote", () => {
    expect(getBestLine(gameOdds, false)).toEqual({ book: "betrivers", odds: 123 });
  });

  it("still selects the correct side of each eligible two-way market", () => {
    expect(getBestLine(gameOdds, true)).toEqual({ book: "draftkings", odds: -143 });
  });

  it("omits best-line guidance when only non-actionable books are available", () => {
    expect(getBestLine({
      ...gameOdds,
      bookmakerOdds: [
        { book: "everygame", homeOdds: -145, awayOdds: 125 },
        { book: "betfair_ex_eu", homeOdds: -132, awayOdds: 124 },
      ],
    }, false)).toBeNull();
  });
});