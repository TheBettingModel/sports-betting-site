type Observation = {
  sportsbook?: string | null;
  selection: string | null;
  capturedAt: string;
};

/** Never mix bookmakers or count duplicate provider timestamps as a pair.
 * Prefer a complete comparison over a more recent singleton from another book. */
export function comparableMarketHistory<T extends Observation>(
  points: readonly T[], selection: string | null,
): T[] {
  if (!selection) return [];
  const groups = new Map<string, Map<string, T>>();
  for (const point of points) {
    if (point.selection !== selection || !point.sportsbook
      || !Number.isFinite(Date.parse(point.capturedAt))) continue;
    const book = point.sportsbook.trim().toLowerCase();
    const observations = groups.get(book) ?? new Map<string, T>();
    observations.set(new Date(point.capturedAt).toISOString(), point);
    groups.set(book, observations);
  }
  return [...groups.values()]
    .map((observations) => [...observations.values()].sort((a, b) =>
      Date.parse(a.capturedAt) - Date.parse(b.capturedAt)))
    .sort((a, b) => {
      const complete = Number(b.length >= 2) - Number(a.length >= 2);
      return complete || Date.parse(b[b.length - 1]!.capturedAt) - Date.parse(a[a.length - 1]!.capturedAt);
    })[0] ?? [];
}