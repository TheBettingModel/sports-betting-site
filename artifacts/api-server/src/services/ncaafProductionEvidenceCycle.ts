/**
 * Production-only NCAAF evidence collection.  This is deliberately separate
 * from odds ingestion: it must remain able to make its pregame snapshots while
 * another sport owns the scheduler's shared heavy-job lock.
 */
import { and, eq, gt } from "drizzle-orm";
import { db, ncaafGameEvidenceTable, ncaafTeamGamePerformanceTable } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  captureCurrentNcaafEvidence,
  captureNcaafEvidenceDate,
  ncaafSeasonForDate,
  reconcileStaleNcaafEvidenceRuns,
  type EvidenceCaptureResult,
} from "./ncaafEvidenceLedger";
import { createNcaafFeatureSnapshot } from "./ncaafFeatures";
import { createNcaafFootballIntelligenceSnapshot } from "./ncaafFootballIntelligenceSnapshots";
import {
  assignNcaafFinalPregameCohort,
  assignNcaafLiveShadowCohort,
  dbNcaafPregameCohortStore,
  NCAAF_CURRENT_COLLECTION_VERSION,
  NCAAF_LIVE_SHADOW_ACTIVATION,
  type NcaafPregameCohortStore,
} from "./ncaafPregameCohorts";
import { captureCollegeFootballDataEvidence, type CfbdCaptureResult } from "./ncaafCollegeFootballDataEvidence";

export const NCAAF_FINAL_PREGAME_WINDOW_MINUTES = 45;
export const MAX_NCAAF_BOOTSTRAP_DAYS = 14;

export interface NcaafProductionEvidenceGame {
  id: number;
  provider: string;
  eventId: string;
  season: number;
  week: number | null;
  kickoffAt: Date;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  neutralSite: boolean | null;
  venue: Record<string, unknown>;
  capturedAt: Date;
  modeledAsOf: Date;
}

export interface NcaafProductionEvidenceCycleResult {
  skipped: boolean;
  staleRunsReconciled: number;
  capture: EvidenceCaptureResult | null;
  captureCause: string | null;
  cfbdCapture: CfbdCaptureResult | null;
  cfbdCaptureCause: string | null;
  gamesFound: number;
  featureSnapshots: number;
  intelligenceSnapshots: number;
  liveShadowAssignments: number;
  finalPregameAssignments: number;
  gameFailures: Array<{ provider: string; eventId: string; cause: string }>;
}

type CycleLogger = Pick<typeof logger, "info" | "warn" | "error">;
export interface NcaafProductionEvidenceCycleDependencies {
  now?: () => Date;
  reconcile?: (now: Date) => Promise<number>;
  captureCurrent?: () => Promise<EvidenceCaptureResult>;
  /** Optional server-side CFBD evidence hook. Its failure is intentionally isolated. */
  captureCfbd?: () => Promise<CfbdCaptureResult>;
  listUpcomingGames?: (now: Date) => Promise<NcaafProductionEvidenceGame[]>;
  createFeatureSnapshot?: typeof createNcaafFeatureSnapshot;
  createIntelligenceSnapshot?: typeof createNcaafFootballIntelligenceSnapshot;
  cohortStore?: NcaafPregameCohortStore;
  assignLiveShadow?: typeof assignNcaafLiveShadowCohort;
  assignFinalPregame?: typeof assignNcaafFinalPregameCohort;
  finalPregameWindowMinutes?: number;
  log?: CycleLogger;
}

async function listCanonicalUpcomingGames(now: Date): Promise<NcaafProductionEvidenceGame[]> {
  const rows = await db.select({
    id: ncaafGameEvidenceTable.id, provider: ncaafGameEvidenceTable.provider,
    eventId: ncaafGameEvidenceTable.providerEventId, season: ncaafGameEvidenceTable.season,
    week: ncaafGameEvidenceTable.week, kickoffAt: ncaafGameEvidenceTable.kickoffAt,
    homeTeamId: ncaafGameEvidenceTable.homeProviderTeamId, awayTeamId: ncaafGameEvidenceTable.awayProviderTeamId,
    homeTeamName: ncaafGameEvidenceTable.homeTeamName, awayTeamName: ncaafGameEvidenceTable.awayTeamName,
    neutralSite: ncaafGameEvidenceTable.neutralSite, venueId: ncaafGameEvidenceTable.venueId,
    venueName: ncaafGameEvidenceTable.venueName, venueCity: ncaafGameEvidenceTable.venueCity,
    venueState: ncaafGameEvidenceTable.venueState, venueCountry: ncaafGameEvidenceTable.venueCountry,
    venueIndoor: ncaafGameEvidenceTable.venueIndoor, capturedAt: ncaafGameEvidenceTable.capturedAt,
    modeledAsOf: ncaafGameEvidenceTable.modeledAsOf,
  }).from(ncaafGameEvidenceTable).where(and(
    eq(ncaafGameEvidenceTable.provider, "espn"),
    gt(ncaafGameEvidenceTable.kickoffAt, now),
  ));
  const latest = new Map<string, NcaafProductionEvidenceGame>();
  for (const row of rows) {
    if (!row.kickoffAt || row.kickoffAt <= now || !row.homeTeamName || !row.awayTeamName) continue;
    const candidate: NcaafProductionEvidenceGame = {
      id: row.id, provider: row.provider, eventId: row.eventId, season: row.season,
      week: row.week, kickoffAt: row.kickoffAt, homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId,
      homeTeamName: row.homeTeamName, awayTeamName: row.awayTeamName, neutralSite: row.neutralSite,
      venue: { id: row.venueId, name: row.venueName, city: row.venueCity, state: row.venueState,
        country: row.venueCountry, indoor: row.venueIndoor, neutralSite: row.neutralSite },
      capturedAt: row.capturedAt, modeledAsOf: row.modeledAsOf,
    };
    const key = `${candidate.provider}:${candidate.eventId}`;
    const prior = latest.get(key);
    if (!prior || candidate.capturedAt > prior.capturedAt
      || (candidate.capturedAt.getTime() === prior.capturedAt.getTime() && candidate.id > prior.id)) latest.set(key, candidate);
  }
  return [...latest.values()];
}

/** Creates an independently single-flight cycle runner (also useful for tests). */
export function createNcaafProductionEvidenceCycle(dependencies: NcaafProductionEvidenceCycleDependencies = {}) {
  let running = false;
  return async function run(): Promise<NcaafProductionEvidenceCycleResult> {
    const empty = (): NcaafProductionEvidenceCycleResult => ({
      skipped: false, staleRunsReconciled: 0, capture: null, captureCause: null,
      cfbdCapture: null, cfbdCaptureCause: null, gamesFound: 0,
      featureSnapshots: 0, intelligenceSnapshots: 0, liveShadowAssignments: 0,
      finalPregameAssignments: 0, gameFailures: [],
    });
    if (running) {
      const result = empty();
      result.skipped = true;
      result.captureCause = "duplicate_invocation";
      dependencies.log?.info(result, "NCAAF production evidence cycle skipped duplicate invocation");
      return result;
    }
    running = true;
    const result = empty();
    const cycleStartedAt = dependencies.now?.() ?? new Date();
    const log = dependencies.log ?? logger;
    try {
      result.staleRunsReconciled = await (dependencies.reconcile ?? ((at) => reconcileStaleNcaafEvidenceRuns(db, at)))(cycleStartedAt);
      try {
        // Exactly one bounded current-season/week CFBD capture per dedicated cycle.
        result.cfbdCapture = await (dependencies.captureCfbd ?? captureCollegeFootballDataEvidence)();
      } catch (error) {
        result.cfbdCaptureCause = error instanceof Error ? error.message : String(error);
        log.warn({ cause: result.cfbdCaptureCause }, "NCAAF CFBD evidence capture failed; continuing with ESPN evidence");
      }
      try {
        result.capture = await (dependencies.captureCurrent ?? captureCurrentNcaafEvidence)();
        if (Object.keys(result.capture.providerErrors).length) result.captureCause = "provider_partial_failure";
      } catch (error) {
        result.captureCause = error instanceof Error ? error.message : String(error);
        log.warn({ cause: result.captureCause }, "NCAAF current evidence capture failed; using existing evidence");
      }
      const snapshotAt = dependencies.now?.() ?? new Date();
      const games = await (dependencies.listUpcomingGames ?? listCanonicalUpcomingGames)(snapshotAt);
      result.gamesFound = games.length;
      const createFeature = dependencies.createFeatureSnapshot ?? createNcaafFeatureSnapshot;
      const createIntelligence = dependencies.createIntelligenceSnapshot ?? createNcaafFootballIntelligenceSnapshot;
      const store = dependencies.cohortStore ?? dbNcaafPregameCohortStore;
      const assignLive = dependencies.assignLiveShadow ?? assignNcaafLiveShadowCohort;
      const assignFinal = dependencies.assignFinalPregame ?? assignNcaafFinalPregameCohort;
      const windowMinutes = dependencies.finalPregameWindowMinutes ?? NCAAF_FINAL_PREGAME_WINDOW_MINUTES;
      for (const game of games) {
        try {
          // Recheck, because a provider row may have been read just before kickoff.
          if (game.kickoffAt <= snapshotAt) continue;
          const feature = await createFeature({
            provider: game.provider, eventId: game.eventId, season: game.season, kickoffAt: game.kickoffAt,
            homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId,
            homeTeamName: game.homeTeamName, awayTeamName: game.awayTeamName, neutralSite: game.neutralSite,
          }, snapshotAt);
          result.featureSnapshots++;
          const intelligence = await createIntelligence({
            provider: game.provider, eventId: game.eventId, season: game.season, week: game.week,
            kickoffAt: game.kickoffAt, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, venue: game.venue,
          }, snapshotAt);
          result.intelligenceSnapshots++;
          const input = {
            featureSnapshotId: feature.id, footballIntelligenceSnapshotId: intelligence.id,
            provider: game.provider, eventId: game.eventId, season: game.season, week: game.week,
            kickoffAt: game.kickoffAt, cutoffAt: snapshotAt, assignmentAt: snapshotAt,
            collectionVersion: NCAAF_CURRENT_COLLECTION_VERSION,
            provenance: { source: "ncaaf-production-evidence-cycle", sportsEvidenceOnly: true },
          };
          if (snapshotAt >= NCAAF_LIVE_SHADOW_ACTIVATION.activatedAt
            && !await store.getAssignment("LIVE_SHADOW", game.provider, game.eventId)) {
            await assignLive(store, input);
            result.liveShadowAssignments++;
          }
          const minutesToKickoff = (game.kickoffAt.getTime() - snapshotAt.getTime()) / 60_000;
          if (minutesToKickoff >= 0 && minutesToKickoff <= windowMinutes
            && !await store.getAssignment("FINAL_PREGAME", game.provider, game.eventId)) {
            await assignFinal(store, input);
            result.finalPregameAssignments++;
          }
        } catch (error) {
          result.gameFailures.push({ provider: game.provider, eventId: game.eventId,
            cause: error instanceof Error ? error.message : String(error) });
          log.warn({ eventId: game.eventId, error }, "NCAAF production evidence game failed");
        }
      }
      log.info(result, "NCAAF production evidence cycle completed");
      return result;
    } finally {
      running = false;
    }
  };
}

export const runNcaafProductionEvidenceCycle = createNcaafProductionEvidenceCycle();

/**
 * Explicit and bounded retrospective performance capture. It creates evidence
 * only; it never invokes snapshot/cohort creation and is intentionally not
 * scheduled as a season-wide backfill.
 */
export async function bootstrapNcaafCurrentSeasonPerformanceEvidence(
  from: Date, to: Date, capture: (date: Date) => Promise<unknown> = captureNcaafEvidenceDate,
): Promise<{ capturedDates: number }> {
  const days = Math.floor((Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
    - Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) / 86_400_000) + 1;
  if (days < 1 || days > MAX_NCAAF_BOOTSTRAP_DAYS) throw new Error(`NCAAF bootstrap must be 1-${MAX_NCAAF_BOOTSTRAP_DAYS} days`);
  if (ncaafSeasonForDate(from) !== ncaafSeasonForDate(to)) throw new Error("NCAAF bootstrap must remain in one season");
  const today = new Date();
  for (let offset = 0; offset < days; offset++) {
    const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + offset));
    if (date >= new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))) {
      throw new Error("NCAAF bootstrap accepts completed dates only");
    }
    await capture(date);
  }
  return { capturedDates: days };
}

/**
 * Bounded startup repair for completed current-season dates already known to
 * the evidence ledger but still missing immutable team-performance rows.
 * Historical cohorts are never created by this function.
 */
export async function bootstrapMissingNcaafPerformanceEvidence(
  now = new Date(),
  capture: (date: Date) => Promise<unknown> = captureNcaafEvidenceDate,
): Promise<{ attemptedDates: number; capturedDates: number; failures: Array<{ date: string; cause: string }> }> {
  const season = ncaafSeasonForDate(now);
  const [completedGames, performanceRows] = await Promise.all([
    db.select({
      providerEventId: ncaafGameEvidenceTable.providerEventId,
      kickoffAt: ncaafGameEvidenceTable.kickoffAt,
    }).from(ncaafGameEvidenceTable).where(and(
      eq(ncaafGameEvidenceTable.provider, "espn"),
      eq(ncaafGameEvidenceTable.season, season),
      eq(ncaafGameEvidenceTable.gameStatus, "final"),
    )),
    db.select({ providerEventId: ncaafTeamGamePerformanceTable.providerEventId })
      .from(ncaafTeamGamePerformanceTable).where(and(
        eq(ncaafTeamGamePerformanceTable.provider, "espn"),
        eq(ncaafTeamGamePerformanceTable.season, season),
      )),
  ]);
  const capturedEvents = new Set(performanceRows.map((row) => row.providerEventId));
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const missingDates = [...new Set(completedGames
    .filter((row) => row.kickoffAt && !capturedEvents.has(row.providerEventId))
    .map((row) => dateFormatter.format(row.kickoffAt!)))]
    .sort()
    .slice(-MAX_NCAAF_BOOTSTRAP_DAYS);
  const failures: Array<{ date: string; cause: string }> = [];
  let capturedDates = 0;
  for (const date of missingDates) {
    try {
      await capture(new Date(`${date}T12:00:00.000Z`));
      capturedDates++;
    } catch (error) {
      failures.push({ date, cause: error instanceof Error ? error.message : String(error) });
    }
  }
  return { attemptedDates: missingDates.length, capturedDates, failures };
}