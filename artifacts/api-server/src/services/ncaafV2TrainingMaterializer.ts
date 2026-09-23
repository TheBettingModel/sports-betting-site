import { inArray } from "drizzle-orm";
import {
  db, ncaafCfbdDomainEvidenceTable, ncaafGameEvidenceTable, ncaafHistoricalTrainingRowsTable,
} from "@workspace/db";
import {
  NCAAF_REPLAY_SEASONS, replayNcaafChronologically, type NcaafCompletedAtomicGame,
  type NcaafReplayLineage,
} from "./ncaafChronologicalReplay";

/** A separate artifact identity keeps this native-CFBD replay independent of
 * the legacy ESPN-canonical historical artifact. */
export const NCAAF_V2_TRAINING_ARTIFACT_KEY = "ncaaf-v4-training-foundation-v2";
export const NCAAF_V2_TRAINING_SCHEMA_VERSION = "ncaaf-chronological-team-game-v2";
export const NCAAF_V2_TRAINING_CURSOR_VERSION = "ncaaf-v4-training-foundation-v2-cursor-v1";
export const NCAAF_V2_TRAINING_MAX_BATCH_SIZE = 500;

type CfbdGame = typeof ncaafGameEvidenceTable.$inferSelect;
type DomainEvidence = typeof ncaafCfbdDomainEvidenceTable.$inferSelect;
type TrainingInsert = typeof ncaafHistoricalTrainingRowsTable.$inferInsert;

export interface NcaafV2TrainingMaterializerStore {
  load(seasons: readonly number[]): Promise<{ games: CfbdGame[]; domainEvidence: DomainEvidence[] }>;
  insert(row: TrainingInsert): Promise<boolean>;
}

export interface NcaafV2TrainingCursor {
  version: typeof NCAAF_V2_TRAINING_CURSOR_VERSION;
  /** Offset is into replay rows in their public chronological order. */
  offset: number;
}

export interface NcaafV2TrainingMaterializationResult {
  artifactKey: typeof NCAAF_V2_TRAINING_ARTIFACT_KEY;
  schemaVersion: typeof NCAAF_V2_TRAINING_SCHEMA_VERSION;
  cursor: NcaafV2TrainingCursor | null;
  nextCursor: NcaafV2TrainingCursor | null;
  attempted: number;
  inserted: number;
  alreadyMaterialized: number;
  totalEligible: number;
  audit: ReturnType<typeof replayNcaafChronologically>["audit"];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function exactFbsClassifications(payload: unknown) {
  const item = object(payload);
  const game = object(item.game ?? item);
  // Do not normalize provider values: CFBD's exact wire literal is lowercase.
  return { home: game.homeClassification === "fbs", away: game.awayClassification === "fbs" };
}

function lineageFor(game: CfbdGame, evidence: readonly DomainEvidence[]): NcaafReplayLineage[] {
  return evidence.filter((row) => row.season === game.season
    && (row.cfbdGameId === game.providerEventId || row.cfbdTeamId === game.homeProviderTeamId || row.cfbdTeamId === game.awayProviderTeamId))
    .map((row) => ({
      source: `cfbd:${row.endpoint}`,
      sourceId: String(row.id),
      pitClass: row.pitClassification as NcaafReplayLineage["pitClass"],
      effectiveAt: row.providerEffectiveAt!,
      capturedAt: row.capturedAt,
      values: object(row.payload),
    }));
}

/** Converts provider-native CFBD identities directly. No ESPN lookup, mapping,
 * or display-name reconciliation is performed by this boundary. */
export function ncaafCompletedAtomicGamesFromCfbdEvidence(source: {
  games: readonly CfbdGame[];
  domainEvidence: readonly DomainEvidence[];
}): NcaafCompletedAtomicGame[] {
  return source.games
    .filter((game) => game.provider === "college_football_data")
    .sort((a, b) => a.id - b.id)
    .map((game): NcaafCompletedAtomicGame | null => {
      const classes = exactFbsClassifications(game.payload);
      if (!game.kickoffAt || !game.homeProviderTeamId || !game.awayProviderTeamId
        || game.homeScore == null || game.awayScore == null
        || game.gameStatus?.trim().toLowerCase() !== "final" || !classes.home || !classes.away) return null;
      return {
        stableGameId: game.providerEventId,
        season: game.season,
        kickoffAt: game.kickoffAt,
        homeTeamId: game.homeProviderTeamId,
        awayTeamId: game.awayProviderTeamId,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        neutralSite: game.neutralSite === true,
        completed: true,
        homeClassification: "FBS",
        awayClassification: "FBS",
        pitLineage: lineageFor(game, source.domainEvidence),
      };
    }).filter((game): game is NcaafCompletedAtomicGame => game != null);
}

export const dbNcaafV2TrainingMaterializerStore: NcaafV2TrainingMaterializerStore = {
  async load(seasons) {
    const [games, domainEvidence] = await Promise.all([
      db.select().from(ncaafGameEvidenceTable).where(inArray(ncaafGameEvidenceTable.season, [...seasons])),
      db.select().from(ncaafCfbdDomainEvidenceTable).where(inArray(ncaafCfbdDomainEvidenceTable.season, [...seasons])),
    ]);
    return { games, domainEvidence };
  },
  async insert(row) {
    const inserted = await db.insert(ncaafHistoricalTrainingRowsTable).values(row).onConflictDoNothing()
      .returning({ id: ncaafHistoricalTrainingRowsTable.id });
    return inserted.length > 0;
  },
};

function validateSeasons(seasons: readonly number[]) {
  if (!seasons.length || seasons.some((season) => !NCAAF_REPLAY_SEASONS.includes(season as typeof NCAAF_REPLAY_SEASONS[number]))) {
    throw new Error("NCAAF v2 training materialization is limited to seasons 2023-2026");
  }
}

/** Bounded, resumable writer. Replay is intentionally rebuilt in full before
 * slicing a batch so a resumed batch retains exactly the same frozen features. */
export async function materializeNcaafV2TrainingRows(
  input: { seasons?: readonly number[]; batchSize?: number; cursor?: NcaafV2TrainingCursor | null } = {},
  store: NcaafV2TrainingMaterializerStore = dbNcaafV2TrainingMaterializerStore,
): Promise<NcaafV2TrainingMaterializationResult> {
  const seasons = [...new Set(input.seasons ?? NCAAF_REPLAY_SEASONS)].sort((a, b) => a - b);
  validateSeasons(seasons);
  const batchSize = input.batchSize ?? NCAAF_V2_TRAINING_MAX_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > NCAAF_V2_TRAINING_MAX_BATCH_SIZE) {
    throw new Error(`NCAAF v2 training batch size must be an integer from 1 to ${NCAAF_V2_TRAINING_MAX_BATCH_SIZE}`);
  }
  const offset = input.cursor?.offset ?? 0;
  if (input.cursor?.version !== undefined && input.cursor.version !== NCAAF_V2_TRAINING_CURSOR_VERSION) throw new Error("Unsupported NCAAF v2 training cursor version");
  const source = await store.load(seasons);
  const atomicGames = ncaafCompletedAtomicGamesFromCfbdEvidence(source);
  const replay = replayNcaafChronologically(atomicGames);
  const teamsByGameId = new Map<string, NcaafCompletedAtomicGame>();
  for (const game of atomicGames) if (!teamsByGameId.has(game.stableGameId)) teamsByGameId.set(game.stableGameId, game);
  if (!Number.isInteger(offset) || offset < 0 || offset > replay.rows.length) throw new Error("Invalid NCAAF v2 training cursor offset");
  const batch = replay.rows.slice(offset, offset + batchSize);
  let inserted = 0;
  for (const row of batch) {
    const didInsert = await store.insert({
      schemaVersion: NCAAF_V2_TRAINING_SCHEMA_VERSION,
      artifactKey: NCAAF_V2_TRAINING_ARTIFACT_KEY,
      canonicalProvider: "college_football_data",
      canonicalEventId: row.stableGameId,
      season: row.season,
      // The V2 artifact is append-only/checksum-bound.  Week recovery for V4
      // happens in its read-only loader; never mutate an existing projection.
      week: null,
      kickoffAt: new Date(row.kickoffAt),
      pregameCutoffAt: new Date(new Date(row.kickoffAt).getTime() - 1),
      homeCanonicalTeamId: teamsByGameId.get(row.stableGameId)!.homeTeamId,
      awayCanonicalTeamId: teamsByGameId.get(row.stableGameId)!.awayTeamId,
      features: row.features,
      targets: row.targets,
      pitLineage: row.features.pitLineage,
      quality: {
        fbsEligible: true,
        featureFreeze: "replayNcaafChronologically_before_targets",
        eligiblePitLineage: row.features.pitLineage.length,
        replayAuditChecksum: replay.audit.checksum,
        leakage: replay.audit.leakage,
      },
      checksum: row.checksum,
    });
    if (didInsert) inserted++;
  }
  const nextOffset = offset + batch.length;
  return {
    artifactKey: NCAAF_V2_TRAINING_ARTIFACT_KEY, schemaVersion: NCAAF_V2_TRAINING_SCHEMA_VERSION,
    cursor: batch.length ? { version: NCAAF_V2_TRAINING_CURSOR_VERSION, offset } : null,
    nextCursor: nextOffset === replay.rows.length ? null : { version: NCAAF_V2_TRAINING_CURSOR_VERSION, offset: nextOffset },
    attempted: batch.length, inserted, alreadyMaterialized: batch.length - inserted,
    totalEligible: replay.rows.length, audit: replay.audit,
  };
}