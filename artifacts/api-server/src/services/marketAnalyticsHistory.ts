export type MarketAnalyticsHistoryPoint = {
  selection: string;
  price: number;
  capturedAt: string;
  sportsbook: string | null;
};

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
  const byBookAndSelection = new Map<string, MarketAnalyticsHistoryPoint[]>();

  for (const point of points) {
    if (!point.sportsbook) continue;
    const key = `${point.sportsbook}\u0000${point.selection}`;
    const group = byBookAndSelection.get(key) ?? [];
    group.push(point);
    byBookAndSelection.set(key, group);
  }

  return [...byBookAndSelection.values()]
    .flatMap((group) => {
      if (group.length <= 3) return group;
      return [group[0]!, ...group.slice(-2)];
    })
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}