import { and, eq, inArray } from "drizzle-orm";
import {
  db as database,
  mlbHistoricalOutcomesTable,
  mlbHistoricalPitchingEligibilityTable,
  mlbHistoricalPregameBullpenSnapshotsTable,
  mlbHistoricalTeamGameRowsTable,
} from "@workspace/db";
import {
  buildDirectedSideFeatures,
  MLB_224C_FOUNDATION_ARTIFACT,
  type DevelopmentGame,
  type OffenseFeatureRecord,
} from "../src/services/mlbExpectedRuns224C";
import { stableLocalHash } from "../src/services/mlbV4ExpectedRuns";
import {
  MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY,
  MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
} from "../src/services/mlbHistoricalChronology";
import { MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION } from "../src/services/mlbHistoricalPitchingArtifact";

type Db = typeof database;

/** This is deliberately called separately for development and OOS. */
export async function loadCohortGames(
  db: Db,
  cohort: DevelopmentGame["cohort"],
  ids: readonly string[],
): Promise<DevelopmentGame[]> {
  if (!ids.length) throw new Error(`Empty ${cohort} cohort`);
  const [offense, bullpens, eligibility, outcomes] = await Promise.all([
    db.select().from(mlbHistoricalTeamGameRowsTable)
      .where(and(
        eq(mlbHistoricalTeamGameRowsTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION),
        eq(mlbHistoricalTeamGameRowsTable.artifactKey, MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY),
        inArray(mlbHistoricalTeamGameRowsTable.canonicalGameId, [...ids]),
      )),
    db.select().from(mlbHistoricalPregameBullpenSnapshotsTable)
      .where(and(
        eq(mlbHistoricalPregameBullpenSnapshotsTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION),
        eq(mlbHistoricalPregameBullpenSnapshotsTable.artifactKey, MLB_224C_FOUNDATION_ARTIFACT),
        inArray(mlbHistoricalPregameBullpenSnapshotsTable.canonicalGameId, [...ids]),
      )),
    db.select().from(mlbHistoricalPitchingEligibilityTable)
      .where(and(
        eq(mlbHistoricalPitchingEligibilityTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION),
        eq(mlbHistoricalPitchingEligibilityTable.artifactKey, MLB_224C_FOUNDATION_ARTIFACT),
        inArray(mlbHistoricalPitchingEligibilityTable.canonicalGameId, [...ids]),
      )),
    db.select().from(mlbHistoricalOutcomesTable)
      .where(and(
        eq(mlbHistoricalOutcomesTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION),
        eq(mlbHistoricalOutcomesTable.artifactKey, MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY),
        inArray(mlbHistoricalOutcomesTable.canonicalGameId, [...ids]),
      )),
  ]);
  const offenseByKey = new Map(offense.map((row) => [`${row.canonicalGameId}:${row.teamSide}`, row]));
  const bullpenByKey = new Map(bullpens.map((row) => [`${row.canonicalGameId}:${row.canonicalTeamId}`, row]));
  const offenseCount = new Map<string, number>();
  const bullpenCount = new Map<string, number>();
  offense.forEach((row) => offenseCount.set(row.canonicalGameId, (offenseCount.get(row.canonicalGameId) ?? 0) + 1));
  bullpens.forEach((row) => bullpenCount.set(row.canonicalGameId, (bullpenCount.get(row.canonicalGameId) ?? 0) + 1));
  const eligibilityByGame = new Map(eligibility.map((row) => [row.canonicalGameId, row]));
  const outcomesByGame = new Map(outcomes.map((row) => [row.canonicalGameId, row]));
  const games = ids.map((gameId) => {
    const home = offenseByKey.get(`${gameId}:home`);
    const away = offenseByKey.get(`${gameId}:away`);
    const eligible = eligibilityByGame.get(gameId);
    const outcome = outcomesByGame.get(gameId);
    if (!home || !away || !outcome || !eligible) throw new Error(`${cohort} missing canonical rows: ${gameId}`);
    if (!eligible.coreOffenseEligible || !eligible.bullpenCoreEligible || eligible.quarantined) {
      throw new Error(`${cohort} member is not offense-plus-bullpen eligible: ${gameId}`);
    }
    if (!home.featureCutoff || !away.featureCutoff
      || home.featureCutoff.getTime() !== eligible.featureCutoff.getTime()
      || away.featureCutoff.getTime() !== eligible.featureCutoff.getTime()) {
      throw new Error(`${cohort} sealed feature-cutoff binding mismatch: ${gameId}`);
    }
    const homeOpponentBullpen = bullpenByKey.get(`${gameId}:${home.opponentCanonicalTeamId}`);
    const awayOpponentBullpen = bullpenByKey.get(`${gameId}:${away.opponentCanonicalTeamId}`);
    if (!homeOpponentBullpen || !awayOpponentBullpen) throw new Error(`${cohort} missing opponent bullpen: ${gameId}`);
    if (offenseCount.get(gameId) !== 2 || bullpenCount.get(gameId) !== 2) {
      throw new Error(`${cohort} requires exactly two offense and two bullpen rows: ${gameId}`);
    }
    if (outcome.settlementStatus !== "FINAL_PROVIDER_OUTCOME" || outcome.homeRuns + outcome.awayRuns !== outcome.gameTotal
      || outcome.homeRuns - outcome.awayRuns !== outcome.runDifference
      || outcome.homeRuns === outcome.awayRuns
      || outcome.winnerSide !== (outcome.homeRuns > outcome.awayRuns ? "HOME" : "AWAY")) {
      throw new Error(`${cohort} canonical outcome mismatch: ${gameId}`);
    }
    const homeFeatures = buildDirectedSideFeatures(
      { ...home, teamSide: "home" } as OffenseFeatureRecord, homeOpponentBullpen);
    const awayFeatures = buildDirectedSideFeatures(
      { ...away, teamSide: "away" } as OffenseFeatureRecord, awayOpponentBullpen);
    return {
      gameId, cohort, season: outcome.season,
      date: home.scheduledFirstPitch.toISOString(),
      home: homeFeatures, away: awayFeatures,
      homeRuns: outcome.homeRuns, awayRuns: outcome.awayRuns,
      forecastCutoff: home.featureCutoff!.toISOString(),
      featureSnapshotHash: stableLocalHash({
        homeOffense: home.checksum, awayOffense: away.checksum,
        homeOpponentBullpen: homeOpponentBullpen.checksum,
        awayOpponentBullpen: awayOpponentBullpen.checksum,
      }),
    };
  });
  if (games.length !== ids.length || new Set(games.map((g) => g.gameId)).size !== ids.length) {
    throw new Error(`${cohort} cardinality failure`);
  }
  return games.sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId));
}