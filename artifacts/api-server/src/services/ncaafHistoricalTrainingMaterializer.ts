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
import { materializeCfbdMappingsForSeasons } from "./ncaafCfbdMappingMaterializer";

/** V5 is a corpus revision over the unchanged V2 row schema. Prior artifacts
 * remain immutable; this version follows complete-date ledgers and latest-state mappings. */
export const NCAAF_HISTORICAL_ARTIFACT_KEY = "ncaaf-historical-2023-2026-pit-v5";
type CfbdGame = typeof ncaafGameEvidenceTable.$inferSelect;
type TeamMapping = typeof ncaafCfbdTeamMappingsTable.$inferSelect;
type GameMapping = typeof ncaafCfbdGameMappingsTable.$inferSelect;
type DomainEvidence = typeof ncaafCfbdDomainEvidenceTable.$inferSelect;

export interface NcaafHistoricalMaterializerStore {
  load(seasons: readonly number[]): Promise<{
    games: CfbdGame[]; teamMappings: TeamMapping[]; gameMappings: GameMapping[]; domainEvidence: DomainEvidence[];
  }>;
  insert(row: typeof ncaafHistoricalTrainingRowsTable.$inferInsert): Promise<boolean>;
  insertMany?(rows: readonly (typeof ncaafHistoricalTrainingRowsTable.$inferInsert)[]): Promise<number>;
  reconcileMappings?(seasons: readonly number[]): Promise<{ teams: number; games: number }>;
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
  const game = object(item.game);
  return {
    home: text(item.homeClassification) ?? text(game.homeClassification),
    away: text(item.awayClassification) ?? text(game.awayClassification),
  };
}
function completionAvailableAt(payload: unknown): Date | null {
  const item = object(payload);
  for (const key of ["completedAt", "finalizedAt"]) {
    const value = item[key];
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (Number.isFinite(parsed.getTime())) return parsed;
    }
  }
  return null;
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
  const gameMappings = newest(source.gameMappings, (row) => `${row.season}:${row.cfbdGameId}`);
  const teamMappings = newest(source.teamMappings, (row) => `${row.season}:${row.cfbdTeamId}`);
  const currentCfbdGames = newest(
    source.games.filter((game) => game.provider === "college_football_data" && game.kickoffAt),
    (game) => `${game.season}:${game.providerEventId}`,
  );
  const evidenceByGame = new Map<string, DomainEvidence[]>();
  const evidenceByTeam = new Map<string, DomainEvidence[]>();
  for (const row of source.domainEvidence) {
    if (row.cfbdGameId) {
      const key = `${row.season}:${row.cfbdGameId}`;
      evidenceByGame.set(key, [...(evidenceByGame.get(key) ?? []), row]);
    }
    if (row.cfbdTeamId) {
      const key = `${row.season}:${row.cfbdTeamId}`;
      evidenceByTeam.set(key, [...(evidenceByTeam.get(key) ?? []), row]);
    }
  }
  return [...currentCfbdGames.values()]
    .map((game): HistoricalGameInput | null => {
      const event = gameMappings.get(`${game.season}:${game.providerEventId}`);
      const homeCfbd = game.homeProviderTeamId; const awayCfbd = game.awayProviderTeamId;
      const home = homeCfbd ? teamMappings.get(`${game.season}:${homeCfbd}`) : undefined;
      const away = awayCfbd ? teamMappings.get(`${game.season}:${awayCfbd}`) : undefined;
      if (event?.state !== "MAPPED" || event.canonicalProvider !== "espn" || !event.canonicalEventId
        || home?.state !== "MAPPED" || home.canonicalProvider !== "espn" || !home.canonicalTeamId
        || away?.state !== "MAPPED" || away.canonicalProvider !== "espn" || !away.canonicalTeamId
        || !game.kickoffAt) return null;
      const classes = classifications(game.payload);
      const relevantDomain = [...new Map([
        ...(evidenceByGame.get(`${game.season}:${game.providerEventId}`) ?? []),
        ...(homeCfbd ? evidenceByTeam.get(`${game.season}:${homeCfbd}`) ?? [] : []),
        ...(awayCfbd ? evidenceByTeam.get(`${game.season}:${awayCfbd}`) ?? [] : []),
      ].map((row) => [row.id, row])).values()];
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
        completionAvailableAt: completionAvailableAt(game.payload),
        neutralSite: game.neutralSite, evidence,
        qbEvidence: [...qbEvidence(relevantDomain, homeCfbd!, home.canonicalTeamId), ...qbEvidence(relevantDomain, awayCfbd!, away.canonicalTeamId)],
      };
    }).filter((game): game is HistoricalGameInput => game != null);
}

export const dbNcaafHistoricalMaterializerStore: NcaafHistoricalMaterializerStore = {
  reconcileMappings: (seasons) => materializeCfbdMappingsForSeasons(seasons),
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
  async insertMany(rows) {
    let inserted = 0;
    for (let offset = 0; offset < rows.length; offset += 500) {
      const result = await db.insert(ncaafHistoricalTrainingRowsTable)
        .values([...rows.slice(offset, offset + 500)])
        .onConflictDoNothing()
        .returning({ id: ncaafHistoricalTrainingRowsTable.id });
      inserted += result.length;
    }
    return inserted;
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
  if (store.reconcileMappings) await store.reconcileMappings(seasons);
  const source = await store.load(seasons);
  const built = buildNcaafHistoricalTrainingDataset(historicalGamesFromCfbdEvidence(source));
  const inserts = built.rows.map((row) => ({
      artifactKey: NCAAF_HISTORICAL_ARTIFACT_KEY, ...row,
      kickoffAt: new Date(row.kickoffAt), pregameCutoffAt: new Date(row.pregameCutoffAt),
    }));
  let inserted = 0;
  if (store.insertMany) {
    inserted = await store.insertMany(inserts);
  } else {
    for (const row of inserts) {
      if (await store.insert(row)) inserted++;
    }
  }
  const blockers = { ...built.report.excluded };
  if (built.rows.length === 0 && source.games.length > 0 && !blockers.no_eligible_pregame_lineage) {
    blockers.no_canonical_completed_fbs_games = source.games.length;
  }
  return { artifactKey: NCAAF_HISTORICAL_ARTIFACT_KEY, attempted: built.rows.length, inserted,
    alreadyMaterialized: built.rows.length - inserted, report: built.report, blockers };
}