import assert from "node:assert/strict";
import test from "node:test";
import type { FetchedGame, SportFetchResult } from "../src/services/espn";
import type { GameOdds } from "../src/services/oddsApi";
import {
  PREVIEW_ANALYTICS_GAMES_PER_SPORT,
  PREVIEW_ANALYTICS_PROVIDER_GROUPS_PER_RUN,
  PREVIEW_ANALYTICS_TIME_LIMIT_MS,
  runPreviewMarketEvidenceCapture,
  type PreviewAnalyticsGame,
} from "./run-preview-market-evidence-capture";

const fixedNow = new Date("2026-09-26T10:00:00.000Z");

function persistedGame(
  sport: string,
  index: number,
  overrides: Partial<PreviewAnalyticsGame> = {},
): PreviewAnalyticsGame {
  return {
    gameId: `${sport}-${index}`,
    sport,
    league: null,
    homeTeamName: `${sport} Home ${index}`,
    awayTeamName: `${sport} Away ${index}`,
    startsAt: new Date(fixedNow.getTime() + (index + 1) * 60 * 60 * 1000),
    ...overrides,
  };
}

function scoreboardGame(game: PreviewAnalyticsGame, status = "upcoming"): FetchedGame {
  return {
    espnId: game.gameId,
    sport: game.sport,
    league: game.league ?? undefined,
    homeTeamName: game.homeTeamName,
    awayTeamName: game.awayTeamName,
    homeTeamAbbr: "H",
    awayTeamAbbr: "A",
    homeTeamRecord: "0-0",
    awayTeamRecord: "0-0",
    gameTime: "TBD",
    gameDate: "2026-09-26",
    commenceTimeISO: game.startsAt.toISOString(),
    status: status as FetchedGame["status"],
  };
}

function gameOdds(gameId: string, startsAt: Date): GameOdds {
  return {
    providerEventId: `provider-${gameId}`,
    consensusHomeOdds: -110,
    consensusAwayOdds: 100,
    bookmakerOdds: [{
      book: "pinnacle",
      homeOdds: -110,
      awayOdds: 100,
      lastUpdate: new Date(fixedNow.getTime() - 1000).toISOString(),
    }],
    commenceTime: startsAt.toISOString(),
  };
}

function baseDependencies(games: PreviewAnalyticsGame[]) {
  return {
    now: () => fixedNow,
    monotonicNow: () => 1000,
    nodeEnv: "development",
    publicationEnabled: false,
    fetchSports: async (): Promise<SportFetchResult[]> => [{
      sport: "NCAAF",
      games: games.map((game) => scoreboardGame(game)),
      fetchStatus: "ok",
    }],
    loadPersistedGames: async () => games,
    resolveProviderKey: (sport: string, league: string | null) => `${sport}:${league ?? "default"}`,
    getOdds: async (sport: string, _league: string | null, home: string) => {
      const game = games.find((row) => row.sport === sport && row.homeTeamName === home);
      return { odds: game ? gameOdds(game.gameId, game.startsAt) : null, marketBlockedByProviderStart: false };
    },
    capture: async () => 2,
  };
}

test("refuses production and publication-enabled contexts before fetching", async () => {
  let fetchCalls = 0;
  const fetchSports = async (): Promise<SportFetchResult[]> => {
    fetchCalls++;
    return [];
  };
  const production = await runPreviewMarketEvidenceCapture({
    ...baseDependencies([]),
    nodeEnv: "production",
    fetchSports,
  });
  assert.equal(production.status, "FAILED");
  assert.match(production.failures.join(" "), /NODE_ENV must be exactly development/);

  const publication = await runPreviewMarketEvidenceCapture({
    ...baseDependencies([]),
    publicationEnabled: true,
    fetchSports,
  });
  assert.equal(publication.status, "FAILED");
  assert.match(publication.failures.join(" "), /PUBLICATION_ENABLED=true/);
  assert.equal(fetchCalls, 0);
});

test("caps provider groups at four and rotates deferred groups across runs", async () => {
  const games = Array.from({ length: 5 }, (_, index) => persistedGame(
    "Soccer",
    index,
    { league: `league-${index}` },
  ));
  const providerCalls = new Map<string, number>();
  const summaries = [];
  for (let run = 0; run < 2; run++) {
    const now = new Date(fixedNow.getTime() + run * 15 * 60 * 1000);
    const result = await runPreviewMarketEvidenceCapture({
      ...baseDependencies(games),
      now: () => now,
      resolveProviderKey: (_sport, league) => league,
      getOdds: async (_sport, league, home) => {
        providerCalls.set(league!, (providerCalls.get(league!) ?? 0) + 1);
        const game = games.find((row) => row.homeTeamName === home)!;
        return { odds: gameOdds(game.gameId, game.startsAt), marketBlockedByProviderStart: false };
      },
    });
    summaries.push(result);
  }
  assert.equal(summaries[0]!.providerGroupsAttempted, PREVIEW_ANALYTICS_PROVIDER_GROUPS_PER_RUN);
  assert.equal(summaries[0]!.providerGroupsDeferred, 1);
  assert.equal(summaries[0]!.status, "PARTIAL");
  assert.equal(providerCalls.size, 5);
  assert.deepEqual([...providerCalls.values()].sort(), [1, 1, 2, 2, 2]);
});

test("reserves one provider slot for today's NCAAF games", async () => {
  const games = [
    persistedGame("NCAAF", 1, { league: "NCAAF" }),
    ...Array.from({ length: 5 }, (_, index) => persistedGame(
      "Soccer",
      index,
      { league: `soccer-${index}` },
    )),
  ];
  const attemptedSports = new Set<string>();
  const result = await runPreviewMarketEvidenceCapture({
    ...baseDependencies(games),
    resolveProviderKey: (sport, league) => sport === "NCAAF" ? "americanfootball_ncaaf" : league,
    getOdds: async (sport, league, home) => {
      attemptedSports.add(sport);
      const game = games.find((row) => row.homeTeamName === home)!;
      return { odds: gameOdds(game.gameId, game.startsAt), marketBlockedByProviderStart: false };
    },
  });
  assert.equal(result.providerGroupsAttempted, PREVIEW_ANALYTICS_PROVIDER_GROUPS_PER_RUN);
  assert.equal(result.sports.find((sport) => sport.sport === "NCAAF")?.providerGroupsAttempted, 1);
  assert.ok(attemptedSports.has("NCAAF"));
});

test("prefers near-kickoff provider groups before later future slates", async () => {
  const games = [
    persistedGame("NCAAF", 1, { league: "NCAAF" }),
    ...[
      ["today", 4],
      ["tomorrow", 26],
      ["later", 50],
      ["last", 74],
    ].map(([league, hours]) => persistedGame(
      "Soccer",
      Number(hours),
      {
        league: String(league),
        startsAt: new Date(fixedNow.getTime() + Number(hours) * 60 * 60 * 1000),
      },
    )),
  ];
  const attemptedLeagues = new Set<string>();
  const result = await runPreviewMarketEvidenceCapture({
    ...baseDependencies(games),
    resolveProviderKey: (sport, league) => sport === "NCAAF" ? "americanfootball_ncaaf" : league,
    getOdds: async (sport, league, home) => {
      attemptedLeagues.add(sport === "NCAAF" ? "NCAAF" : league!);
      const game = games.find((row) => row.homeTeamName === home)!;
      return { odds: gameOdds(game.gameId, game.startsAt), marketBlockedByProviderStart: false };
    },
  });
  assert.equal(result.providerGroupsAttempted, PREVIEW_ANALYTICS_PROVIDER_GROUPS_PER_RUN);
  assert.deepEqual(
    [...attemptedLeagues].sort(),
    ["NCAAF", "later", "today", "tomorrow"].sort(),
  );
});

test("caps each sport at 20 games and rotates the persisted slate", async () => {
  const games = Array.from({ length: 25 }, (_, index) => persistedGame("NCAAF", index, {
    startsAt: new Date(fixedNow.getTime() + 60 * 60 * 1000 + (index + 1) * 60 * 1000),
  }));
  const captured = new Set<string>();
  for (let run = 0; run < 2; run++) {
    const now = new Date(fixedNow.getTime() + run * 15 * 60 * 1000);
    const result = await runPreviewMarketEvidenceCapture({
      ...baseDependencies(games),
      now: () => now,
      capture: async ({ gameId }) => {
        captured.add(gameId);
        return 2;
      },
    });
    assert.ok(result.gamesAttempted <= PREVIEW_ANALYTICS_GAMES_PER_SPORT);
  }
  assert.equal(captured.size, 25);
});

test("chooses today's NCAAF games before later games in its seven-day slate", async () => {
  const today = persistedGame("NCAAF", 0, { startsAt: new Date(fixedNow.getTime() + 60 * 60 * 1000) });
  const future = Array.from({ length: 20 }, (_, index) => persistedGame(
    "NCAAF",
    index + 1,
    { startsAt: new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000 + index * 60 * 60 * 1000) },
  ));
  const captured: string[] = [];
  const result = await runPreviewMarketEvidenceCapture({
    ...baseDependencies([today, ...future]),
    capture: async ({ gameId }) => {
      captured.push(gameId);
      return 2;
    },
  });
  assert.equal(result.gamesAttempted, PREVIEW_ANALYTICS_GAMES_PER_SPORT);
  assert.equal(captured[0], today.gameId);
  assert.ok(!captured.includes(future.at(-1)!.gameId));
});

test("applies the 20-game cap across a sport with multiple leagues", async () => {
  const games = Array.from({ length: 21 }, (_, index) => persistedGame(
    "Soccer",
    index,
    { league: `league-${index % 2}` },
  ));
  const result = await runPreviewMarketEvidenceCapture({
    ...baseDependencies(games),
    resolveProviderKey: (_sport, league) => league,
  });
  assert.equal(result.providerGroupsAttempted, 2);
  assert.equal(result.gamesAttempted, PREVIEW_ANALYTICS_GAMES_PER_SPORT);
});

test("reports unsupported Soccer leagues once as expected unavailable", async () => {
  const games = Array.from({ length: 4 }, (_, index) => persistedGame(
    "Soccer",
    index,
    { league: "MLS" },
  ));
  const result = await runPreviewMarketEvidenceCapture({
    ...baseDependencies(games),
    resolveProviderKey: () => null,
  });
  assert.equal(result.status, "UNAVAILABLE");
  assert.deepEqual(result.failures, []);
  assert.equal(result.unavailable.length, 1);
  assert.match(result.unavailable[0]!, /Soccer\/MLS is unavailable/);
  assert.equal(result.sports.find((sport) => sport.sport === "Soccer")?.unavailable.length, 1);
});

test("filters started and scoreboard-postponed games", async () => {
  const eligible = persistedGame("NCAAF", 1);
  const started = persistedGame("NCAAF", 2, { startsAt: new Date(fixedNow.getTime() - 1000) });
  const postponed = persistedGame("NCAAF", 3);
  const result = await runPreviewMarketEvidenceCapture({
    ...baseDependencies([eligible, started, postponed]),
    fetchSports: async () => [{
      sport: "NCAAF",
      games: [scoreboardGame(eligible), scoreboardGame(postponed, "postponed")],
      fetchStatus: "ok",
    }],
  });
  assert.equal(result.gamesAttempted, 1);
  assert.equal(result.skippedGames, 2);
  assert.equal(result.snapshotRowsAttempted, 2);
});

test("reports provider failures without leaking API keys", async () => {
  const result = await runPreviewMarketEvidenceCapture({
    ...baseDependencies([persistedGame("NCAAF", 1)]),
    getOdds: async () => {
      throw new Error("request failed at ?apiKey=private-key");
    },
  });
  assert.equal(result.status, "PARTIAL");
  assert.doesNotMatch(result.failures.join(" "), /private-key/);
  assert.match(result.sports[0]?.failures.join(" ") ?? "", /apiKey=\[redacted\]/);
});

test("does no provider work when discovery exhausts the cooperative time bound", async () => {
  let reads = 0;
  let lookups = 0;
  const result = await runPreviewMarketEvidenceCapture({
    ...baseDependencies([persistedGame("NCAAF", 1)]),
    monotonicNow: () => (reads++ === 0 ? 0 : PREVIEW_ANALYTICS_TIME_LIMIT_MS + 1),
    getOdds: async () => {
      lookups++;
      return { odds: null, marketBlockedByProviderStart: false };
    },
  });
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.gamesAttempted, 0);
  assert.equal(lookups, 0);
});

test("reports an empty persisted slate clearly", async () => {
  const result = await runPreviewMarketEvidenceCapture(baseDependencies([]));
  assert.equal(result.status, "NO_UPCOMING_GAMES");
  assert.equal(result.providerGroupsAttempted, 0);
  assert.equal(result.snapshotRowsAttempted, 0);
});