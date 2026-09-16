export type MarketAnalyticsHistoryPoint = {
  selection: string;
  price: number;
  capturedAt: string;
  sportsbook: string | null;
};

/**
 * Keep the newest comparable pair for every sportsbook and selection.
 *
 * A global tail can discard the earlier member of each pair when many books
 * update at once, leaving the client unable to calculate any movement.
 */
export function retainComparableHistory(
  points: MarketAnalyticsHistoryPoint[],
): MarketAnalyticsHistoryPoint[] {
  const byBookAndSelection = new Map<string, MarketAnalyticsHistoryPoint[]>();

  for (const point of points) {
    if (!point.sportsbook) continue;
    const key = `${point.sportsbook}\u0000${point.selection}`;
    const group = byBookAndSelection.get(key) ?? [];
    group.push(point);
    byBookAndSelection.set(key, group);
  }

  return [...byBookAndSelection.values()]
    .flatMap((group) => group.slice(-2))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}