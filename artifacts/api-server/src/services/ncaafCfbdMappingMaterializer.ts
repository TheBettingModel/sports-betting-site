import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, ncaafCfbdDomainEvidenceTable, ncaafCfbdGameMappingsTable, ncaafCfbdTeamMappingsTable, ncaafGameEvidenceTable } from "@workspace/db";
import { cfbdPayloadHash } from "./collegeFootballData";
import { decideCfbdGameMapping, decideCfbdTeamMapping } from "./ncaafCfbdIdentity";

/** Reconciles only mechanically-normalized exact identities; never fuzzy names. */
export async function materializeCurrentCfbdMappings(season: number, capturedAt = new Date()): Promise<{ teams: number; games: number }> {
  const [rows, teamLedger] = await Promise.all([
    db.select({
      id: ncaafGameEvidenceTable.id,
      provider: ncaafGameEvidenceTable.provider,
      providerEventId: ncaafGameEvidenceTable.providerEventId,
      capturedAt: ncaafGameEvidenceTable.capturedAt,
      kickoffAt: ncaafGameEvidenceTable.kickoffAt,
      homeProviderTeamId: ncaafGameEvidenceTable.homeProviderTeamId,
      awayProviderTeamId: ncaafGameEvidenceTable.awayProviderTeamId,
      homeTeamName: ncaafGameEvidenceTable.homeTeamName,
      awayTeamName: ncaafGameEvidenceTable.awayTeamName,
      neutralSite: ncaafGameEvidenceTable.neutralSite,
    }).from(ncaafGameEvidenceTable).where(eq(ncaafGameEvidenceTable.season, season)),
    db.selectDistinctOn([ncaafCfbdDomainEvidenceTable.cfbdTeamId], {
      id: ncaafCfbdDomainEvidenceTable.id,
      endpoint: ncaafCfbdDomainEvidenceTable.endpoint,
      cfbdTeamId: ncaafCfbdDomainEvidenceTable.cfbdTeamId,
      providerEffectiveAt: ncaafCfbdDomainEvidenceTable.providerEffectiveAt,
      capturedAt: ncaafCfbdDomainEvidenceTable.capturedAt,
      payload: ncaafCfbdDomainEvidenceTable.payload,
    }).from(ncaafCfbdDomainEvidenceTable).where(and(
      eq(ncaafCfbdDomainEvidenceTable.season, season),
      eq(ncaafCfbdDomainEvidenceTable.endpoint, "teams"),
      isNotNull(ncaafCfbdDomainEvidenceTable.cfbdTeamId),
    )).orderBy(
      ncaafCfbdDomainEvidenceTable.cfbdTeamId,
      sql`${ncaafCfbdDomainEvidenceTable.providerEffectiveAt} DESC NULLS LAST`,
      desc(ncaafCfbdDomainEvidenceTable.capturedAt),
      desc(ncaafCfbdDomainEvidenceTable.id),
    ),
  ]);
  // Evidence is append-only: choose the most recent observation for every
  // provider identity, never whichever database row happened to arrive first.
  const newestFirst = <T extends { capturedAt: Date; id: number }>(left: T, right: T) =>
    right.capturedAt.getTime() - left.capturedAt.getTime() || right.id - left.id;
  const currentBy = <T extends { capturedAt: Date; id: number }>(items: readonly T[], key: (item: T) => string) =>
    [...items].sort(newestFirst).reduce((result, item) => result.has(key(item)) ? result : result.set(key(item), item), new Map<string, T>());
  const espn = [...currentBy(rows.filter((row) => row.provider === "espn" && row.kickoffAt && row.homeProviderTeamId && row.awayProviderTeamId),
    (row) => row.providerEventId).values()];
  const cfbd = [...currentBy(rows.filter((row) => row.provider === "college_football_data"),
    (row) => row.providerEventId).values()];
  let teams = 0; let games = 0;
  const currentEspnTeams = currentBy(espn.flatMap((row) => [
    row.homeProviderTeamId && row.homeTeamName ? { provider: "espn", teamId: row.homeProviderTeamId, school: row.homeTeamName, capturedAt: row.capturedAt, id: row.id } : null,
    row.awayProviderTeamId && row.awayTeamName ? { provider: "espn", teamId: row.awayProviderTeamId, school: row.awayTeamName, capturedAt: row.capturedAt, id: row.id } : null,
  ]).filter((candidate): candidate is { provider: string; teamId: string; school: string; capturedAt: Date; id: number } => candidate != null),
  (candidate) => `${candidate.provider}:${candidate.teamId}`);
  const candidates = [...currentEspnTeams.values()].map(({ provider, teamId, school }) => ({ provider, teamId, school }));
  const ledgerNewestFirst = [...teamLedger.filter((row) => row.endpoint === "teams" && row.cfbdTeamId)].sort((left, right) =>
    (right.providerEffectiveAt?.getTime() ?? Number.NEGATIVE_INFINITY) - (left.providerEffectiveAt?.getTime() ?? Number.NEGATIVE_INFINITY)
    || newestFirst(left, right));
  const currentLedgerTeams = ledgerNewestFirst.reduce((result, row) =>
    result.has(row.cfbdTeamId!) ? result : result.set(row.cfbdTeamId!, row), new Map<string, typeof ledgerNewestFirst[number]>());
  const ledgerTeams = [...currentLedgerTeams.values()].map((row) => {
    const payload = row.payload as Record<string, unknown>;
    return { id: row.cfbdTeamId!, school: typeof payload.school === "string" ? payload.school : undefined,
      mascot: typeof payload.mascot === "string" ? payload.mascot : undefined,
      conference: typeof payload.conference === "string" ? payload.conference : undefined,
      classification: typeof payload.classification === "string" ? payload.classification : undefined };
  });
  // The teams endpoint is the authoritative CFBD team ledger. Only use game
  // display names when that ledger has not been captured for this season.
  const cfbdTeams = ledgerTeams.length ? ledgerTeams : [...new Map(cfbd.flatMap((game) => [
    game.homeProviderTeamId ? { id: game.homeProviderTeamId, school: game.homeTeamName ?? undefined, mascot: undefined } : null,
    game.awayProviderTeamId ? { id: game.awayProviderTeamId, school: game.awayTeamName ?? undefined, mascot: undefined } : null,
  ]).filter((team): team is { id: string; school: string | undefined; mascot: undefined } => team != null)
    .map((team) => [team.id, team])).values()];
  const mappedTeams = new Map<string, string | null>();
  for (const team of cfbdTeams) {
      const decision = decideCfbdTeamMapping(team, candidates);
      mappedTeams.set(team.id, decision.state === "MAPPED" ? decision.canonicalTeamId : null);
       const evidence = {
         cfbdTeamId: team.id, school: team.school ?? null, mascot: team.mascot ?? null,
         mappingMethod: decision.mappingMethod, confidence: decision.confidence, reviewStatus: decision.reviewStatus, decision,
       };
      const inserted = await db.insert(ncaafCfbdTeamMappingsTable).values({
        cfbdTeamId: team.id, season, canonicalProvider: decision.canonicalProvider, canonicalTeamId: decision.canonicalTeamId,
        state: decision.state, reason: decision.reason, evidence, payloadHash: cfbdPayloadHash(evidence), capturedAt,
      }).onConflictDoNothing().returning({ id: ncaafCfbdTeamMappingsTable.id });
      teams += inserted.length;
  }
  // Complete the team pass before mapping games; game row order cannot decide
  // whether either ordered side has a canonical identity.
  for (const game of cfbd) {
    const home = game.homeProviderTeamId ? mappedTeams.get(game.homeProviderTeamId) ?? null : null;
    const away = game.awayProviderTeamId ? mappedTeams.get(game.awayProviderTeamId) ?? null : null;
    const decision = decideCfbdGameMapping({ id: game.providerEventId, homeCanonicalTeamId: home, awayCanonicalTeamId: away, kickoffAt: game.kickoffAt, neutralSite: game.neutralSite },
      espn.map((candidate) => ({ provider: "espn", eventId: candidate.providerEventId, homeTeamId: candidate.homeProviderTeamId!, awayTeamId: candidate.awayProviderTeamId!, kickoffAt: candidate.kickoffAt!, neutralSite: candidate.neutralSite })));
    const evidence = {
      cfbdGameId: game.providerEventId, homeCfbdTeamId: game.homeProviderTeamId, awayCfbdTeamId: game.awayProviderTeamId,
      mappingMethod: decision.mappingMethod, confidence: decision.confidence, reviewStatus: decision.reviewStatus, decision,
    };
    const inserted = await db.insert(ncaafCfbdGameMappingsTable).values({
      cfbdGameId: game.providerEventId, season, canonicalProvider: decision.canonicalProvider, canonicalEventId: decision.canonicalEventId,
      state: decision.state, reason: decision.reason, evidence, payloadHash: cfbdPayloadHash(evidence), capturedAt,
    }).onConflictDoNothing().returning({ id: ncaafCfbdGameMappingsTable.id });
    games += inserted.length;
  }
  return { teams, games };
}