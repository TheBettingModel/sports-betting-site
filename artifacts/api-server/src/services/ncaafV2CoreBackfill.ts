import { createCollegeFootballDataClient } from "./collegeFootballData";
import { appendCfbdHistoricalEvidence } from "./ncaafCfbdHistoricalEvidence";
import {
  NCAAF_V2_TRAINING_MAX_BATCH_SIZE,
  NCAAF_V2_TRAINING_CURSOR_VERSION,
  materializeNcaafV2TrainingRows,
  type NcaafV2TrainingCursor,
  type NcaafV2TrainingMaterializationResult,
} from "./ncaafV2TrainingMaterializer";

/** This is deliberately an operator-invoked, retrospective-only operation. */
export const NCAAF_V2_CORE_BACKFILL_SEASONS = [2023, 2024, 2025] as const;
/** Bound one HTTP invocation even when a season has unexpectedly many games. */
export const NCAAF_V2_CORE_BACKFILL_MAX_MATERIALIZATION_BATCHES = 10;

type CoreBackfillClient = Pick<ReturnType<typeof createCollegeFootballDataClient>, "request">;
type CoreBackfillAppend = typeof appendCfbdHistoricalEvidence;
type CoreBackfillMaterialize = typeof materializeNcaafV2TrainingRows;

export interface NcaafV2CoreBackfillDependencies {
  client?: CoreBackfillClient;
  append?: CoreBackfillAppend;
  materialize?: CoreBackfillMaterialize;
}

export function parseNcaafV2CoreBackfillCursor(value: unknown): NcaafV2TrainingCursor | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("cursor must be an object or null");
  const cursor = value as Record<string, unknown>;
  if (cursor.version !== NCAAF_V2_TRAINING_CURSOR_VERSION
    || !Number.isInteger(cursor.offset) || (cursor.offset as number) < 0) {
    throw new Error("cursor must be a supported NCAAF v2 training cursor");
  }
  return { version: NCAAF_V2_TRAINING_CURSOR_VERSION, offset: cursor.offset as number };
}

/**
 * Fetches exactly one CFBD games aggregate per target season, in chronological
 * season order, then drains bounded materializer batches. It neither schedules
 * work nor touches the live NCAAF execution lock.
 */
export async function runNcaafV2CoreBackfill(input: {
  cursor?: NcaafV2TrainingCursor | null;
  dryRun?: boolean;
} = {}, dependencies: NcaafV2CoreBackfillDependencies = {}) {
  const cursor = input.cursor ?? null;
  if (input.dryRun) {
    return {
      manualOnly: true,
      dryRun: true,
      seasons: [...NCAAF_V2_CORE_BACKFILL_SEASONS],
      cfbd: { requested: NCAAF_V2_CORE_BACKFILL_SEASONS.length, rawInserted: 0, gamesInserted: 0, malformed: 0 },
      materialization: { invocations: 0, attempted: 0, inserted: 0, alreadyMaterialized: 0, totalEligible: null, nextCursor: cursor, audit: null },
    };
  }

  const client = dependencies.client ?? createCollegeFootballDataClient();
  const append = dependencies.append ?? appendCfbdHistoricalEvidence;
  const materialize = dependencies.materialize ?? materializeNcaafV2TrainingRows;
  let rawInserted = 0, gamesInserted = 0, malformed = 0;
  for (const season of NCAAF_V2_CORE_BACKFILL_SEASONS) {
    const response = await client.request("games", { year: season });
    const result = await append({ season, response });
    rawInserted += result.rawInserted;
    gamesInserted += result.gamesInserted;
    malformed += result.malformed.length;
  }

  let nextCursor: NcaafV2TrainingCursor | null = cursor;
  let invocations = 0, attempted = 0, inserted = 0, alreadyMaterialized = 0;
  let last: NcaafV2TrainingMaterializationResult | null = null;
  do {
    last = await materialize({
      seasons: NCAAF_V2_CORE_BACKFILL_SEASONS,
      batchSize: NCAAF_V2_TRAINING_MAX_BATCH_SIZE,
      cursor: nextCursor,
    });
    invocations++;
    attempted += last.attempted;
    inserted += last.inserted;
    alreadyMaterialized += last.alreadyMaterialized;
    nextCursor = last.nextCursor;
  } while (nextCursor && invocations < NCAAF_V2_CORE_BACKFILL_MAX_MATERIALIZATION_BATCHES);

  return {
    manualOnly: true,
    dryRun: false,
    seasons: [...NCAAF_V2_CORE_BACKFILL_SEASONS],
    cfbd: { requested: NCAAF_V2_CORE_BACKFILL_SEASONS.length, rawInserted, gamesInserted, malformed },
    materialization: {
      invocations, attempted, inserted, alreadyMaterialized,
      totalEligible: last?.totalEligible ?? 0,
      nextCursor,
      audit: last?.audit ?? null,
    },
  };
}