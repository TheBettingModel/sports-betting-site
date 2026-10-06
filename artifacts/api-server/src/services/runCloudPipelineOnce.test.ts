import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./sharedAnalyticsFixtures", () => ({ synchronizeSharedAnalyticsFixtures: vi.fn(async () => []) }));

const { mocks } = vi.hoisted(() => ({
  mocks: {
    capture: vi.fn(),
    loadEvidence: vi.fn(),
    getOdds: vi.fn(),
    resolveProviderKey: vi.fn(),
    desc: vi.fn(),
    dbSelect: vi.fn(),
    dbSelectDistinctOn: vi.fn(),
    mlbEvidence: vi.fn(),
    ncaafEvidence: vi.fn(),
    oddsIngestion: vi.fn(),
  },
}));

vi.mock("@workspace/db", () => ({
  db: { select: mocks.dbSelect, selectDistinctOn: mocks.dbSelectDistinctOn },
  gamesTable: {
    id: "games.id",
    sport: "games.sport",
    league: "games.league",
    startsAt: "games.startsAt",
    homeTeamName: "games.homeTeamName",
    awayTeamName: "games.awayTeamName",
  },
  marketsTable: { id: "markets.id", slug: "markets.slug" },
  ncaafGameEvidenceTable: { id: "ncaafGameEvidence.id", provider: "ncaafGameEvidence.provider", providerEventId: "ncaafGameEvidence.providerEventId" },
  ncaafMarketObservationsTable: {
    providerEventId: "ncaafMarketObservations.providerEventId",
    gameEvidenceId: "ncaafMarketObservations.gameEvidenceId",
    provider: "ncaafMarketObservations.provider",
    marketKey: "ncaafMarketObservations.marketKey",
    observationPhase: "ncaafMarketObservations.observationPhase",
    isMatchedToGame: "ncaafMarketObservations.isMatchedToGame",
    capturedAt: "ncaafMarketObservations.capturedAt",
    id: "ncaafMarketObservations.id",
    payload: "ncaafMarketObservations.payload",
  },
  oddsSnapshotsTable: {
    gameId: "oddsSnapshots.gameId",
    source: "oddsSnapshots.source",
    isAvailable: "oddsSnapshots.isAvailable",
    isStale: "oddsSnapshots.isStale",
    marketId: "oddsSnapshots.marketId",
    capturedAt: "oddsSnapshots.capturedAt",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ and: conditions }),
  asc: (column: unknown) => ({ asc: column }),
  desc: mocks.desc,
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  gt: (column: unknown, value: unknown) => ({ gt: [column, value] }),
  gte: (column: unknown, value: unknown) => ({ gte: [column, value] }),
  inArray: (column: unknown, values: unknown[]) => ({ inArray: [column, values] }),
  lt: (column: unknown, value: unknown) => ({ lt: [column, value] }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings, values,
    mapWith: (decoder: unknown) => ({ strings, values, decoder }),
  }),
}));
vi.mock("../services/marketSnapshotCapture", () => ({
  captureOddsApiMoneylineSnapshots: mocks.capture,
}));
vi.mock("../services/oddsApi", () => ({
  getOddsForGameWithStatus: mocks.getOdds,
  resolveOddsApiKey: mocks.resolveProviderKey,
}));
vi.mock("../services/scheduler", () => ({
  schedulerJobs: {
    mlbV4EvidenceCollection: mocks.mlbEvidence,
    ncaafProductionEvidenceCycle: mocks.ncaafEvidence,
    oddsIngestion: mocks.oddsIngestion,
  },
}));
vi.mock("../services/v4EngineBootstrap241", () => ({
  bootstrapTask241V4Engines: vi.fn(),
}));
vi.mock("../lib/releaseIdentity", () => ({
  getTbmReleaseIdentity: vi.fn(),
}));

// @ts-ignore The executable CLI entrypoint is intentionally outside tsconfig rootDir.
import { captureMarketAnalyticsEvidence, runCloudPipelineOnce, type MarketAnalyticsCaptureSummary } from "../../scripts/run-cloud-pipeline-once";
import { gamesTable, ncaafMarketObservationsTable, oddsSnapshotsTable } from "@workspace/db";
import { ACTIVE_PRODUCT_SPORTS } from "./sportScope";

const releaseIdentity = {
  releaseSha: "a".repeat(40),
  runtimeRole: "scheduler" as const,
  databaseTargetFingerprint: "target-fingerprint",
  enforced: true,
};

const emptyCaptureSummary: MarketAnalyticsCaptureSummary = {
  status: "SUCCEEDED",
  hasOperationalFailures: false,
  horizonDays: 7,
  gameLimitPerSport: 20,
  ncaafGameLimit: 50,
  providerGroupLimit: 4,
  candidateLimitPerSport: 200,
  timeLimitMs: 60_000,
  providerGroupsAttempted: 0,
  providerGroupsDeferred: 0,
  additionalOddsApiRequests: 0,
  persistedUpcomingGames: 1,
  gamesAttempted: 1,
  providerEventsMatched: 1,
  unmatchedGames: 0,
  snapshotsWritten: 2,
  providerQuotesWithoutUsableSnapshots: 0,
  omittedGamesDueToGameLimit: 0,
  omittedGamesDueToProviderLimit: 0,
  omittedGamesDueToCandidateLimit: 0,
  omittedGamesDueToTimeLimit: 0,
  sports: [],
  failures: [],
};

function pipelineRuntime(overrides: Partial<Parameters<typeof runCloudPipelineOnce>[0]> = {}) {
  return {
    publicationEnabled: false,
    releaseIdentity,
    bootstrapEngines: vi.fn(),
    mlbV4EvidenceCollection: vi.fn().mockResolvedValue(undefined),
    ncaafProductionEvidenceCycle: vi.fn().mockResolvedValue(undefined),
    oddsIngestion: vi.fn().mockResolvedValue(undefined),
    captureMarketAnalyticsEvidence: vi.fn().mockResolvedValue(emptyCaptureSummary),
    ...overrides,
  };
}

const now = new Date("2026-09-26T12:00:00.000Z");
const cycleStartedAt = new Date("2026-09-26T11:59:00.000Z");

interface TestAnalyticsInput {
  totalGamesBySport: Record<string, number>;
  games: Array<{
    gameId: string;
    sport: string;
    league: string | null;
    homeTeamName: string;
    awayTeamName: string;
    eventStart: Date;
    latestSnapshotAt: Date | null;
  }>;
  evidence: Array<{ gameId: string; providerEventId: string; payload: unknown }>;
}

function upcomingInput(gameIds = ["persisted-game-1"]): TestAnalyticsInput {
  return {
    totalGamesBySport: { NCAAF: gameIds.length },
    games: gameIds.map((gameId) => ({
      gameId,
      sport: "NCAAF",
      league: null,
      homeTeamName: "Home",
      awayTeamName: "Away",
      eventStart: new Date("2026-09-26T16:00:00.000Z"),
      latestSnapshotAt: null,
    })),
    evidence: gameIds.map((gameId, index) => ({
      gameId,
      providerEventId: `provider-event-${index + 1}`,
      payload: {
        event: {
          id: `provider-event-${index + 1}`,
          home_team: "Home",
          away_team: "Away",
          commence_time: "2026-09-26T16:00:00Z",
          bookmakers: [{
            key: "pinnacle",
            last_update: "2026-09-26T11:55:00Z",
            markets: [{
              key: "h2h",
              outcomes: [
                { name: "Home", price: -110 },
                { name: "Away", price: 100 },
              ],
            }],
          }],
        },
      },
    })),
  };
}

function captureDependencies(input: TestAnalyticsInput) {
  return {
    loadPersistedAnalyticsEvidence: mocks.loadEvidence.mockResolvedValue(input),
    capture: mocks.capture,
    getOdds: mocks.getOdds,
    resolveProviderKey: mocks.resolveProviderKey,
    now: () => now,
    monotonicNow: () => 0,
  };
}

function persistedGame(
  gameId: string,
  sport: string,
  league: string | null = null,
): TestAnalyticsInput["games"][number] {
  return {
    gameId,
    sport,
    league,
    homeTeamName: "Home",
    awayTeamName: "Away",
    eventStart: new Date("2026-09-26T16:00:00.000Z"),
    latestSnapshotAt: null,
  };
}

function providerOnlyInput(games: TestAnalyticsInput["games"]): TestAnalyticsInput {
  const totalGamesBySport: Record<string, number> = {};
  for (const game of games) {
    totalGamesBySport[game.sport] = (totalGamesBySport[game.sport] ?? 0) + 1;
  }
  return { totalGamesBySport, games, evidence: [] };
}

function providerOdds(providerEventId: string) {
  return {
    providerEventId,
    commenceTime: "2026-09-26T16:00:00Z",
    consensusHomeOdds: -110,
    consensusAwayOdds: 100,
    bookmakerOdds: [{
      book: "pinnacle",
      homeOdds: -110,
      awayOdds: 100,
      lastUpdate: "2026-09-26T11:55:00Z",
    }],
  };
}

function databaseQuery(rows: unknown[]) {
  const query: Record<string, any> = {};
  for (const method of ["from", "where", "leftJoin", "groupBy", "orderBy", "limit", "offset", "innerJoin"]) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.then = (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return query;
}

describe("cloud pipeline shadow analytics snapshot capture", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.desc.mockImplementation((column) => ({ desc: column }));
  });

  it("captures Analytics evidence in SHADOW without invoking the publication-capable odds job", async () => {
    const captureEvidence = vi.fn().mockResolvedValue(emptyCaptureSummary);
    const oddsIngestion = vi.fn().mockResolvedValue(undefined);
    const runtime = pipelineRuntime({
      publicationEnabled: false,
      captureMarketAnalyticsEvidence: captureEvidence,
      oddsIngestion,
    });

    const report = await runCloudPipelineOnce(runtime);

    expect(report.mode).toBe("SHADOW");
    expect(report.failed).toBe(false);
    expect(captureEvidence).toHaveBeenCalledTimes(1);
    expect(captureEvidence).toHaveBeenCalledWith(expect.any(Date));
    expect(oddsIngestion).not.toHaveBeenCalled();
    expect(report.results["marketAnalyticsEvidence"]).toMatchObject({
      status: "SUCCEEDED",
      result: { snapshotsWritten: 2 },
    });
    expect(report.results["oddsIngestion"]).toBeUndefined();
  });

  it("retains the single established odds-ingestion path in publication-enabled mode", async () => {
    const captureEvidence = vi.fn().mockResolvedValue(emptyCaptureSummary);
    const oddsIngestion = vi.fn().mockResolvedValue({ processed: 1 });
    const runtime = pipelineRuntime({
      publicationEnabled: true,
      captureMarketAnalyticsEvidence: captureEvidence,
      oddsIngestion,
    });

    const report = await runCloudPipelineOnce(runtime);

    expect(report.mode).toBe("PRODUCTION");
    expect(report.failed).toBe(false);
    expect(oddsIngestion).toHaveBeenCalledTimes(1);
    expect(captureEvidence).not.toHaveBeenCalled();
    expect(report.results["marketAnalyticsEvidence"]).toBeUndefined();
  });

  it("propagates nested evidence-cycle partial status into the pipeline failure state", async () => {
    const runtime = pipelineRuntime({
      ncaafProductionEvidenceCycle: vi.fn().mockResolvedValue({
        capture: { status: "PARTIAL", providerErrors: { odds_api: "quota exceeded" } },
      }),
    });

    const report = await runCloudPipelineOnce(runtime);

    expect(report.failed).toBe(true);
    expect(report.results["ncaafProductionEvidenceCycle"]).toMatchObject({
      status: "FAILED",
      reason: expect.stringContaining("status=PARTIAL"),
    });
  });

  it("marks a failed shadow capture as a pipeline failure", async () => {
    const runtime = pipelineRuntime({
      captureMarketAnalyticsEvidence: vi.fn().mockResolvedValue({
        ...emptyCaptureSummary,
        status: "FAILED",
        hasOperationalFailures: true,
        snapshotsWritten: 0,
        failures: [{ reason: "MARKET_SNAPSHOT_CAPTURE_FAILED: database unavailable" }],
      }),
    });

    const report = await runCloudPipelineOnce(runtime);

    expect(report.failed).toBe(true);
    expect(report.results["marketAnalyticsEvidence"]).toMatchObject({
      status: "FAILED",
      result: { failures: [{ reason: expect.stringContaining("database unavailable") }] },
    });
  });

  it("reports planned partial coverage without failing the cron pipeline", async () => {
    const runtime = pipelineRuntime({
      captureMarketAnalyticsEvidence: vi.fn().mockResolvedValue({
        ...emptyCaptureSummary,
        status: "PARTIAL",
        hasOperationalFailures: false,
        providerGroupsDeferred: 1,
        failures: [{ reason: "PROVIDER_GROUP_WORK_LIMIT_REACHED: later run" }],
      }),
    });

    const report = await runCloudPipelineOnce(runtime);

    expect(report.failed).toBe(false);
    expect(report.results["marketAnalyticsEvidence"]).toMatchObject({
      status: "PARTIAL",
      result: {
        status: "PARTIAL",
        hasOperationalFailures: false,
        providerGroupsDeferred: 1,
      },
    });
  });

  it("does not write snapshots without an existing persisted game row", async () => {
    const dependencies = captureDependencies({
      totalGamesBySport: {},
      games: [],
      evidence: [{
        gameId: "not-persisted",
        providerEventId: "provider-event-1",
        payload: upcomingInput().evidence[0]!.payload,
      }],
    });

    const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, dependencies);

    expect(dependencies.loadPersistedAnalyticsEvidence).toHaveBeenCalledWith(
      cycleStartedAt,
      now,
      7,
      200,
    );
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(summary.status).toBe("NO_UPCOMING_GAMES");
    expect(summary.persistedUpcomingGames).toBe(0);
  });

  it("preserves genuine book timestamps when capturing the matched Southern Miss–Troy event", async () => {
    const input = upcomingInput(["NCAAF-401871090"]);
    const captureNow = new Date("2026-10-06T19:40:00Z");
    const providerTime = "2026-10-06T19:37:46Z";
    const kickoff = "2026-10-07T00:00:00Z";
    Object.assign(input.games[0]!, {
      homeTeamName: "Troy Trojans", awayTeamName: "Southern Miss Golden Eagles",
      eventStart: new Date(kickoff),
    });
    input.evidence[0]!.providerEventId = "57ad14afc7db1843fd56f5971dadb058";
    input.evidence[0]!.payload = {
      event: {
        id: "57ad14afc7db1843fd56f5971dadb058",
        home_team: "Troy Trojans", away_team: "Southern Mississippi Golden Eagles",
        commence_time: kickoff,
        bookmakers: ["pinnacle", "betonlineag"].map((key) => ({
          key, last_update: providerTime, markets: [{
            key: "h2h", outcomes: [
              { name: "Troy Trojans", price: -397 },
              { name: "Southern Mississippi Golden Eagles", price: 320 },
            ],
          }],
        })),
      },
    };
    mocks.capture.mockResolvedValue(4);
    const summary = await captureMarketAnalyticsEvidence(captureNow, {
      ...captureDependencies(input), now: () => captureNow,
    });
    expect(summary.providerEventsMatched).toBe(1);
    expect(summary.snapshotsWritten).toBe(4);
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      gameId: "NCAAF-401871090", eventStart: new Date(kickoff).toISOString(),
      odds: expect.objectContaining({
        providerEventId: "57ad14afc7db1843fd56f5971dadb058",
        bookmakerOdds: ["pinnacle", "betonlineag"].map((book) => ({
          book, lastUpdate: providerTime, homeOdds: -397, awayOdds: 320,
        })),
      }),
    }));
    expect(mocks.getOdds).not.toHaveBeenCalled();
  });

  it("reuses the current NCAAF evidence event for a persisted game snapshot", async () => {
    const dependencies = captureDependencies(upcomingInput());
    mocks.capture.mockResolvedValue(2);

    const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, dependencies);

    expect(mocks.loadEvidence).toHaveBeenCalledWith(cycleStartedAt, now, 7, 200);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      sport: "NCAAF",
      gameId: "persisted-game-1",
      eventStart: "2026-09-26T16:00:00.000Z",
      odds: expect.objectContaining({
        providerEventId: "provider-event-1",
        bookmakerOdds: [{
          book: "pinnacle",
          homeOdds: -110,
          awayOdds: 100,
          lastUpdate: "2026-09-26T11:55:00Z",
        }],
      }),
    }));
    expect(summary.status).toBe("SUCCEEDED");
    expect(summary.snapshotsWritten).toBe(2);
    expect(summary.additionalOddsApiRequests).toBe(0);
    expect(mocks.getOdds).not.toHaveBeenCalled();
  });

  it("rejects started and postponed NCAAF provider kickoffs against persisted ESPN start", async () => {
    for (const providerKickoff of [
      "2026-09-26T12:00:00.000Z",
      "2026-09-27T16:00:00.000Z",
    ]) {
      const input = upcomingInput();
      const payload = input.evidence[0]!.payload as { event: { commence_time: string } };
      payload.event.commence_time = providerKickoff;
      const capture = vi.fn();

      const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, {
        loadPersistedAnalyticsEvidence: vi.fn().mockResolvedValue(input),
        capture,
        getOdds: mocks.getOdds,
        resolveProviderKey: mocks.resolveProviderKey,
        now: () => now,
        monotonicNow: () => 0,
      });

      expect(summary.status).toBe("PARTIAL");
      expect(summary.unmatchedGames).toBe(1);
      expect(summary.additionalOddsApiRequests).toBe(0);
      expect(capture).not.toHaveBeenCalled();
      expect(summary.failures).toEqual(expect.arrayContaining([
        expect.objectContaining({
          gameId: "persisted-game-1",
          reason: "NCAAF_PROVIDER_KICKOFF_NOT_FUTURE_OR_OUTSIDE_ESPN_START_TOLERANCE",
        }),
      ]));
    }
  });

  it("loads NCAAF candidates from persisted games and reuses the cycle's matched raw event", async () => {
    const existingGame = {
      gameId: "persisted-game-1",
      sport: "NCAAF",
      league: null,
      homeTeamName: "Home",
      awayTeamName: "Away",
      eventStart: new Date("2026-09-26T16:00:00.000Z"),
      latestSnapshotAt: null,
    };
    const event = upcomingInput().evidence[0]!;
    const countQuery = databaseQuery([{ sport: "NCAAF", count: 1 }]);
    const gameQueries = new Map<string, ReturnType<typeof databaseQuery>>();
    for (const sport of ACTIVE_PRODUCT_SPORTS) {
      gameQueries.set(sport, databaseQuery(sport === "NCAAF" ? [existingGame] : []));
    }
    const evidenceQuery = databaseQuery([event]);
    mocks.dbSelect.mockReturnValueOnce(countQuery);
    for (const sport of ACTIVE_PRODUCT_SPORTS) {
      mocks.dbSelect.mockReturnValueOnce(gameQueries.get(sport)!);
    }
    mocks.dbSelectDistinctOn.mockReturnValueOnce(evidenceQuery);
    mocks.capture.mockResolvedValue(2);

    const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, {
      now: () => now,
      monotonicNow: () => 0,
    });

    expect(summary).toMatchObject({ status: "SUCCEEDED", gamesAttempted: 1 });
    expect(mocks.dbSelect.mock.calls.some(([fields]) =>
      fields?.latestSnapshotAt?.decoder === oddsSnapshotsTable.capturedAt,
    )).toBe(true);
    expect(gameQueries.get("NCAAF")!.from).toHaveBeenCalledWith(gamesTable);
    expect(gameQueries.get("NCAAF")!.limit).toHaveBeenCalledWith(200);
    expect(mocks.dbSelectDistinctOn).toHaveBeenCalledWith(
      [ncaafMarketObservationsTable.providerEventId],
      expect.objectContaining({ gameId: gamesTable.id }),
    );
    expect(mocks.desc).toHaveBeenCalledWith(ncaafMarketObservationsTable.capturedAt);
    expect(mocks.desc).toHaveBeenCalledWith(ncaafMarketObservationsTable.id);
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      gameId: "persisted-game-1",
      odds: expect.objectContaining({ providerEventId: "provider-event-1" }),
    }));
    expect(summary.status).toBe("SUCCEEDED");
    expect(summary.additionalOddsApiRequests).toBe(0);
  });

  it("reports named-book persistence errors instead of treating capture as successful", async () => {
    const dependencies = captureDependencies(upcomingInput());
    mocks.capture.mockRejectedValue(new Error("snapshot insert failed"));

    const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, dependencies);

    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(summary.status).toBe("FAILED");
    expect(summary.failures).toEqual([
      expect.objectContaining({
        gameId: "persisted-game-1",
        reason: expect.stringContaining("snapshot insert failed"),
      }),
    ]);
  });

  it("reports time and game caps as partial rather than silent success", async () => {
    const input = upcomingInput(Array.from({ length: 52 }, (_, index) => `game-${index + 1}`));
    input.totalGamesBySport.NCAAF = 52;
    const dependencies = {
      loadPersistedAnalyticsEvidence: vi.fn().mockResolvedValue(input),
      capture: mocks.capture,
      getOdds: mocks.getOdds,
      resolveProviderKey: mocks.resolveProviderKey,
      now: () => now,
      monotonicNow: vi.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(60_000),
    };
    mocks.capture.mockResolvedValue(2);

    const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, dependencies);

    expect(summary.status).toBe("PARTIAL");
    expect(summary.omittedGamesDueToGameLimit).toBe(2);
    expect(summary.omittedGamesDueToTimeLimit).toBe(49);
    expect(summary.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: expect.stringContaining("GAME_WORK_LIMIT_REACHED") }),
      expect.objectContaining({ reason: expect.stringContaining("TIME_LIMIT_REACHED") }),
    ]));
  });

  it("advances through a capped NCAAF slate across cron runs without snapshot progress", async () => {
    const input = upcomingInput(Array.from({ length: 52 }, (_, index) => `game-${index + 1}`));
    const captureFirstRun = vi.fn().mockResolvedValue(0);
    const captureSecondRun = vi.fn().mockResolvedValue(0);
    const commonDependencies = {
      loadPersistedAnalyticsEvidence: vi.fn().mockResolvedValue(input),
      getOdds: mocks.getOdds,
      resolveProviderKey: mocks.resolveProviderKey,
      monotonicNow: () => 0,
    };

    const first = await captureMarketAnalyticsEvidence(cycleStartedAt, {
      ...commonDependencies,
      capture: captureFirstRun,
      now: () => now,
    });
    const second = await captureMarketAnalyticsEvidence(cycleStartedAt, {
      ...commonDependencies,
      capture: captureSecondRun,
      now: () => new Date(now.getTime() + 1_000),
    });

    const attemptedIds = new Set([
      ...captureFirstRun.mock.calls.map(([request]) => request.gameId),
      ...captureSecondRun.mock.calls.map(([request]) => request.gameId),
    ]);
    expect(first.gamesAttempted).toBe(50);
    expect(second.gamesAttempted).toBe(50);
    expect(first.snapshotsWritten).toBe(0);
    expect(second.snapshotsWritten).toBe(0);
    expect(attemptedIds.size).toBe(52);
  });

  it("captures other active sports only from persisted games with bounded provider groups", async () => {
    const providerSports = ["MLB", "NFL", "NHL", "NBA", "WNBA"] as const;
    const ncaafInput = upcomingInput(Array.from({ length: 50 }, (_, index) => `ncaaf-${index + 1}`));
    const providerGames = providerSports.map((sport) => persistedGame(`game-${sport}`, sport));
    const input = providerOnlyInput([...ncaafInput.games, ...providerGames]);
    input.evidence = ncaafInput.evidence;
    const getOdds = vi.fn().mockResolvedValue({
      odds: providerOdds("provider-event"),
      marketBlockedByProviderStart: false,
    });
    const capture = vi.fn().mockResolvedValue(2);

    const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, {
      loadPersistedAnalyticsEvidence: vi.fn().mockResolvedValue(input),
      capture,
      getOdds,
      resolveProviderKey: (sport) => `provider-${sport}`,
      now: () => now,
      monotonicNow: () => 0,
    });

    expect(summary.status).toBe("PARTIAL");
    expect(summary.providerGroupsAttempted).toBe(4);
    expect(summary.providerGroupsDeferred).toBe(1);
    expect(summary.additionalOddsApiRequests).toBe(4);
    expect(summary.gamesAttempted).toBe(54);
    expect(summary.sports.find((sport) => sport.sport === "NCAAF")).toMatchObject({
      providerGroupsAttempted: 0,
      gamesAttempted: 50,
    });
    expect(getOdds).toHaveBeenCalledTimes(4);
    expect(getOdds.mock.calls.every(([sport]) => sport !== "NCAAF")).toBe(true);
    expect(capture).toHaveBeenCalledTimes(54);
    expect(summary.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: expect.stringContaining("PROVIDER_GROUP_WORK_LIMIT_REACHED") }),
    ]));
  });

  it("fails closed when a selected sport has no matched odds or its provider is unavailable", async () => {
    const input = providerOnlyInput([persistedGame("mlb-unmatched", "MLB")]);
    const getOdds = vi.fn().mockResolvedValue({
      odds: null,
      marketBlockedByProviderStart: false,
    });
    const capture = vi.fn();

    const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, {
      loadPersistedAnalyticsEvidence: vi.fn().mockResolvedValue(input),
      capture,
      getOdds,
      resolveProviderKey: () => "baseball_mlb",
      now: () => now,
      monotonicNow: () => 0,
    });

    expect(summary.status).toBe("PARTIAL");
    expect(summary.additionalOddsApiRequests).toBe(1);
    expect(summary.unmatchedGames).toBe(1);
    expect(capture).not.toHaveBeenCalled();
    expect(summary.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gameId: "mlb-unmatched",
        reason: expect.stringContaining("NO_MATCHED_CURRENT_NAMED_BOOK_ODDS_EVENT"),
      }),
    ]));
  });

  it("marks actual provider fetch failures as operational failures", async () => {
    const input = providerOnlyInput([persistedGame("mlb-fetch-failed", "MLB")]);
    const getOdds = vi.fn().mockResolvedValue({
      odds: null,
      marketBlockedByProviderStart: false,
      providerUnavailable: true,
    });

    const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, {
      loadPersistedAnalyticsEvidence: vi.fn().mockResolvedValue(input),
      capture: vi.fn(),
      getOdds,
      resolveProviderKey: () => "baseball_mlb",
      now: () => now,
      monotonicNow: () => 0,
    });

    expect(summary.status).toBe("FAILED");
    expect(summary.hasOperationalFailures).toBe(true);
    expect(summary.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gameId: "mlb-fetch-failed",
        reason: "ODDS_API_PROVIDER_UNAVAILABLE",
      }),
    ]));
    const report = await runCloudPipelineOnce(pipelineRuntime({
      captureMarketAnalyticsEvidence: vi.fn().mockResolvedValue(summary),
    }));
    expect(report.failed).toBe(true);
    expect(report.results["marketAnalyticsEvidence"]).toMatchObject({ status: "FAILED" });
  });

  it("visits all thirteen provider groups within four scheduled cycles without increasing the request budget", async () => {
    const games = Array.from({ length: 13 }, (_, index) =>
      persistedGame(`soccer-${index}`, "Soccer", `league-${index}`));
    const input = providerOnlyInput(games);
    const attempted = new Set<string>();
    for (let cycle = 0; cycle < 4; cycle++) {
      const getOdds = vi.fn().mockImplementation(async (_sport, league) => {
        attempted.add(league);
        return { odds: null, marketBlockedByProviderStart: false };
      });
      const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, {
        loadPersistedAnalyticsEvidence: vi.fn().mockResolvedValue(input),
        capture: vi.fn(),
        getOdds,
        resolveProviderKey: (_sport, league) => league!,
        now: () => new Date(now.getTime() + cycle * 15 * 60 * 1000),
        monotonicNow: () => 0,
      });
      expect(summary.providerGroupsAttempted).toBe(4);
      expect(summary.hasOperationalFailures).toBe(false);
    }
    expect(attempted.size).toBe(13);
  });

  it("reports provider lookup exceptions and unsupported provider keys as failures", async () => {
    const input = providerOnlyInput([
      persistedGame("mlb-provider-error", "MLB"),
      persistedGame("soccer-unsupported", "Soccer", "unsupported_league"),
    ]);
    const getOdds = vi.fn().mockRejectedValue(new Error("Odds API quota exceeded"));
    const capture = vi.fn();

    const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, {
      loadPersistedAnalyticsEvidence: vi.fn().mockResolvedValue(input),
      capture,
      getOdds,
      resolveProviderKey: (sport) => sport === "MLB" ? "baseball_mlb" : null,
      now: () => now,
      monotonicNow: () => 0,
    });

    expect(summary.status).toBe("FAILED");
    expect(summary.additionalOddsApiRequests).toBe(1);
    expect(summary.unmatchedGames).toBe(2);
    expect(capture).not.toHaveBeenCalled();
    expect(summary.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gameId: "mlb-provider-error",
        reason: expect.stringContaining("Odds API quota exceeded"),
      }),
      expect.objectContaining({ gameId: "soccer-unsupported" }),
      expect.objectContaining({ reason: expect.stringContaining("UNSUPPORTED_ODDS_API_PROVIDER_KEY") }),
    ]));
  });

  it("reports unsupported-only provider coverage as unavailable without failing the cron", async () => {
    const input = providerOnlyInput([persistedGame("soccer-unavailable", "Soccer", "unsupported_league")]);
    const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, {
      loadPersistedAnalyticsEvidence: vi.fn().mockResolvedValue(input),
      capture: vi.fn(),
      getOdds: vi.fn(),
      resolveProviderKey: () => null,
      now: () => now,
      monotonicNow: () => 0,
    });
    const report = await runCloudPipelineOnce(pipelineRuntime({
      captureMarketAnalyticsEvidence: vi.fn().mockResolvedValue(summary),
    }));

    expect(summary.status).toBe("UNAVAILABLE");
    expect(summary.hasOperationalFailures).toBe(false);
    expect(report.failed).toBe(false);
    expect(report.results["marketAnalyticsEvidence"]).toMatchObject({
      status: "UNAVAILABLE",
      result: { status: "UNAVAILABLE" },
    });
  });

  it("rotates provider-group selection so deferred sports get later scheduled turns", async () => {
    const providerSports = ["MLB", "NFL", "NHL", "NBA", "WNBA"] as const;
    const input = providerOnlyInput(providerSports.map((sport) => persistedGame(`game-${sport}`, sport)));
    const requestedSports = new Set<string>();
    const baseTime = now.getTime();

    for (let run = 0; run < providerSports.length; run++) {
      const getOdds = vi.fn(async (sport: string) => {
        requestedSports.add(sport);
        return { odds: providerOdds(`event-${sport}`), marketBlockedByProviderStart: false };
      });
      await captureMarketAnalyticsEvidence(cycleStartedAt, {
        loadPersistedAnalyticsEvidence: vi.fn().mockResolvedValue(input),
        capture: vi.fn().mockResolvedValue(1),
        getOdds,
        resolveProviderKey: (sport) => `provider-${sport}`,
        now: () => new Date(baseTime + run * 15 * 60 * 1000),
        monotonicNow: () => 0,
      });
      expect(getOdds).toHaveBeenCalledTimes(4);
    }

    expect(requestedSports).toEqual(new Set(providerSports));
  });

  it("caps provider-backed game work per sport independently of candidate discovery", async () => {
    const input = providerOnlyInput(
      Array.from({ length: 21 }, (_, index) => persistedGame(`mlb-${index + 1}`, "MLB")),
    );
    const getOdds = vi.fn().mockResolvedValue({
      odds: providerOdds("provider-event"),
      marketBlockedByProviderStart: false,
    });
    const capture = vi.fn().mockResolvedValue(1);

    const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, {
      loadPersistedAnalyticsEvidence: vi.fn().mockResolvedValue(input),
      capture,
      getOdds,
      resolveProviderKey: () => "baseball_mlb",
      now: () => now,
      monotonicNow: () => 0,
    });

    expect(summary.status).toBe("PARTIAL");
    expect(summary.additionalOddsApiRequests).toBe(1);
    expect(summary.gamesAttempted).toBe(20);
    expect(getOdds).toHaveBeenCalledTimes(20);
    expect(capture).toHaveBeenCalledTimes(20);
    expect(summary.omittedGamesDueToGameLimit).toBe(1);
    expect(summary.sports[0]).toMatchObject({
      sport: "MLB",
      providerGroupsAttempted: 1,
      omittedGames: 1,
    });
  });

  it("applies the sport game cap across multiple provider-key leagues fairly", async () => {
    const games = [
      ...Array.from({ length: 12 }, (_, index) => persistedGame(`epl-${index + 1}`, "Soccer", "EPL")),
      ...Array.from({ length: 12 }, (_, index) => persistedGame(`ucl-${index + 1}`, "Soccer", "UCL")),
    ];
    const input = providerOnlyInput(games);
    const getOdds = vi.fn().mockResolvedValue({
      odds: providerOdds("provider-event"),
      marketBlockedByProviderStart: false,
    });
    const capture = vi.fn().mockResolvedValue(1);

    const summary = await captureMarketAnalyticsEvidence(cycleStartedAt, {
      loadPersistedAnalyticsEvidence: vi.fn().mockResolvedValue(input),
      capture,
      getOdds,
      resolveProviderKey: (_sport, league) => league === "EPL" ? "soccer_epl" : "soccer_ucl",
      now: () => now,
      monotonicNow: () => 0,
    });

    expect(summary.status).toBe("PARTIAL");
    expect(summary.gamesAttempted).toBe(20);
    expect(summary.providerGroupsAttempted).toBe(2);
    expect(summary.omittedGamesDueToGameLimit).toBe(4);
    expect(getOdds.mock.calls.filter(([, league]) => league === "EPL")).toHaveLength(10);
    expect(getOdds.mock.calls.filter(([, league]) => league === "UCL")).toHaveLength(10);
    expect(summary.sports[0]).toMatchObject({
      sport: "Soccer",
      gamesAttempted: 20,
      omittedGames: 4,
    });
    expect(capture).toHaveBeenCalledTimes(20);
  });
});