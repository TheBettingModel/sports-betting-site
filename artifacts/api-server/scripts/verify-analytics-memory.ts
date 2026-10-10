import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getHeapStatistics } from "node:v8";
import { fixtureNow, marketAnalyticsMemoryFixture } from "../test/marketAnalyticsMemory.fixture";
import {
  buildMarketAnalyticsHistories,
  type MarketAnalyticsSnapshotRow,
} from "../src/services/marketAnalyticsHistory";
import { createMarketAnalyticsLoader } from "../src/services/marketAnalyticsQuery";

const fixture = marketAnalyticsMemoryFixture();
if (process.argv[2] === "--fixture-sql") {
  process.stdout.write(JSON.stringify(fixture.query));
} else {
  assert.ok(getHeapStatistics().heap_size_limit / 1024 ** 2 <= 300,
    "Run with --max-old-space-size=256 --max-semi-space-size=1.");
  // Input is the SELECT-only PostgreSQL fixture result, never a credential.
  const actualRows = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as MarketAnalyticsSnapshotRow[];
  const actual = buildMarketAnalyticsHistories(actualRows.map(row => ({
    ...row, capturedAt: new Date(row.capturedAt),
    startsAt: row.startsAt === null ? null : new Date(row.startsAt),
  })), fixtureNow);
  const expected = buildMarketAnalyticsHistories(fixture.rows, fixtureNow);
  // Compare the route's contract: every scheduled game remains present, even
  // when no comparable history exists and the builder has no map entry.
  const normalize = (histories: typeof actual) => [...new Set(fixture.rows.map(row => row.gameId))]
    .map(gameId => {
      const history = histories.get(gameId) ?? { marketHistory: [], sharpMoneyHistory: [] };
      return [gameId, {
      marketHistory: [...history.marketHistory].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      sharpMoneyHistory: [...history.sharpMoneyHistory].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      }] as const;
    }).sort(([a], [b]) => a.localeCompare(b));
  assert.deepEqual(normalize(actual), normalize(expected));
  assert.equal(actual.has("tie-game"), false);
  assert.equal(actual.has("conflict-game"), false);
  process.stdout.write("PostgreSQL compaction matches the deployed JS oracle, including identity and conflict gates.\n");

  // More than today's 20,551 retained points. Only compacted rows cross the
  // driver boundary; no million-row mock ledger is allocated in Node.
  const compacted: MarketAnalyticsSnapshotRow[] = [];
  for (let game = 0; game < 100; game++) {
    for (let book = 0; book < 50; book++) {
      for (const selection of ["home", "away", "draw"]) {
        for (const hour of [10, 12, 14]) compacted.push({
          ...fixture.rows[0]!, gameId: `game-${game}`, sportsbook: `Book ${book}`,
          sportsbookKey: `book-${book}`, isSharp: book % 2 === 0, selection,
          providerEventId: `event-${game}`, price: -100 - hour,
          capturedAt: new Date(`2026-10-10T${hour}:00:00Z`),
        });
      }
    }
  }
  let executions = 0;
  const load = createMarketAnalyticsLoader(async () => {
    executions++;
    return { rows: compacted };
  });
  const results = await Promise.all(Array.from({ length: 30 }, () => load("2026-10-10", fixtureNow)));
  assert.equal(executions, 1);
  assert.equal(results[0]!.size, 100);
  const serialized = JSON.stringify([...results[0]!]);
  assert.ok(serialized.length > 0);
  process.stdout.write(JSON.stringify({
    compactedRows: compacted.length, concurrentRequests: results.length,
    databaseExecutions: executions, responseBytes: Buffer.byteLength(serialized),
    heapUsedMiB: Math.round(process.memoryUsage().heapUsed / 1024 ** 2),
    heapLimitMiB: Math.round(getHeapStatistics().heap_size_limit / 1024 ** 2),
    heapLimitTest: "--max-old-space-size=256 --max-semi-space-size=1",
  }) + "\n");
}
