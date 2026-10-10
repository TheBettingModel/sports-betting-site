import { sql } from "drizzle-orm";
import { db, gamesTable, marketsTable, oddsSnapshotsTable, sportsbooksTable } from "@workspace/db";
import { buildMarketAnalyticsHistories, type MarketAnalyticsSnapshotRow } from "./marketAnalyticsHistory";

/**
 * Compact in PostgreSQL, not in the API heap. The result is at most three
 * observations per game/book/selection, regardless of ledger history length.
 * Identity selection happens BEFORE timestamp-conflict filtering: an invalid
 * replacement must not revive a previous provider identity.
 */
export function compactMarketAnalyticsQuery(date: string, now: Date) {
  return sql`
    WITH eligible AS MATERIALIZED (
      SELECT o.game_id, o.sportsbook_id, b.slug AS sportsbook_key,
        b.name AS sportsbook_name, o.selection, o.provider_event_id,
        date_trunc('milliseconds', o.captured_at) AS captured_at, o.price
      FROM ${oddsSnapshotsTable} o
      JOIN ${gamesTable} g ON g.id = o.game_id
      JOIN ${marketsTable} m ON m.id = o.market_id
      JOIN ${sportsbooksTable} b ON b.id = o.sportsbook_id
      WHERE g.game_date = ${date}::date
        AND m.slug = 'moneyline' AND o.source = 'odds-api'
        AND o.provider_event_id IS NOT NULL AND trim(o.provider_event_id) <> ''
        AND b.is_active = true AND b.is_sharp IS NOT NULL
        AND trim(b.name) <> '' AND trim(b.slug) <> ''
        AND o.is_available = true AND o.is_stale = false
        AND o.market_status = 'open'
        AND o.captured_at <= ${now} AND o.captured_at < g.starts_at
        AND date_trunc('milliseconds', o.captured_at)
          < date_trunc('milliseconds', g.starts_at)
        AND (o.price BETWEEN 100 AND 2000 OR o.price BETWEEN -2000 AND -100)
    ),
    identity_latest AS (
      SELECT game_id, sportsbook_key, selection, provider_event_id,
        max(captured_at) AS latest_at
      FROM eligible GROUP BY game_id, sportsbook_key, selection, provider_event_id
    ),
    identity_ranks AS (
      SELECT *, dense_rank() OVER (
        PARTITION BY game_id, sportsbook_key, selection ORDER BY latest_at DESC
      ) AS identity_rank FROM identity_latest
    ),
    identity_winners AS (
      SELECT *, count(*) OVER (
        PARTITION BY game_id, sportsbook_key, selection
      ) AS winner_count FROM identity_ranks WHERE identity_rank = 1
    ),
    observation_times AS (
      SELECT e.game_id, e.sportsbook_id, e.sportsbook_key, e.selection,
        e.provider_event_id, e.captured_at, min(e.price) AS price
      FROM eligible e JOIN identity_winners w
        ON w.game_id = e.game_id AND w.sportsbook_key = e.sportsbook_key
        AND w.selection = e.selection AND w.provider_event_id = e.provider_event_id
      WHERE w.winner_count = 1
      GROUP BY e.game_id, e.sportsbook_id, e.sportsbook_key, e.selection,
        e.provider_event_id, e.captured_at
      HAVING count(DISTINCT e.price) = 1
    ),
    ranked_points AS (
      SELECT *, row_number() OVER (
        PARTITION BY game_id, sportsbook_key, selection ORDER BY captured_at ASC
      ) AS first_rank, row_number() OVER (
        PARTITION BY game_id, sportsbook_key, selection ORDER BY captured_at DESC
      ) AS recent_rank FROM observation_times
    ),
    book_names AS (
      SELECT sportsbook_name, count(DISTINCT sportsbook_key) AS book_count
      FROM eligible GROUP BY sportsbook_name
    )
    SELECT p.game_id AS "gameId", p.selection, p.price,
      p.captured_at AS "capturedAt", p.sportsbook_key AS "sportsbookKey",
      CASE WHEN n.book_count > 1 THEN b.name || ' (' || b.slug || ')'
        ELSE b.name END AS sportsbook,
      b.is_sharp AS "isSharp", 'odds-api' AS source,
      p.provider_event_id AS "providerEventId", 'open' AS "marketStatus",
      true AS "isAvailable", false AS "isStale", true AS "isActive",
      g.starts_at AS "startsAt"
    FROM ranked_points p
    JOIN ${sportsbooksTable} b ON b.id = p.sportsbook_id
    JOIN ${gamesTable} g ON g.id = p.game_id
    JOIN book_names n ON n.sportsbook_name = b.name
    WHERE p.first_rank = 1 OR p.recent_rank <= 2
    ORDER BY p.captured_at ASC, p.game_id, p.sportsbook_key, p.selection
  `;
}

export class MarketAnalyticsBusyError extends Error {
  constructor() {
    super("Market Analytics is temporarily busy. Please retry.");
  }
}

type RawRow = Omit<MarketAnalyticsSnapshotRow, "capturedAt" | "startsAt"> & {
  capturedAt: Date | string;
  startsAt: Date | string | null;
};
type Execute = (query: ReturnType<typeof compactMarketAnalyticsQuery>) => Promise<{ rows: RawRow[] }>;
type Histories = ReturnType<typeof buildMarketAnalyticsHistories>;

/** In-flight work only, never an entitlement or response cache. Failed work
 * is evicted, and distinct-date scans cannot multiply without a small bound. */
export function createMarketAnalyticsLoader(execute: Execute, maxDates = 2) {
  const pending = new Map<string, Promise<Histories>>();
  return (date: string, now = new Date()): Promise<Histories> => {
    const existing = pending.get(date);
    if (existing) return existing;
    if (pending.size >= maxDates) return Promise.reject(new MarketAnalyticsBusyError());
    const work = Promise.resolve()
      .then(() => execute(compactMarketAnalyticsQuery(date, now)))
      .then(({ rows }) => buildMarketAnalyticsHistories(rows.map((row) => ({
        ...row,
        capturedAt: new Date(row.capturedAt),
        startsAt: row.startsAt === null ? null : new Date(row.startsAt),
      })), now))
      .finally(() => { pending.delete(date); });
    pending.set(date, work);
    return work;
  };
}

export const loadMarketAnalyticsHistories = createMarketAnalyticsLoader(
  async (query) => db.execute<RawRow>(query),
);
