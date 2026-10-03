export type MarketAnalyticsHistoryPoint = {
  selection: string;
  price: number;
  capturedAt: string;
  sportsbook: string | null;
};

export type MarketAnalyticsSnapshotRow = {
  gameId: string;
  selection: string;
  price: number;
  capturedAt: Date;
  sportsbook: string | null;
  sportsbookKey: string | null;
  isSharp: boolean | null;
  source: string;
  providerEventId: string | null;
  marketStatus: string;
  isAvailable: boolean;
  isStale: boolean;
  isActive: boolean;
  startsAt: Date | null;
};

export type MarketAnalyticsGameHistory = {
  marketHistory: MarketAnalyticsHistoryPoint[];
  sharpMoneyHistory: MarketAnalyticsHistoryPoint[];
};

type IdentifiedHistoryPoint = {
  point: MarketAnalyticsHistoryPoint;
  sportsbookKey: string;
};

function retainHistoryByIdentity(
  points: IdentifiedHistoryPoint[],
): MarketAnalyticsHistoryPoint[] {
  const byBookAndSelection = new Map<string, IdentifiedHistoryPoint[]>();

  for (const entry of points) {
    const key = `${entry.sportsbookKey}\u0000${entry.point.selection}`;
    const group = byBookAndSelection.get(key) ?? [];
    group.push(entry);
    byBookAndSelection.set(key, group);
  }

  return [...byBookAndSelection.values()]
    .flatMap((observations) => {
      // Repeated captures of one provider update are one observation, not
      // movement. Conflicting prices at one timestamp are not a valid pair.
      const byTime = new Map<string, IdentifiedHistoryPoint | null>();
      for (const entry of observations) {
        const previous = byTime.get(entry.point.capturedAt);
        if (previous === null) continue;
        byTime.set(entry.point.capturedAt, previous && previous.point.price !== entry.point.price ? null : entry);
      }
      const group = [...byTime.values()].filter((entry): entry is IdentifiedHistoryPoint => entry !== null)
        .sort((a, b) => a.point.capturedAt.localeCompare(b.point.capturedAt));
      const retained = group.length <= 3
        ? group
        : [group[0]!, ...group.slice(-2)];
      return retained.map(({ point }) => point);
    })
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

/**
 * Keep the day's first observation and newest comparable pair for every
 * sportsbook and selection.
 *
 * A global tail can discard the earlier member of each pair when many books
 * update at once. Keeping only the newest pair can also hide a real daily move
 * when the last two provider updates happen to carry the same price.
 */
export function retainComparableHistory(
  points: MarketAnalyticsHistoryPoint[],
): MarketAnalyticsHistoryPoint[] {
  return retainHistoryByIdentity(points
    .filter((point): point is MarketAnalyticsHistoryPoint & { sportsbook: string } => Boolean(point.sportsbook))
    .map((point) => ({ point, sportsbookKey: point.sportsbook })));
}

function isEligiblePregameSnapshot(
  row: MarketAnalyticsSnapshotRow,
  now: Date,
): boolean {
  const capturedAt = row.capturedAt.getTime();
  const startsAt = row.startsAt?.getTime();

  return row.source === "odds-api"
    && Boolean(row.providerEventId?.trim())
    && Boolean(row.sportsbook?.trim())
    && Boolean(row.sportsbookKey?.trim())
    && row.isSharp !== null
    && row.isActive
    && row.isAvailable
    && !row.isStale
    && row.marketStatus === "open"
    && Number.isInteger(row.price)
    && (row.price >= 100 && row.price <= 2000
      || row.price <= -100 && row.price >= -2000)
    && Number.isFinite(capturedAt)
    && Number.isFinite(startsAt)
    && capturedAt <= now.getTime()
    && capturedAt < startsAt!;
}

/**
 * Build only source-attributed, named-book pregame evidence. The display name
 * is retained in the response, while the canonical book key keeps separate
 * books from being merged when they share a display name.
 */
export function buildMarketAnalyticsHistories(
  rows: readonly MarketAnalyticsSnapshotRow[],
  now = new Date(),
): Map<string, MarketAnalyticsGameHistory> {
  const bookKeysByName = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!isEligiblePregameSnapshot(row, now)) continue;
    const keys = bookKeysByName.get(row.sportsbook!) ?? new Set<string>();
    keys.add(row.sportsbookKey!);
    bookKeysByName.set(row.sportsbook!, keys);
  }
  const pendingByGame = new Map<string, {
    marketHistory: IdentifiedHistoryPoint[];
    sharpMoneyHistory: IdentifiedHistoryPoint[];
  }>();

  for (const row of rows) {
    if (!isEligiblePregameSnapshot(row, now)) continue;
    const entry = pendingByGame.get(row.gameId) ?? {
      marketHistory: [],
      sharpMoneyHistory: [],
    };
    const identifiedPoint: IdentifiedHistoryPoint = {
      sportsbookKey: row.sportsbookKey!,
      point: {
        selection: row.selection,
        price: row.price,
        capturedAt: row.capturedAt.toISOString(),
        // The existing mobile contract groups by display name. Disambiguate
        // only collisions so two canonical books cannot masquerade as a pair.
        sportsbook: bookKeysByName.get(row.sportsbook!)!.size > 1
          ? `${row.sportsbook} (${row.sportsbookKey})` : row.sportsbook,
      },
    };
    (row.isSharp ? entry.sharpMoneyHistory : entry.marketHistory).push(identifiedPoint);
    pendingByGame.set(row.gameId, entry);
  }

  return new Map([...pendingByGame].map(([gameId, history]) => [
    gameId,
    {
      marketHistory: retainHistoryByIdentity(history.marketHistory),
      sharpMoneyHistory: retainHistoryByIdentity(history.sharpMoneyHistory),
    },
  ]));
}