import { eq, sql } from "drizzle-orm";
import {
  db,
  mlbHistoricalGamesTable,
  mlbHistoricalSplitsTable,
} from "@workspace/db";
import {
  MLB_224C_SPLIT_VERSION,
  type DevelopmentGame,
} from "../src/services/mlbExpectedRuns224C";
import { loadCohortGames } from "./mlb-expected-runs-224c-data";
import {
  MLB_V4_FROZEN_V2_CONTRACT,
  MLB_V4_FROZEN_V2_DISPOSITIONS,
  MLB_V4_FROZEN_V2_DISPOSITION_HASH,
  MLB_V4_FROZEN_V2_FEATURE_ORDER,
  MLB_V4_FROZEN_V2_FEATURE_ORDER_HASH,
  MLB_V4_FROZEN_V2_HISTORICAL_ADAPTER_HASH,
  MLB_V4_FROZEN_V2_HISTORICAL_SCHEMA,
  MLB_V4_FROZEN_V2_LIVE_ADAPTER_HASH,
  MLB_V4_FROZEN_V2_LIVE_SCHEMA,
  MLB_V4_FROZEN_V2_TARGET_HASH,
  adaptHistoricalMlbV4V2,
  evaluateMlbV4V2TrainingGate,
  fitMlbV4V2Normalization,
  materializeMlbV4V2Dataset,
  type V2Cohort,
  type V2DatasetGame,
} from "../src/services/mlbV4FrozenV2Foundation239";

const splits = await db.select().from(mlbHistoricalSplitsTable)
  .where(eq(mlbHistoricalSplitsTable.splitVersion, MLB_224C_SPLIT_VERSION));
const ids = (cohort: "TRAIN" | "VALIDATION" | "LOCKED_OOS") =>
  splits.filter((row) => row.cohort === cohort)
    .map((row) => row.canonicalGameId)
    .sort();

const [train, validation, benchmark] = await Promise.all([
  loadCohortGames(db, "TRAIN", ids("TRAIN")),
  loadCohortGames(db, "VALIDATION", ids("VALIDATION")),
  loadCohortGames(db, "LOCKED_OOS", ids("LOCKED_OOS")),
]);

function datasetGame(game: DevelopmentGame, cohort: V2Cohort): V2DatasetGame {
  // The sealed chronology foundation defines featureCutoff as the actual first
  // recorded play minus 1 ms. That is the authoritative event-start boundary
  // for delayed games; scheduled time is not an evidence cutoff.
  const eventStartBoundary = new Date(Date.parse(game.forecastCutoff) + 1).toISOString();
  const vector = adaptHistoricalMlbV4V2({
    schemaVersion: MLB_V4_FROZEN_V2_HISTORICAL_SCHEMA,
    gameId: game.gameId,
    evidenceTier: "BASELINE_CORE",
    scheduledFirstPitch: eventStartBoundary,
    featureCutoff: game.forecastCutoff,
    predictionTime: game.forecastCutoff,
    sourceEvidenceTimes: [game.forecastCutoff],
    sourceEvidenceComplete: true,
    home: game.home,
    away: game.away,
  });
  return {
    vector,
    scheduledFirstPitch: eventStartBoundary,
    cohort,
    homeRuns: game.homeRuns,
    awayRuns: game.awayRuns,
    featureSnapshotHash: game.featureSnapshotHash,
  };
}

const benchmarkIds = new Set(benchmark.map((game) => game.gameId));
const dataset = materializeMlbV4V2Dataset([
  ...train.map((game) => datasetGame(game, "TRAIN")),
  ...validation.map((game) => datasetGame(game, "VALIDATION")),
  ...benchmark.map((game) => datasetGame(game, "HISTORICAL_BENCHMARK_ONLY")),
], benchmarkIds);
const normalization = fitMlbV4V2Normalization(dataset);

const quality = await db.execute(sql`
  SELECT
    (SELECT count(*) FROM mlb_historical_games
      WHERE schema_version='mlb-completion-chronology-v3') historical_games,
    (SELECT count(*) FROM mlb_v4_collection_runs) collection_runs,
    (SELECT count(*) FROM mlb_pregame_starter_evidence_snapshots) starter_snapshots,
    (SELECT count(*) FROM mlb_v4_starter_pit_states) starter_states,
    (SELECT count(*) FROM mlb_v4_team_pit_states WHERE state_kind='OFFENSE') offense_states,
    (SELECT count(*) FROM mlb_v4_team_pit_states WHERE state_kind='BULLPEN') bullpen_states,
    (SELECT count(*) FROM mlb_v4_pregame_feature_snapshots) feature_snapshots,
    (SELECT count(*) FROM mlb_v4_evidence_pairs) outcome_pairs,
    (SELECT count(*) FROM mlb_v4_pregame_feature_snapshots
      WHERE schema_version=${MLB_V4_FROZEN_V2_LIVE_SCHEMA}) prospective_v5_snapshots,
    (SELECT count(*) FROM mlb_v4_pregame_feature_snapshots
      WHERE schema_version=${MLB_V4_FROZEN_V2_LIVE_SCHEMA}
        AND pit_safe AND baseline_core_eligible) prospective_v5_model_ready,
    (SELECT count(*) FROM mlb_v4_pregame_feature_snapshots
      WHERE schema_version=${MLB_V4_FROZEN_V2_LIVE_SCHEMA}
        AND feature_cutoff >= scheduled_first_pitch) prospective_v5_pit_violations
`);
const counts = (quality.rows[0] ?? {}) as Record<string, unknown>;
const number = (key: string) => Number(counts[key] ?? 0);
const prospectiveCandidateSnapshots = number("prospective_v5_model_ready");
// Candidate rows are not promoted to parity vectors until the audit independently
// resolves every component ID/hash to its source timestamp and replays the live
// adapter. Storage eligibility alone is deliberately insufficient.
const prospectiveParityVectors = 0;
const trainingGate = evaluateMlbV4V2TrainingGate(
  dataset,
  normalization,
  { prospectiveParityVectors },
);

const chronology = await db.select({
  gameId: mlbHistoricalGamesTable.canonicalGameId,
  scheduledFirstPitch: mlbHistoricalGamesTable.scheduledFirstPitch,
}).from(mlbHistoricalGamesTable)
  .where(eq(mlbHistoricalGamesTable.schemaVersion, "mlb-completion-chronology-v3"));

console.log(JSON.stringify({
  task: 239,
  mode: "DEVELOPMENT_READ_ONLY",
  contract: {
    id: MLB_V4_FROZEN_V2_CONTRACT.contractId,
    version: MLB_V4_FROZEN_V2_CONTRACT.contractVersion,
    liveSchema: MLB_V4_FROZEN_V2_LIVE_SCHEMA,
    featureCount: MLB_V4_FROZEN_V2_FEATURE_ORDER.length,
    featureOrder: MLB_V4_FROZEN_V2_FEATURE_ORDER,
    contractHash: MLB_V4_FROZEN_V2_CONTRACT.contractHash,
    featureOrderHash: MLB_V4_FROZEN_V2_FEATURE_ORDER_HASH,
    dispositionHash: MLB_V4_FROZEN_V2_DISPOSITION_HASH,
    historicalAdapterHash: MLB_V4_FROZEN_V2_HISTORICAL_ADAPTER_HASH,
    liveAdapterHash: MLB_V4_FROZEN_V2_LIVE_ADAPTER_HASH,
    targetHash: MLB_V4_FROZEN_V2_TARGET_HASH,
    dispositionCounts: Object.fromEntries(
      [...new Set(MLB_V4_FROZEN_V2_DISPOSITIONS.map((row) => row.disposition))]
        .map((disposition) => [
          disposition,
          MLB_V4_FROZEN_V2_DISPOSITIONS.filter((row) => row.disposition === disposition).length,
        ]),
    ),
  },
  historicalMaterialization: {
    datasetHash: dataset.datasetHash,
    cohortCounts: dataset.cohortCounts,
    cohortHashes: dataset.cohortHashes,
    benchmarkIdsHash: dataset.consumedBenchmarkIdsHash,
    normalizationHash: normalization.transformHash,
    normalizationArtifactHash: normalization.artifactHash,
    totalModelReady: dataset.games.length,
    totalFoundationGames: number("historical_games"),
    ineligible: number("historical_games") - dataset.games.length,
    chronologyRows: chronology.length,
  },
  prospectiveMaterialization: {
    schema: MLB_V4_FROZEN_V2_LIVE_SCHEMA,
    snapshots: number("prospective_v5_snapshots"),
    storageEligibleCandidates: prospectiveCandidateSnapshots,
    adapterVerifiedModelReady: prospectiveParityVectors,
    adapterVerificationReason: "COMPONENT_SOURCE_TIMESTAMP_REPLAY_NOT_IMPLEMENTED",
    pitViolations: number("prospective_v5_pit_violations"),
  },
  dataQuality: {
    collectionRuns: number("collection_runs"),
    starterSnapshots: number("starter_snapshots"),
    starterStates: number("starter_states"),
    offenseStates: number("offense_states"),
    bullpenStates: number("bullpen_states"),
    featureSnapshots: number("feature_snapshots"),
    outcomePairs: number("outcome_pairs"),
  },
  trainingGate,
  modelTrained: false,
  historicalBenchmarkUsedForSelection: false,
  productionRead: false,
  productionWrite: false,
}, null, 2));