import { inArray } from "drizzle-orm";
import {
  db, ncaafCfbdDomainEvidenceTable, ncaafCfbdGameMappingsTable,
  ncaafCfbdTeamMappingsTable, ncaafGameEvidenceTable, ncaafHistoricalTrainingRowsTable,
} from "@workspace/db";
import {
  NCAAF_HISTORICAL_SEASONS, NCAAF_HISTORICAL_TRAINING_SCHEMA_VERSION,
  buildNcaafHistoricalTrainingDataset, type HistoricalEvidenceLineage, type HistoricalGameInput,
  type HistoricalQbEvidence,
} from "./ncaafHistoricalTrainingDataset";

export const NCAAF_HISTORICAL_ARTIFACT_KEY = "ncaaf-historical-2023-2026-pit-v1";
type CfbdGame = typeof ncaafGameEvidenceTable.$inferSelect;
type TeamMapping = typeof ncaafCfbdTeamMappingsTable.$inferSelect;
type GameMapping = typeof ncaafCfbdGameMappingsTable.$inferSelect;
type DomainEvidence = typeof ncaafCfbdDomainEvidenceTable.$inferSelect;

export interface NcaafHistoricalMaterializerStore {
  load(seasons: readonly number[]): Promise<{
    games: CfbdGame[]; teamMappings: TeamMapping[]; gameMappings: GameMapping[]; domainEvidence: DomainEvidence[];
  }>;
  insert(row: typeof ncaafHistoricalTrainingRowsTable.$inferInsert): Promise<boolean>;
}
export interface NcaafHistoricalMaterializationResult {
  artifactKey: string;
  attempted: number;
  inserted: number;
  alreadyMaterialized: number;
  report: ReturnType<typeof buildNcaafHistoricalTrainingDataset>["report"];
  /** Explicit reasons are returned when historical provider timing prevents PIT use. */
  blockers: Record<string, number>;
}

function newest<T extends { capturedAt: Date; id: number }>(rows: readonly T[], key: (row: T) => string) {
  return [...rows].sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || b.id - a.id)
    .reduce((result, row) => result.has(key(row)) ? result : result.set(key(row), row), new Map<string, T>());
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function numberStats(value: unknown): Record<string, number | null> {
  return Object.fromEntries(Object.entries(object(value)).filter(([, v]) => typeof v === "number" || v === null)
    .map(([key, value]) => [key, typeof value === "number" ? value : null]));
}
function classifications(payload: unknown) {
  const item = object(payload);
  return { home: text(item.homeClassification), away: text(item.awayClassification) };
}
function qbEvidence(domain: readonly DomainEvidence[], cfbdTeamId: string, canonicalTeamId: string): HistoricalQbEvidence[] {
  return domain.filter((row) => row.cfbdTeamId === cfbdTeamId && (row.endpoint === "roster" || row.endpoint === "player_stats") && row.cfbdPlayerId)
    .map((row) => {
      const payload = object(row.payload);
      return {
        cfbdPlayerId: row.cfbdPlayerId!, cfbdTeamId, canonicalTeamId,
        position: text(payload.position), effectiveAt: row.providerEffectiveAt, capturedAt: row.capturedAt,
        stats: numberStats(payload.stats ?? payload),
      };
    });
}

/** Converts only CFBD rows that have already been mechanically mapped to ESPN
 * canonical IDs. Display names and player names never participate in this pass. */
export function historicalGamesFromCfbdEvidence(source: {
  games: readonly CfbdGame[]; teamMappings: readonly TeamMapping[]; gameMappings: readonly GameMapping[]; domainEvidence: readonly DomainEvidence[];
}): HistoricalGameInput[] {
  const gameMappings = newest(source.gameMappings.filter((row) => row.state === "MAPPED" && row.canonicalProvider === "espn" && row.canonicalEventId),
    (row) => row.cfbdGameId);
  const teamMappings = newest(source.teamMappings.filter((row) => row.state === "MAPPED" && row.canonicalProvider === "espn" && row.canonicalTeamId),
    (row) => row.cfbdTeamId);
  return source.games.filter((game) => game.provider === "college_football_data" && game.kickoffAt)
    .map((game): HistoricalGameInput | null => {
      const event = gameMappings.get(game.providerEventId);
      const homeCfbd = game.homeProviderTeamId; const awayCfbd = game.awayProviderTeamId;
      const home = homeCfbd ? teamMappings.get(homeCfbd) : undefined;
      const away = awayCfbd ? teamMappings.get(awayCfbd) : undefined;
      if (!event || !home?.canonicalTeamId || !away?.canonicalTeamId || !game.kickoffAt) return null;
      const classes = classifications(game.payload);
      const relevantDomain = source.domainEvidence.filter((row) =>
        row.season === game.season && (row.cfbdGameId === game.providerEventId || row.cfbdTeamId === homeCfbd || row.cfbdTeamId === awayCfbd));
      const evidence: HistoricalEvidenceLineage[] = relevantDomain.map((row) => ({
        source: `cfbd:${row.endpoint}`, sourceId: String(row.id), pitClass: row.pitClassification as HistoricalEvidenceLineage["pitClass"],
        effectiveAt: row.providerEffectiveAt, capturedAt: row.capturedAt,
        canonicalTeamId: row.cfbdTeamId === homeCfbd ? home.canonicalTeamId : row.cfbdTeamId === awayCfbd ? away.canonicalTeamId : null,
        values: object(row.payload),
      }));
      return {
        canonicalProvider: event.canonicalProvider!, canonicalEventId: event.canonicalEventId!, season: game.season, week: game.week,
        kickoffAt: game.kickoffAt, homeCanonicalTeamId: home.canonicalTeamId, awayCanonicalTeamId: away.canonicalTeamId,
        homeClassification: classes.home, awayClassification: classes.away, homeScore: game.homeScore, awayScore: game.awayScore,
        completed: game.gameStatus?.trim().toLowerCase() === "final",
        neutralSite: game.neutralSite, evidence,
        qbEvidence: [...qbEvidence(relevantDomain, homeCfbd!, home.canonicalTeamId), ...qbEvidence(relevantDomain, awayCfbd!, away.canonicalTeamId)],
      };
    }).filter((game): game is HistoricalGameInput => game != null);
}

export const dbNcaafHistoricalMaterializerStore: NcaafHistoricalMaterializerStore = {
  async load(seasons) {
    const [games, teamMappings, gameMappings, domainEvidence] = await Promise.all([
      db.select().from(ncaafGameEvidenceTable).where(inArray(ncaafGameEvidenceTable.season, [...seasons])),
      db.select().from(ncaafCfbdTeamMappingsTable).where(inArray(ncaafCfbdTeamMappingsTable.season, [...seasons])),
      db.select().from(ncaafCfbdGameMappingsTable).where(inArray(ncaafCfbdGameMappingsTable.season, [...seasons])),
      db.select().from(ncaafCfbdDomainEvidenceTable).where(inArray(ncaafCfbdDomainEvidenceTable.season, [...seasons])),
    ]);
    return { games, teamMappings, gameMappings, domainEvidence };
  },
  async insert(row) {
    const inserted = await db.insert(ncaafHistoricalTrainingRowsTable).values(row).onConflictDoNothing()
      .returning({ id: ncaafHistoricalTrainingRowsTable.id });
    return inserted.length > 0;
  },
};

/** Independently callable and bounded; scheduler/capture code may call this but
 * this module intentionally does not schedule, train, publish, or forecast. */
export async function materializeNcaafHistoricalTrainingRows(
  input: { seasons?: readonly number[] } = {},
  store: NcaafHistoricalMaterializerStore = dbNcaafHistoricalMaterializerStore,
): Promise<NcaafHistoricalMaterializationResult> {
  const seasons = [...new Set(input.seasons ?? NCAAF_HISTORICAL_SEASONS)].sort((a, b) => a - b);
  if (!seasons.length || seasons.some((season) => !NCAAF_HISTORICAL_SEASONS.includes(season as 2023 | 2024 | 2025 | 2026))) {
    throw new Error("NCAAF historical materialization is limited to seasons 2023-2026");
  }
  const source = await store.load(seasons);
  const built = buildNcaafHistoricalTrainingDataset(historicalGamesFromCfbdEvidence(source));
  let inserted = 0;
  for (const row of built.rows) {
    const didInsert = await store.insert({
      artifactKey: NCAAF_HISTORICAL_ARTIFACT_KEY, ...row,
      kickoffAt: new Date(row.kickoffAt), pregameCutoffAt: new Date(row.pregameCutoffAt),
    });
    if (didInsert) inserted++;
  }
  const blockers = { ...built.report.excluded };
  if (built.rows.length === 0 && source.games.length > 0 && !blockers.no_eligible_pregame_lineage) {
    blockers.no_canonical_completed_fbs_games = source.games.length;
  }
  return { artifactKey: NCAAF_HISTORICAL_ARTIFACT_KEY, attempted: built.rows.length, inserted,
    alreadyMaterialized: built.rows.length - inserted, report: built.report, blockers };
}