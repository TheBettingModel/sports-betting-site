/** Event aliases are serving identities, never a reason to rewrite provider evidence. */
export function resolveNcaafEventIdentity(provider: string, originalEventId: string) {
  if (provider !== "espn" || !/^(?:NCAAF-)?[0-9]+$/.test(originalEventId)) return null;
  const providerEventId = originalEventId.replace(/^NCAAF-/, "");
  return Object.freeze({
    provider, originalEventId, providerEventId,
    publicGameId: `NCAAF-${providerEventId}`,
    key: `${provider}:${providerEventId}`,
    aliases: [providerEventId, `NCAAF-${providerEventId}`],
  });
}

// Same 90-minute ordered-team fixture tolerance as decideCfbdGameMapping.
// The six-hour market-provider window is NOT a canonical fixture identity rule.
export const NCAAF_EVENT_KICKOFF_TOLERANCE_MS = 90 * 60_000;
const kickoffMatches = (a: Date | null, b: Date | null) => a instanceof Date && b instanceof Date
  && Number.isFinite(a.getTime()) && Number.isFinite(b.getTime())
  && Math.abs(a.getTime() - b.getTime()) <= NCAAF_EVENT_KICKOFF_TOLERANCE_MS;

export type NcaafIdentityTarget = {
  targetProvider: string; targetEventId: string;
  homeProviderTeamId: string | null; awayProviderTeamId: string | null; kickoffAt: Date;
};
export type NcaafNamedEventEvidence = {
  id: number; provider: string; providerEventId: string; capturedAt: Date; kickoffAt: Date | null;
  homeProviderTeamId: string | null; awayProviderTeamId: string | null;
  homeTeamName: string | null; awayTeamName: string | null;
};
export type NcaafPublicGameIdentity = {
  id: string; homeTeamId: string | null; awayTeamId: string | null; startsAt: Date | null;
};

/** Newest evidence is verified, never replaced with an older convenient match. */
export function verifyNcaafEventAssociation<E extends NcaafNamedEventEvidence>(
  target: NcaafIdentityTarget, evidence: readonly E[], games: readonly NcaafPublicGameIdentity[],
) {
  const identity = resolveNcaafEventIdentity(target.targetProvider, target.targetEventId);
  const fail = (reason: string) => ({ verified: false as const, reason, identity, game: null, publicGameId: null });
  if (!identity) return fail("UNSUPPORTED_EVENT_IDENTITY");
  if (!target.homeProviderTeamId || !target.awayProviderTeamId
    || target.homeProviderTeamId === target.awayProviderTeamId) return fail("MISSING_OR_INVALID_TEAM_IDS");
  const game = evidence.filter(row => resolveNcaafEventIdentity(row.provider, row.providerEventId)?.key === identity.key)
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || b.id - a.id)[0];
  if (!game) return fail("MISSING_GAME_EVIDENCE");
  if (game.homeProviderTeamId !== target.homeProviderTeamId
    || game.awayProviderTeamId !== target.awayProviderTeamId) return fail("EVIDENCE_ORDERED_TEAM_CONFLICT");
  if (!kickoffMatches(game.kickoffAt, target.kickoffAt)) return fail("EVIDENCE_KICKOFF_CONFLICT");
  if (!game.homeTeamName || !game.awayTeamName) return fail("MISSING_TEAM_NAMES");
  const publicGame = games.find(row => row.id === identity.publicGameId);
  if (!publicGame) return fail("MISSING_PUBLIC_GAME");
  if (publicGame.homeTeamId !== target.homeProviderTeamId
    || publicGame.awayTeamId !== target.awayProviderTeamId) return fail("PUBLIC_GAME_ORDERED_TEAM_CONFLICT");
  if (!publicGame.startsAt || !kickoffMatches(publicGame.startsAt, target.kickoffAt)) return fail("PUBLIC_GAME_KICKOFF_CONFLICT");
  return { verified: true as const, reason: "VERIFIED_EVENT_IDENTITY", identity, game, publicGameId: publicGame.id };
}

/** Defensive in-memory selection also supports old test/export input populations. */
export function latestNcaafEventSnapshots<T extends NcaafIdentityTarget & { id: number; dataCutoffAt: Date }>(rows: readonly T[]) {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const key = resolveNcaafEventIdentity(row.targetProvider, row.targetEventId)?.key
      ?? `${row.targetProvider}:${row.targetEventId}`;
    const prior = latest.get(key);
    if (!prior || row.dataCutoffAt > prior.dataCutoffAt
      || (row.dataCutoffAt.getTime() === prior.dataCutoffAt.getTime() && row.id > prior.id)) latest.set(key, row);
  }
  return [...latest.values()];
}

/** Resolve old raw canonical references using their exact saved snapshot provenance.
 * The original ledger row and provider identity are returned unchanged. */
export function resolveNcaafPredictionHistory<E extends NcaafNamedEventEvidence>(
  prediction: { canonicalGameId: string; sourceAudit: unknown; kickoffAt: Date; featureCutoff: Date },
  snapshot: NcaafIdentityTarget & { id: number; dataCutoffAt: Date },
  evidence: readonly E[], games: readonly NcaafPublicGameIdentity[],
) {
  const audit = prediction.sourceAudit as { snapshotId?: number } | null;
  const savedIdentity = resolveNcaafEventIdentity(snapshot.targetProvider, prediction.canonicalGameId);
  const snapshotIdentity = resolveNcaafEventIdentity(snapshot.targetProvider, snapshot.targetEventId);
  if (audit?.snapshotId !== snapshot.id || !savedIdentity || savedIdentity.key !== snapshotIdentity?.key
    || prediction.featureCutoff.getTime() !== snapshot.dataCutoffAt.getTime()
    || !kickoffMatches(prediction.kickoffAt, snapshot.kickoffAt)) return null;
  const association = verifyNcaafEventAssociation(snapshot, evidence, games);
  return association.verified ? { original: prediction, publicGameId: association.publicGameId, providerIdentity: association.identity } : null;
}