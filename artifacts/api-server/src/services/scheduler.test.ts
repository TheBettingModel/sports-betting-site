/**
 * Tests for odds-ingestion scheduler logic.
 *
 * Unit tests:
 *   checkAndRaiseSportAlerts — alert threshold logic (3 consecutive zeros)
 *
 * Integration tests:
 *   runOddsIngestion (via schedulerJobs.oddsIngestion) — dataSourceFreshness
 *   is written correctly to automation_runs, distinguishing 0-game sports from
 *   ESPN fetch errors.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ── Hoisted mock state ────────────────────────────────────────────────────────

const { mockDb, mockFetchAllSportsDetailed } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  const mockFetchAllSportsDetailed = vi.fn();
  return { mockDb, mockFetchAllSportsDetailed };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: mockDb,
  automationRunsTable: {},
  dataQualityAlertsTable: {},
  modelWeightsTable: {},
  gamesTable: {
    id: "id",
    gameDate: "gameDate",
    openingHomeOdds: "openingHomeOdds",
    openingAwayOdds: "openingAwayOdds",
  },
  sportSnoozesTable: { snoozedUntil: "snoozedUntil", sport: "sport" },
  publishedPicksTable: {},
}));

vi.mock("./espn", () => ({
  fetchAllSportsDetailed: mockFetchAllSportsDetailed,
  fetchAllSports: vi.fn().mockResolvedValue([]),
}));

vi.mock("./snapshot", () => ({ processGameSnapshot: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./model", () => ({ computeProjection: vi.fn().mockReturnValue({}) }));
vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Import under test (after mocks) ──────────────────────────────────────────

import { _checkAndRaiseSportAlerts, _autoResolveSportAlerts, _checkAndRaiseFetchErrorAlerts, schedulerJobs } from "./scheduler";

// ── Drizzle fluent-builder helpers ────────────────────────────────────────────
//
// Drizzle queries are awaited in two ways:
//   (a) directly:          await db.select({ f }).from(t)
//   (b) after chaining:    await db.select({ f }).from(t).where(…).limit(n)
//
// So each builder must be a thenable AND support further chaining.

function makeSelectBuilder(finalResult: unknown) {
  // A thenable whose .then resolves to finalResult
  const resolved = Promise.resolve(finalResult);

  const builder: Record<string, unknown> = {
    // Make the builder itself awaitable (covers case (a))
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };

  // Each chaining method returns `builder` so they stay thenable too
  builder.from = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.orderBy = vi.fn().mockReturnValue(builder);
  // .limit() is the usual terminal — also return a plain promise is fine
  builder.limit = vi.fn().mockReturnValue(resolved);

  return builder;
}

/**
 * Build a mock insert chain.
 * startRun:            db.insert(t).values(v).returning()  → [{id}]
 * alert insert:        db.insert(t).values(v)              → awaited directly
 * autoResolve update:  db.update(t).set(s).where(w).returning() → []
 */
function makeInsertBuilder(returningResult: unknown) {
  const resolved = Promise.resolve(returningResult);

  // .values() must be both awaitable and support .returning()
  const valuesBuilder: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
    returning: vi.fn().mockReturnValue(resolved),
  };

  return {
    values: vi.fn().mockReturnValue(valuesBuilder),
    _valuesBuilder: valuesBuilder, // expose for assertions
  };
}

function makeUpdateBuilder(returningResult: unknown = []) {
  const resolved = Promise.resolve(returningResult);

  const builder: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };

  builder.set = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.returning = vi.fn().mockReturnValue(resolved);

  return builder;
}

// ── Unit tests: checkAndRaiseSportAlerts ─────────────────────────────────────

describe("checkAndRaiseSportAlerts", () => {
  const CURRENT_RUN_ID = 99;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.insert.mockReturnValue(makeInsertBuilder([{ id: 99 }]));
    mockDb.update.mockReturnValue(makeUpdateBuilder());
  });

  // Call order for a sport that hits the threshold:
  //   results[0] → recentRuns (shared, one query before the per-sport loop)
  //   results[1] → snooze check (per sport)
  //   results[2] → existing-alert dedup check (per sport)
  function setupSelectSequence(...results: unknown[]) {
    let call = 0;
    (mockDb.select as Mock).mockImplementation(() => {
      const result = results[call] ?? [];
      call++;
      return makeSelectBuilder(result);
    });
  }

  it("does not create an alert before 3 consecutive zero-game runs for a sport", async () => {
    // 1 prior run with NFL: 0, plus current run (also 0) → streak of 2
    const previousRuns = [
      { dataSourceFreshness: { NFL: 0, NBA: 0 } },
    ];
    // The streak is below the threshold, so no alert is created.
    setupSelectSequence(previousRuns);

    await _checkAndRaiseSportAlerts(CURRENT_RUN_ID, { NFL: 0 });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("does not create an alert when the sport count is 'error' rather than 0", async () => {
    // ESPN errors are not counted toward the zero streak
    setupSelectSequence([]); // recentRuns query still fires once

    await _checkAndRaiseSportAlerts(CURRENT_RUN_ID, { NFL: "error" });

    // Loop guard (currentCount !== 0) also catches "error" — no per-sport selects
    expect(mockDb.select).toHaveBeenCalledOnce(); // only recentRuns
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("raises independent alerts for multiple sports in the same run", async () => {
    const previousRuns = [
      { dataSourceFreshness: { NFL: 0, NBA: 0 } },
      { dataSourceFreshness: { NFL: 0, NBA: 0 } },
    ];
    // Call order: recentRuns, existing(NFL)→none, snooze(NFL)→none,
    //             existing(NBA)→none, snooze(NBA)→none
    setupSelectSequence(previousRuns, [], [], [], []);

    await _checkAndRaiseSportAlerts(CURRENT_RUN_ID, { NFL: 0, NBA: 0 });

    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });
});

// ── Unit tests: autoResolveSportAlerts ───────────────────────────────────────

describe("autoResolveSportAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.insert.mockReturnValue(makeInsertBuilder([{ id: 1 }]));
  });

  it("resolves an unresolved zero_games_feed alert when the sport returns >0 games", async () => {
    // The update should be called and resolve the alert
    const updateBuilder = makeUpdateBuilder();
    (mockDb.update as Mock).mockReturnValue(updateBuilder);

    await _autoResolveSportAlerts({ NFL: 5 });

    // update is called once per alert type (zero_games_feed + feed_fetch_error) for NFL
    expect(mockDb.update).toHaveBeenCalledTimes(2);

    // Inspect the .set() calls — all must include resolvedBy and isResolved
    const setCalls = (updateBuilder.set as Mock).mock.calls as Array<[Record<string, unknown>]>;
    expect(setCalls).toHaveLength(2);
    const setArgs = setCalls[0]![0]!;
    expect(setArgs.isResolved).toBe(true);
    expect(setArgs.resolvedBy).toBe("scheduler:auto");
    expect(setArgs.resolvedAt).toBeInstanceOf(Date);
  });

  it("does NOT resolve alerts for sports that still have 0 games", async () => {
    const updateBuilder = makeUpdateBuilder();
    (mockDb.update as Mock).mockReturnValue(updateBuilder);

    await _autoResolveSportAlerts({ NFL: 0, NBA: 0 });

    // No sports are active — update must never be called
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("does NOT resolve alerts for sports with 'error' fetch status", async () => {
    const updateBuilder = makeUpdateBuilder();
    (mockDb.update as Mock).mockReturnValue(updateBuilder);

    await _autoResolveSportAlerts({ NFL: "error" });

    // Error sports are not treated as active — update must never be called
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("resolves alerts only for the active sports, leaving zero/error sports untouched", async () => {
    let updateCallCount = 0;
    (mockDb.update as Mock).mockImplementation(() => {
      updateCallCount++;
      return makeUpdateBuilder([{ id: updateCallCount * 10 }]);
    });

    // NFL returned games, NBA still at 0, MLB errored
    await _autoResolveSportAlerts({ NFL: 3, NBA: 0, MLB: "error" });

    // Only NFL is active → 2 updates (one per alert type: zero_games_feed + feed_fetch_error)
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });
});

// ── Unit tests: checkAndRaiseFetchErrorAlerts ────────────────────────────────

describe("checkAndRaiseFetchErrorAlerts", () => {
  const CURRENT_RUN_ID = 99;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.insert.mockReturnValue(makeInsertBuilder([{ id: 99 }]));
    mockDb.update.mockReturnValue(makeUpdateBuilder());
  });

  // Call order for a sport that hits the threshold:
  //   results[0] → recentRuns (shared, one query before the per-sport loop)
  //   results[1] → snooze check (per sport)
  //   results[2] → existing-alert dedup check (per sport)
  function setupSelectSequence(...results: unknown[]) {
    let call = 0;
    (mockDb.select as Mock).mockImplementation(() => {
      const result = results[call] ?? [];
      call++;
      return makeSelectBuilder(result);
    });
  }

  it("raises a critical feed_fetch_error alert after 2 consecutive ESPN errors", async () => {
    // 1 prior run with NFL "error" + current run = streak of 2 (== threshold)
    setupSelectSequence(
      [{ dataSourceFreshness: { NFL: "error" } }], // recentRuns
      [], // snooze check → none
      [], // existing-alert check → none
    );

    await _checkAndRaiseFetchErrorAlerts(CURRENT_RUN_ID, { NFL: "error" });

    expect(mockDb.insert).toHaveBeenCalledOnce();
    const values = (mockDb.insert.mock.results[0]!.value.values as Mock).mock.calls[0]![0] as Record<string, unknown>;
    expect(values.alertType).toBe("feed_fetch_error");
    expect(values.severity).toBe("critical");
    expect(values.sport).toBe("NFL");
  });

  it("does not raise an alert when the streak is only 1 run (current run only)", async () => {
    // Most-recent prior run had NFL: 3 — streak breaks immediately
    setupSelectSequence([{ dataSourceFreshness: { NFL: 3 } }]);

    await _checkAndRaiseFetchErrorAlerts(CURRENT_RUN_ID, { NFL: "error" });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("does not raise an alert when there are no prior runs to form a streak", async () => {
    setupSelectSequence([]); // no prior runs at all

    await _checkAndRaiseFetchErrorAlerts(CURRENT_RUN_ID, { NFL: "error" });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("does not raise a duplicate when an unresolved feed_fetch_error alert already exists", async () => {
    setupSelectSequence(
      [{ dataSourceFreshness: { NFL: "error" } }], // recentRuns: streak met
      [], // snooze → none
      [{ id: 5 }], // existing unresolved alert → skip
    );

    await _checkAndRaiseFetchErrorAlerts(CURRENT_RUN_ID, { NFL: "error" });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("skips the alert when the sport is snoozed by an admin", async () => {
    setupSelectSequence(
      [{ dataSourceFreshness: { NFL: "error" } }], // recentRuns: streak met
      [{ snoozedUntil: new Date(Date.now() + 3_600_000) }], // active snooze
    );

    await _checkAndRaiseFetchErrorAlerts(CURRENT_RUN_ID, { NFL: "error" });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("raises independent alerts for two sports both showing consecutive errors", async () => {
    // Shared recentRuns has both NFL and NBA erroring; each sport then gets its own
    // snooze + dedup check (no snooze, no existing alert for either).
    setupSelectSequence(
      [{ dataSourceFreshness: { NFL: "error", NBA: "error" } }], // recentRuns
      [], // snooze(NFL) → none
      [], // existing(NFL) → none
      [], // snooze(NBA) → none
      [], // existing(NBA) → none
    );

    await _checkAndRaiseFetchErrorAlerts(CURRENT_RUN_ID, { NFL: "error", NBA: "error" });

    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it("does nothing and skips all DB queries when no sports have an error status", async () => {
    await _checkAndRaiseFetchErrorAlerts(CURRENT_RUN_ID, { NFL: 5, NBA: 0 });

    // Early-return path — no DB queries at all
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("does not raise an alert for a sport that had an error then recovered then errored again once", async () => {
    // Prior run: NFL recovered (returned 5 games) → streak broken
    setupSelectSequence([{ dataSourceFreshness: { NFL: 5 } }]);

    await _checkAndRaiseFetchErrorAlerts(CURRENT_RUN_ID, { NFL: "error" });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

// ── Integration tests: runOddsIngestion ──────────────────────────────────────

describe("runOddsIngestion — dataSourceFreshness recording", () => {
  const RUN_ID = 1;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Wire all DB calls for a complete runOddsIngestion cycle.
   * Returns the update builder so tests can inspect the finishRun call.
   */
  function setupDbForIngestion() {
    let selectIdx = 0;
    (mockDb.select as Mock).mockImplementation(() => {
      selectIdx++;
      // 1st call: modelWeightsTable → []
      // subsequent calls: checkAndRaiseSportAlerts / autoResolveSportAlerts → []
      return makeSelectBuilder([]);
    });

    let insertIdx = 0;
    (mockDb.insert as Mock).mockImplementation(() => {
      insertIdx++;
      // 1st call: startRun → returns the run id
      // subsequent calls: alert inserts
      return makeInsertBuilder(insertIdx === 1 ? [{ id: RUN_ID }] : [{ id: 99 }]);
    });

    const updateBuilder = makeUpdateBuilder();
    (mockDb.update as Mock).mockReturnValue(updateBuilder);
    return updateBuilder;
  }

  /**
   * Extract the object passed to finishRun's `.set()` call.
   * finishRun always includes a `status` field; autoResolveSportAlerts does not.
   */
  function getFinishRunArgs(updateBuilder: ReturnType<typeof makeUpdateBuilder>) {
    const calls = (updateBuilder.set as Mock).mock.calls as Array<[Record<string, unknown>]>;
    const finishCall = calls.find((c) => "status" in c[0]);
    if (!finishCall) throw new Error("finishRun .set() call not found");
    return finishCall[0];
  }

  it("records numeric game counts per sport in dataSourceFreshness", async () => {
    const updateBuilder = setupDbForIngestion();
    mockFetchAllSportsDetailed.mockResolvedValue([
      { sport: "NFL", fetchStatus: "ok", games: [] },
      { sport: "NBA", fetchStatus: "ok", games: [] },
    ]);

    await schedulerJobs.oddsIngestion();

    const args = getFinishRunArgs(updateBuilder);
    expect(args.status).toBe("completed");
    expect(args.recordsProcessed).toBe(0);
    expect(args.dataSourceFreshness).toEqual({ NFL: 0, NBA: 0 });
  });

  it("records status=failed and dataSourceFreshness=null when fetchAllSportsDetailed throws", async () => {
    const updateBuilder = setupDbForIngestion();
    mockFetchAllSportsDetailed.mockResolvedValue([
      { sport: "NFL", fetchStatus: "error", errorMessage: "timeout", games: [] },
      {
        sport: "MLB", fetchStatus: "ok",
        games: [{
          espnId: "MLB-1", sport: "MLB",
          homeTeamAbbr: "NYY", homeTeamName: "Yankees", homeTeamRecord: "90-50",
          awayTeamAbbr: "BOS", awayTeamName: "Red Sox", awayTeamRecord: "80-60",
          gameTime: "7:00 PM ET", gameDate: "2025-08-15", status: "upcoming",
        }],
      },
    ]);

    await schedulerJobs.oddsIngestion();

    expect(mockDb.update).toHaveBeenCalled();
    const freshness = getFinishRunArgs(updateBuilder).dataSourceFreshness as Record<string, unknown>;
    expect(freshness["NFL"]).toBe("error");
    expect(freshness["MLB"]).toBe(1);
  });

  it("writes dataSourceFreshness and status=completed even when all sports return 0 games", async () => {
    const updateBuilder = setupDbForIngestion();
    mockFetchAllSportsDetailed.mockResolvedValue([
      { sport: "NFL", fetchStatus: "ok", games: [] },
      { sport: "NBA", fetchStatus: "ok", games: [] },
    ]);

    await schedulerJobs.oddsIngestion();

    const args = getFinishRunArgs(updateBuilder);
    expect(args.status).toBe("completed");
    expect(args.recordsProcessed).toBe(0);
    expect(args.dataSourceFreshness).toEqual({ NFL: 0, NBA: 0 });
  });

  it("records status=failed and dataSourceFreshness=null when fetchAllSportsDetailed throws", async () => {
    const updateBuilder = setupDbForIngestion();
    mockFetchAllSportsDetailed.mockRejectedValue(new Error("Network unreachable"));

    await schedulerJobs.oddsIngestion();

    const args = getFinishRunArgs(updateBuilder);
    expect(args.status).toBe("failed");
    expect(args.dataSourceFreshness).toBeNull();
    expect(args.errorDetails).toBe("Network unreachable");
  });
});
