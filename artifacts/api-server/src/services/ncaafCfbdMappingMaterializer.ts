import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, ncaafCfbdDomainEvidenceTable, ncaafCfbdGameMappingsTable, ncaafCfbdTeamMappingsTable, ncaafGameEvidenceTable } from "@workspace/db";
import { cfbdPayloadHash } from "./collegeFootballData";
import {
  decideCfbdGameMapping, decideCfbdTeamMapping, normalizeNcaafSchoolIdentity,
  type CfbdTeamIdentity, type TeamMappingDecision,
} from "./ncaafCfbdIdentity";

type EvidenceRow = {
  id: number; provider: string; providerEventId: string; season: number; capturedAt: Date;
  kickoffAt: Date | null; homeProviderTeamId: string | null; awayProviderTeamId: string | null;
  homeTeamName: string | null; awayTeamName: string | null; neutralSite: boolean | null;
  payload: unknown;
};
type TeamLedgerRow = {
  id: number; season: number; endpoint: string; cfbdTeamId: string | null;
  providerEffectiveAt: Date | null; capturedAt: Date; payload: unknown;
};
type TrustedTeamMapping = {
  cfbdTeamId: string; canonicalProvider: string | null; canonicalTeamId: string | null; evidence: unknown;
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
      neutralSite: ncaafGameEvidenceTable.neutralSite, payload: ncaafGameEvidenceTable.payload,
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

type TrustedCrossSeasonTeam = {
  cfbdTeamId: string; canonicalProvider: string; canonicalTeamId: string; school: string; classification: string | null;
};

export function reuseTrustedCrossSeasonTeamMapping(
  team: CfbdTeamIdentity,
  decision: TeamMappingDecision,
  trusted: TrustedCrossSeasonTeam | undefined,
): TeamMappingDecision {
  if (decision.state === "MAPPED" || !trusted || team.id == null || !team.school?.trim()) return decision;
  if (String(team.id) !== trusted.cfbdTeamId || trusted.cfbdTeamId !== trusted.canonicalTeamId) return decision;
  if (normalizeNcaafSchoolIdentity(team.school) !== normalizeNcaafSchoolIdentity(trusted.school)) return decision;
  if (!team.classification || !trusted.classification
    || team.classification.toUpperCase() !== trusted.classification.toUpperCase()) return decision;
  return {
    state: "MAPPED", canonicalProvider: trusted.canonicalProvider, canonicalTeamId: trusted.canonicalTeamId,
    reason: "Previously corroborated equal provider ID reused across seasons with exact normalized school identity",
    mappingMethod: "EXACT_PROVIDER_ID", confidence: "HIGH", reviewStatus: "AUTO_APPROVED",
  };
}

export function trustedCrossSeasonTeamMappings(
  trustedTeamMappings: readonly TrustedTeamMapping[],
  teamLedger: readonly TeamLedgerRow[],
): Map<string, TrustedCrossSeasonTeam> {
  const trustedGroups = new Map<string, TrustedTeamMapping[]>();
  for (const mapping of trustedTeamMappings) {
    trustedGroups.set(mapping.cfbdTeamId, [...(trustedGroups.get(mapping.cfbdTeamId) ?? []), mapping]);
  }
  const trustedByCfbdId = new Map<string, TrustedCrossSeasonTeam>();
  for (const [cfbdTeamId, mappings] of trustedGroups) {
    const canonicalPairs = new Set(mappings.map((mapping) => `${mapping.canonicalProvider}:${mapping.canonicalTeamId}`));
    if (canonicalPairs.size !== 1) continue;
    const mapping = mappings[0]!;
    const mappingEvidence = mappings.map((candidate) =>
      candidate.evidence && typeof candidate.evidence === "object"
        ? candidate.evidence as Record<string, unknown> : {});
    const ledgerEvidence = teamLedger.filter((row) => row.cfbdTeamId === cfbdTeamId)
      .map((row) => row.payload && typeof row.payload === "object"
        ? row.payload as Record<string, unknown> : {});
    const schools = [...new Set([...mappingEvidence, ...ledgerEvidence]
      .map((evidence) => typeof evidence.school === "string" ? evidence.school : null)
      .filter((school): school is string => school != null)
      .map((school) => normalizeNcaafSchoolIdentity(school)))];
    const classifications = [...new Set([...mappingEvidence, ...ledgerEvidence]
      .map((evidence) => typeof evidence.classification === "string" ? evidence.classification.toUpperCase() : null)
      .filter((classification): classification is string => classification != null))];
    const school = schools.length === 1 ? schools[0]! : null;
    const classification = classifications.length === 1 ? classifications[0]! : null;
    if (!school || !classification || mapping.canonicalProvider !== "espn" || !mapping.canonicalTeamId) continue;
    trustedByCfbdId.set(cfbdTeamId, {
      cfbdTeamId, canonicalProvider: mapping.canonicalProvider,
      canonicalTeamId: mapping.canonicalTeamId, school, classification,
    });
  }
  return trustedByCfbdId;
}

export function cfbdTeamIdentitiesFromGames(games: readonly EvidenceRow[]): CfbdTeamIdentity[] {
  const teams = new Map<string, CfbdTeamIdentity>();
  const add = (id: string | null, school: string | null, classification: unknown) => {
    if (!id || !school) return;
    const nextClassification = typeof classification === "string" ? classification : undefined;
    const current = teams.get(id);
    if (!current) {
      teams.set(id, { id, school, classification: nextClassification });
      return;
    }
    if (normalizeNcaafSchoolIdentity(current.school ?? "") !== normalizeNcaafSchoolIdentity(school)
      || (current.classification && nextClassification
        && current.classification.toUpperCase() !== nextClassification.toUpperCase())) {
      teams.set(id, { id, school: undefined, classification: undefined });
    }
  };
  for (const row of games) {
    const payload = row.payload && typeof row.payload === "object"
      ? row.payload as Record<string, unknown> : {};
    const game = payload.game && typeof payload.game === "object"
      ? payload.game as Record<string, unknown> : payload;
    add(row.homeProviderTeamId, row.homeTeamName, game.homeClassification);
    add(row.awayProviderTeamId, row.awayTeamName, game.awayClassification);
  }
  return [...teams.values()];
}

/** Reconciles only mechanically-normalized exact identities; never fuzzy names.
 * All requested seasons are read once and mapping writes are batched. */
export async function materializeCfbdMappingsForSeasons(
  seasons: readonly number[], capturedAt = new Date(),
): Promise<{ teams: number; games: number }> {
  const requested = [...new Set(seasons)].sort((a, b) => a - b);
  if (!requested.length) return { teams: 0, games: 0 };
  const { rows, teamLedger } = await loadMappingEvidence(requested);
  const trustedTeamMappings = await db.select({
    cfbdTeamId: ncaafCfbdTeamMappingsTable.cfbdTeamId,
    canonicalProvider: ncaafCfbdTeamMappingsTable.canonicalProvider,
    canonicalTeamId: ncaafCfbdTeamMappingsTable.canonicalTeamId,
    evidence: ncaafCfbdTeamMappingsTable.evidence,
  }).from(ncaafCfbdTeamMappingsTable).where(and(
    eq(ncaafCfbdTeamMappingsTable.state, "MAPPED"),
    isNotNull(ncaafCfbdTeamMappingsTable.canonicalTeamId),
  )) as TrustedTeamMapping[];
  const teamValues: Array<typeof ncaafCfbdTeamMappingsTable.$inferInsert> = [];
  const gameValues: Array<typeof ncaafCfbdGameMappingsTable.$inferInsert> = [];
  const trustedByCfbdId = trustedCrossSeasonTeamMappings(trustedTeamMappings, teamLedger);

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
    const cfbdTeams = ledgerTeams.length ? ledgerTeams : cfbdTeamIdentitiesFromGames(cfbd);
    const mappedTeams = new Map<string, string | null>();
    for (const team of cfbdTeams) {
      if (team.id == null) continue;
      const teamId = String(team.id);
      const candidatePool = [...new Map([
        ...identityKeys(team.school ?? "").flatMap((key) => candidatesByIdentity.get(key) ?? []),
        ...(team.mascot ? identityKeys(`${team.school} ${team.mascot}`).flatMap((key) => candidatesByIdentity.get(key) ?? []) : []),
      ].map((candidate) => [`${candidate.provider}:${candidate.teamId}`, candidate])).values()];
      const decision = reuseTrustedCrossSeasonTeamMapping(
        team,
        decideCfbdTeamMapping(team, candidatePool),
        trustedByCfbdId.get(teamId),
      );
      mappedTeams.set(teamId, decision.state === "MAPPED" ? decision.canonicalTeamId : null);
      const evidence = { cfbdTeamId: teamId, school: team.school ?? null, mascot: team.mascot ?? null, classification: team.classification ?? null, mappingMethod: decision.mappingMethod, confidence: decision.confidence, reviewStatus: decision.reviewStatus, decision };
      teamValues.push({ cfbdTeamId: teamId, season, canonicalProvider: decision.canonicalProvider, canonicalTeamId: decision.canonicalTeamId, state: decision.state, reason: decision.reason, evidence, payloadHash: cfbdPayloadHash(evidence), capturedAt });
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