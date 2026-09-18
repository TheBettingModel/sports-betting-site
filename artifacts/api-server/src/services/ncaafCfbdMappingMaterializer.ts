import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, ncaafCfbdDomainEvidenceTable, ncaafCfbdGameMappingsTable, ncaafCfbdTeamMappingsTable, ncaafGameEvidenceTable } from "@workspace/db";
import { cfbdPayloadHash } from "./collegeFootballData";
import { decideCfbdGameMapping, decideCfbdTeamMapping, normalizeNcaafSchoolIdentity } from "./ncaafCfbdIdentity";

type EvidenceRow = {
  id: number; provider: string; providerEventId: string; season: number; capturedAt: Date;
  kickoffAt: Date | null; homeProviderTeamId: string | null; awayProviderTeamId: string | null;
  homeTeamName: string | null; awayTeamName: string | null; neutralSite: boolean | null;
};
type TeamLedgerRow = {
  id: number; season: number; endpoint: string; cfbdTeamId: string | null;
  providerEffectiveAt: Date | null; capturedAt: Date; payload: unknown;
};

async function loadMappingEvidence(seasons: readonly number[]) {
  const [rows, teamLedger] = await Promise.all([
    db.select({
      id: ncaafGameEvidenceTable.id, provider: ncaafGameEvidenceTable.provider,
      providerEventId: ncaafGameEvidenceTable.providerEventId, season: ncaafGameEvidenceTable.season,
      capturedAt: ncaafGameEvidenceTable.capturedAt, kickoffAt: ncaafGameEvidenceTable.kickoffAt,
      homeProviderTeamId: ncaafGameEvidenceTable.homeProviderTeamId,
      awayProviderTeamId: ncaafGameEvidenceTable.awayProviderTeamId,
      homeTeamName: ncaafGameEvidenceTable.homeTeamName, awayTeamName: ncaafGameEvidenceTable.awayTeamName,
      neutralSite: ncaafGameEvidenceTable.neutralSite,
    }).from(ncaafGameEvidenceTable).where(inArray(ncaafGameEvidenceTable.season, [...seasons])),
    db.selectDistinctOn([ncaafCfbdDomainEvidenceTable.season, ncaafCfbdDomainEvidenceTable.cfbdTeamId], {
      id: ncaafCfbdDomainEvidenceTable.id, season: ncaafCfbdDomainEvidenceTable.season,
      endpoint: ncaafCfbdDomainEvidenceTable.endpoint, cfbdTeamId: ncaafCfbdDomainEvidenceTable.cfbdTeamId,
      providerEffectiveAt: ncaafCfbdDomainEvidenceTable.providerEffectiveAt,
      capturedAt: ncaafCfbdDomainEvidenceTable.capturedAt, payload: ncaafCfbdDomainEvidenceTable.payload,
    }).from(ncaafCfbdDomainEvidenceTable).where(and(
      inArray(ncaafCfbdDomainEvidenceTable.season, [...seasons]),
      eq(ncaafCfbdDomainEvidenceTable.endpoint, "teams"),
      isNotNull(ncaafCfbdDomainEvidenceTable.cfbdTeamId),
    )).orderBy(
      ncaafCfbdDomainEvidenceTable.season, ncaafCfbdDomainEvidenceTable.cfbdTeamId,
      sql`${ncaafCfbdDomainEvidenceTable.providerEffectiveAt} DESC NULLS LAST`,
      desc(ncaafCfbdDomainEvidenceTable.capturedAt), desc(ncaafCfbdDomainEvidenceTable.id),
    ),
  ]);
  return { rows: rows as EvidenceRow[], teamLedger: teamLedger as TeamLedgerRow[] };
}

function newestFirst<T extends { capturedAt: Date; id: number }>(left: T, right: T) {
  return right.capturedAt.getTime() - left.capturedAt.getTime() || right.id - left.id;
}
function currentBy<T extends { capturedAt: Date; id: number }>(items: readonly T[], key: (item: T) => string) {
  return [...items].sort(newestFirst).reduce((result, item) => result.has(key(item)) ? result : result.set(key(item), item), new Map<string, T>());
}
function identityKeys(value: string) {
  const words = normalizeNcaafSchoolIdentity(value).split(" ");
  return words.map((_, index) => words.slice(0, index + 1).join(" "));
}

/** Reconciles only mechanically-normalized exact identities; never fuzzy names.
 * All requested seasons are read once and mapping writes are batched. */
export async function materializeCfbdMappingsForSeasons(
  seasons: readonly number[], capturedAt = new Date(),
): Promise<{ teams: number; games: number }> {
  const requested = [...new Set(seasons)].sort((a, b) => a - b);
  if (!requested.length) return { teams: 0, games: 0 };
  const { rows, teamLedger } = await loadMappingEvidence(requested);
  const teamValues: Array<typeof ncaafCfbdTeamMappingsTable.$inferInsert> = [];
  const gameValues: Array<typeof ncaafCfbdGameMappingsTable.$inferInsert> = [];

  for (const season of requested) {
    const seasonRows = rows.filter((row) => row.season === season);
    const espn = [...currentBy(seasonRows.filter((row) => row.provider === "espn" && row.kickoffAt && row.homeProviderTeamId && row.awayProviderTeamId), (row) => row.providerEventId).values()];
    const cfbd = [...currentBy(seasonRows.filter((row) => row.provider === "college_football_data"), (row) => row.providerEventId).values()];
    const currentEspnTeams = currentBy(espn.flatMap((row) => [
      row.homeProviderTeamId && row.homeTeamName ? { provider: "espn", teamId: row.homeProviderTeamId, school: row.homeTeamName, capturedAt: row.capturedAt, id: row.id } : null,
      row.awayProviderTeamId && row.awayTeamName ? { provider: "espn", teamId: row.awayProviderTeamId, school: row.awayTeamName, capturedAt: row.capturedAt, id: row.id } : null,
    ]).filter((candidate): candidate is { provider: string; teamId: string; school: string; capturedAt: Date; id: number } => candidate != null), (candidate) => `${candidate.provider}:${candidate.teamId}`);
    const candidates = [...currentEspnTeams.values()].map(({ provider, teamId, school }) => ({ provider, teamId, school }));
    const candidatesByIdentity = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      for (const key of identityKeys(candidate.school)) {
        candidatesByIdentity.set(key, [...(candidatesByIdentity.get(key) ?? []), candidate]);
      }
    }
    const ledgerTeams = teamLedger.filter((row) => row.season === season && row.endpoint === "teams" && row.cfbdTeamId)
      .map((row) => {
        const payload = row.payload as Record<string, unknown>;
        return { id: row.cfbdTeamId!, school: typeof payload.school === "string" ? payload.school : undefined, mascot: typeof payload.mascot === "string" ? payload.mascot : undefined, conference: typeof payload.conference === "string" ? payload.conference : undefined, classification: typeof payload.classification === "string" ? payload.classification : undefined };
      });
    const cfbdTeams = ledgerTeams.length ? ledgerTeams : [...new Map(cfbd.flatMap((game) => [
      game.homeProviderTeamId ? { id: game.homeProviderTeamId, school: game.homeTeamName ?? undefined, mascot: undefined } : null,
      game.awayProviderTeamId ? { id: game.awayProviderTeamId, school: game.awayTeamName ?? undefined, mascot: undefined } : null,
    ]).filter((team): team is { id: string; school: string | undefined; mascot: undefined } => team != null).map((team) => [team.id, team])).values()];
    const mappedTeams = new Map<string, string | null>();
    for (const team of cfbdTeams) {
      const candidatePool = [...new Map([
        ...identityKeys(team.school ?? "").flatMap((key) => candidatesByIdentity.get(key) ?? []),
        ...(team.mascot ? identityKeys(`${team.school} ${team.mascot}`).flatMap((key) => candidatesByIdentity.get(key) ?? []) : []),
      ].map((candidate) => [`${candidate.provider}:${candidate.teamId}`, candidate])).values()];
      const decision = decideCfbdTeamMapping(team, candidatePool);
      mappedTeams.set(team.id, decision.state === "MAPPED" ? decision.canonicalTeamId : null);
      const evidence = { cfbdTeamId: team.id, school: team.school ?? null, mascot: team.mascot ?? null, mappingMethod: decision.mappingMethod, confidence: decision.confidence, reviewStatus: decision.reviewStatus, decision };
      teamValues.push({ cfbdTeamId: team.id, season, canonicalProvider: decision.canonicalProvider, canonicalTeamId: decision.canonicalTeamId, state: decision.state, reason: decision.reason, evidence, payloadHash: cfbdPayloadHash(evidence), capturedAt });
    }
    const gamesByTeams = new Map<string, typeof espn>();
    for (const candidate of espn) {
      const key = `${candidate.homeProviderTeamId}:${candidate.awayProviderTeamId}`;
      gamesByTeams.set(key, [...(gamesByTeams.get(key) ?? []), candidate]);
    }
    for (const game of cfbd) {
      const home = game.homeProviderTeamId ? mappedTeams.get(game.homeProviderTeamId) ?? null : null;
      const away = game.awayProviderTeamId ? mappedTeams.get(game.awayProviderTeamId) ?? null : null;
      const candidatesForPair = (gamesByTeams.get(`${home}:${away}`) ?? []).map((candidate) => ({ provider: "espn", eventId: candidate.providerEventId, homeTeamId: candidate.homeProviderTeamId!, awayTeamId: candidate.awayProviderTeamId!, kickoffAt: candidate.kickoffAt!, neutralSite: candidate.neutralSite }));
      const decision = decideCfbdGameMapping({ id: game.providerEventId, homeCanonicalTeamId: home, awayCanonicalTeamId: away, kickoffAt: game.kickoffAt, neutralSite: game.neutralSite }, candidatesForPair);
      const evidence = { cfbdGameId: game.providerEventId, homeCfbdTeamId: game.homeProviderTeamId, awayCfbdTeamId: game.awayProviderTeamId, mappingMethod: decision.mappingMethod, confidence: decision.confidence, reviewStatus: decision.reviewStatus, decision };
      gameValues.push({ cfbdGameId: game.providerEventId, season, canonicalProvider: decision.canonicalProvider, canonicalEventId: decision.canonicalEventId, state: decision.state, reason: decision.reason, evidence, payloadHash: cfbdPayloadHash(evidence), capturedAt });
    }
  }
  let teams = 0; let games = 0;
  for (let offset = 0; offset < teamValues.length; offset += 500) {
    const inserted = await db.insert(ncaafCfbdTeamMappingsTable).values(teamValues.slice(offset, offset + 500)).onConflictDoNothing().returning({ id: ncaafCfbdTeamMappingsTable.id });
    teams += inserted.length;
  }
  for (let offset = 0; offset < gameValues.length; offset += 500) {
    const inserted = await db.insert(ncaafCfbdGameMappingsTable).values(gameValues.slice(offset, offset + 500)).onConflictDoNothing().returning({ id: ncaafCfbdGameMappingsTable.id });
    games += inserted.length;
  }
  return { teams, games };
}

/** Preserved single-season API for existing callers and tests. */
export async function materializeCurrentCfbdMappings(season: number, capturedAt = new Date()) {
  return materializeCfbdMappingsForSeasons([season], capturedAt);
}