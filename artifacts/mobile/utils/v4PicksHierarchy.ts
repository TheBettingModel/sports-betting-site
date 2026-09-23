export type V4OfficialPickLike = {
  eventId: string;
  market: string;
  role: string;
  rank: number;
  status: string;
};

export type V4ProjectionLike = {
  eventId: string;
  /** Current V4 projections are game-level moneyline forecasts. */
  market?: string;
};

function marketIdentity(market: string | undefined): string {
  return (market ?? 'moneyline').trim().toLowerCase();
}

export function officialPickIdentity(pick: Pick<V4OfficialPickLike, 'eventId' | 'market'>): string {
  return `${pick.eventId}::${marketIdentity(pick.market)}`;
}

/**
 * Official hierarchy comes exclusively from the independently persisted
 * officialPicks collection. Current projections can disappear or acquire a
 * different forecast ID without affecting official-pick visibility.
 */
export function splitV4Picks<
  TOfficial extends V4OfficialPickLike,
  TProjection extends V4ProjectionLike,
>(officialPicks: readonly TOfficial[], projections: readonly TProjection[]) {
  const published = officialPicks.filter((pick) => pick.status === 'PUBLISHED');
  const topCandidates = published.filter((pick) => pick.role === 'TOP_PLAY');
  const topPlays = topCandidates.length === 1 ? topCandidates : [];
  const qualifiedPlays = published
    .filter((pick) => pick.role === 'QUALIFIED_PLAY')
    .sort((a, b) => a.rank - b.rank);
  const officialIdentities = new Set(published.map(officialPickIdentity));
  const projectionsOnly = projections.filter((projection) =>
    !officialIdentities.has(`${projection.eventId}::${marketIdentity(projection.market)}`),
  );

  return {
    topPlays,
    topCandidateCount: topCandidates.length,
    topPlayIsAvailable: topCandidates.length === 1,
    qualifiedPlays,
    projectionsOnly,
  };
}