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

import { _checkAndRaiseSportAlerts, _autoResolveSportAlerts, schedulerJobs } from "./scheduler";

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
  const CURRENT_RUN_ID = 42;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.insert.mockReturnValue(makeInsertBuilder([{ id: 99 }]));
    mockDb.update.mockReturnValue(makeUpdateBuilder());
  });

  /**
   * The function performs one db.select() to fetch recentRuns (shared across
   * all sports), then one db.select() per sport that reaches the threshold
   * check to look for an existing alert.
   *
   * results[0] → recentRuns query
   * results[1..] → per-sport existing-alert queries
   */
  function setupSelectSequence(...results: unknown[]) {
    let call = 0;
    (mockDb.select as Mock).mockImplementation(() => {
      const result = results[call] ?? [];
      call++;
      return makeSelectBuilder(result);
    });
  }

  it("creates an alert after 3 consecutive zero-game runs for a sport", async () => {
    // 2 prior runs with NFL: 0, plus current run (also 0) → streak of 3
    const previousRuns = [
      { dataSourceFreshness: { NFL: 0 } },
      { dataSourceFreshness: { NFL: 0 } },
    ];
    // recentRuns select, then existing-alert select (none found)
    setupSelectSequence(previousRuns, []);

    await _checkAndRaiseSportAlerts(CURRENT_RUN_ID, { NFL: 0 });

    expect(mockDb.insert).toHaveBeenCalledOnce();
  });

  it("does not create a duplicate alert when an unresolved one already exists", async () => {
    const previousRuns = [
      { dataSourceFreshness: { NFL: 0 } },
      { dataSourceFreshness: { NFL: 0 } },
    ];
    // Existing unresolved alert found → insert must not be called
    setupSelectSequence(previousRuns, [{ id: 7 }]);

    await _checkAndRaiseSportAlerts(CURRENT_RUN_ID, { NFL: 0 });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("does not create an alert for a sport that returned >0 games", async () => {
    // recentRuns select still runs once before the per-sport loop
    setupSelectSequence([]);

    await _checkAndRaiseSportAlerts(CURRENT_RUN_ID, { MLB: 5 });

    // Loop guard (currentCount !== 0) short-circuits before the alert-check select
    expect(mockDb.select).toHaveBeenCalledOnce(); // only recentRuns
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("does not create an alert when the consecutive-zero streak is shorter than the threshold", async () => {
    // Only 1 prior run with NFL: 0 → streak is 2 (current + 1), threshold is 3
    setupSelectSequence([{ dataSourceFreshness: { NFL: 0 } }], []);

    await _checkAndRaiseSportAlerts(CURRENT_RUN_ID, { NFL: 0 });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("does not create an alert when a prior run broke the streak", async () => {
    // Most-recent first: first prior had 0, second had 5 — streak broken at 2
    const previousRuns = [
      { dataSourceFreshness: { NFL: 0 } },
      { dataSourceFreshness: { NFL: 5 } }, // breaks the streak
    ];
    setupSelectSequence(previousRuns, []);

    await _checkAndRaiseSportAlerts(CURRENT_RUN_ID, { NFL: 0 });

    // Streak is only 2 (current + first prior), below the threshold of 3
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("does not create an alert when the sport count is 'error' rather than 0", async () => {
    // ESPN errors are not counted toward the zero streak
    setupSelectSequence([]); // recentRuns query still fires once

    await _checkAndRaiseSportAlerts(CURRENT_RUN_ID, { NFL: "error" });

    // Loop guard (currentCount !== 0) also catches "error" — no alert-check select
    expect(mockDb.select).toHaveBeenCalledOnce(); // only recentRuns
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("raises independent alerts for multiple sports in the same run", async () => {
    const previousRuns = [
      { dataSourceFreshness: { NFL: 0, NBA: 0 } },
      { dataSourceFreshness: { NFL: 0, NBA: 0 } },
    ];
    // Call order: recentRuns (shared), existingAlert(NFL) → none, existingAlert(NBA) → none
    setupSelectSequence(previousRuns, [], []);

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
    const updateBuilder = makeUpdateBuilder([{ id: 7 }]);
    (mockDb.update as Mock).mockReturnValue(updateBuilder);

    await _autoResolveSportAlerts({ NFL: 5 });

    // update should have been called once for NFL
    expect(mockDb.update).toHaveBeenCalledOnce();

    // Inspect the .set() call — must include resolvedBy and isResolved
    const setCalls = (updateBuilder.set as Mock).mock.calls as Array<[Record<string, unknown>]>;
    expect(setCalls).toHaveLength(1);
    const setArgs = setCalls[0][0];
    expect(setArgs.isResolved).toBe(true);
    expect(setArgs.resolvedBy).toBe("scheduler:auto");
    expect(setArgs.resolvedAt).toBeInstanceOf(Date);
  });

  it("does NOT resolve alerts for sports that still have 0 games", async () => {
    const updateBuilder = makeUpdateBuilder([]);
    (mockDb.update as Mock).mockReturnValue(updateBuilder);

    await _autoResolveSportAlerts({ NFL: 0, NBA: 0 });

    // No sports are active — update must never be called
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("does NOT resolve alerts for sports with 'error' fetch status", async () => {
    const updateBuilder = makeUpdateBuilder([]);
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

    // Only NFL is active — exactly one update
    expect(mockDb.update).toHaveBeenCalledOnce();
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
      {
        sport: "NFL", fetchStatus: "ok",
        games: [{
          espnId: "NFL-1", sport: "NFL",
          homeTeamAbbr: "KC", homeTeamName: "Chiefs", homeTeamRecord: "5-1",
          awayTeamAbbr: "BUF", awayTeamName: "Bills", awayTeamRecord: "4-2",
          gameTime: "1:00 PM ET", gameDate: "2025-10-10", status: "upcoming",
        }],
      },
      { sport: "NBA", fetchStatus: "ok", games: [] },
    ]);

    await schedulerJobs.oddsIngestion();

    // db.update may fire multiple times (finishRun + autoResolveSportAlerts)
    expect(mockDb.update).toHaveBeenCalled();
    const args = getFinishRunArgs(updateBuilder);
    expect(args.status).toBe("completed");
    expect(args.recordsProcessed).toBe(1);
    expect(args.dataSourceFreshness).toEqual({ NFL: 1, NBA: 0 });
  });

  it("records 'error' string for sports where the ESPN fetch failed, not 0", async () => {
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
