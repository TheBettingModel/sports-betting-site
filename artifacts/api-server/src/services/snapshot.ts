import { createHash } from "node:crypto";
import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import {
  db,
  closingLinesTable,
  gameResultsTable,
  gamesTable,
  marketApprovalDecisionsTable,
  modelPredictionsTable,
  modelVersionsTable,
  mlbForecastEvidenceTable,
  oddsSnapshotsTable,
  publishedPicksTable,
  pickResultsTable,
  publicationDecisionHistoryTable,
  publishedPickPerformanceClassificationsTable,
} from "@workspace/db";
import type { ModelWeights } from "@workspace/db";
import {
  computeFactorContributions,
  effectiveWeights,
  removeVig2,
  type ComputeOptions,
  type ProjectionResult,
} from "./model";
import type { FetchedGame } from "./espn";
import { getBootstrapIds } from "./bootstrap";
import { logger } from "../lib/logger";
import {
  publishedPickEffectivenessWriterLock,
} from "./publishedPickReconciliation";
import {
  hasValidMoneylineMarketForSport,
  isValidAmericanOdds,
  isPregameCommenceTime,
} from "./oddsApi";
import { assessMlbDecisionEvidence, type MlbDecisionEvidence } from "./mlbDecisionEvidence";
import type { WnbaGameContext } from "./wnbaContext";
import {
  writeSpreadCandidateSnapshots,
  settleSpreadPredictions,
  type SpreadEvaluationInput,
} from "./spreadModel";
import { marketApprovalDecisionHash } from "./marketApproval";
import { captureCompletedMlbBoxscore, evaluateMlbForecastEvidence } from "./mlbPointInTime";
import {
  APPROVED_STAKE_UNITS,
  decideDownstreamPublication,
  MAX_PUBLIC_PICKS_PER_EASTERN_DAY,
  PublicationDecisionReason,
  PublicationDecisionStatus,
  selectedSideEdgePercentagePoints,
} from "./downstreamPublicationPolicy";

export interface PredictionDecisionContext {
  factorWeights: Record<string, number>;
  factorContributions: Record<string, number>;
  confidenceMultiplier: number;
  inputSignals: Record<string, unknown>;
  availability: Record<string, unknown>;
  dataQuality: {
    capturedAt: string;
    missingSignals: string[];
    source: "refresh";
    evidence?: MlbDecisionEvidence;
    ncaafFeature?: {
      snapshotId: number;
      schemaVersion: string;
      modelVersion: string;
      configHash: string;
      inputHash: string;
      dataCutoffAt: string;
      sufficientIndependentEvidence: boolean;
    };
  };
}

function wnbaMissingSignals(context: WnbaGameContext | undefined): string[] {
  if (!context) return ["wnba_context"];
  return [
    ...context.evidence.missing.map((signal) => `wnba_${signal}`),
    ...(context.home.stats?.evidence?.missing ?? []).map((signal) => `wnba_home_stats.${signal}`),
    ...(context.away.stats?.evidence?.missing ?? []).map((signal) => `wnba_away_stats.${signal}`),
    ...(context.home.availability.evidence?.missing ?? []).map((signal) => `wnba_home_availability.${signal}`),
    ...(context.away.availability.evidence?.missing ?? []).map((signal) => `wnba_away_availability.${signal}`),
    ...context.home.schedule.evidence.missing.map((signal) => `wnba_home_schedule.${signal}`),
    ...context.away.schedule.evidence.missing.map((signal) => `wnba_away_schedule.${signal}`),
    ...(context.home.availability.evidence?.stale ? ["wnba_home_availability_stale"] : []),
    ...(context.away.availability.evidence?.stale ? ["wnba_away_availability_stale"] : []),
    ...(context.home.stats?.evidence?.stale ? ["wnba_home_stats_stale"] : []),
    ...(context.away.stats?.evidence?.stale ? ["wnba_away_stats_stale"] : []),
    ...(context.home.schedule.evidence.stale ? ["wnba_home_schedule_stale"] : []),
    ...(context.away.schedule.evidence.stale ? ["wnba_away_schedule_stale"] : []),
  ];
}

function buildWnbaSegmentation(
  game: FetchedGame,
  proj: ProjectionResult,
  decisionContext?: PredictionDecisionContext,
): Record<string, unknown> | undefined {
  if (game.sport !== "WNBA") return undefined;
  const context = decisionContext?.availability.wnbaContext as WnbaGameContext | undefined;
  const side = proj.edge >= 0 ? "home" : "away";
  const odds = side === "home" ? proj.vegasHomeOdds : proj.vegasAwayOdds;
  const edge = Math.abs(proj.edge);
  return {
    version: "wnba-segmentation-v1",
    side: { raw: side, bucketed: side },
    market: { raw: "moneyline", bucketed: "moneyline" },
    odds: {
      raw: odds,
      bucketed: odds == null ? null : odds <= -200 ? "favorite_200_plus" : odds < 0 ? "favorite" : odds < 200 ? "underdog" : "underdog_200_plus",
    },
    absoluteEdge: {
      raw: edge,
      bucketed: edge < 2 ? "under_2" : edge < 5 ? "2_to_under_5" : edge < 10 ? "5_to_under_10" : "10_plus",
    },
    confidence: { raw: proj.confidence, bucketed: proj.confidence },
    recommendation: { raw: proj.valueRating, bucketed: proj.valueRating },
    rest: {
      homeDays: context?.home.schedule.restDays ?? null,
      awayDays: context?.away.schedule.restDays ?? null,
      homeBackToBack: context?.home.schedule.backToBack ?? null,
      awayBackToBack: context?.away.schedule.backToBack ?? null,
    },
    travel: {
      homeMiles: context?.home.schedule.travelMiles ?? null,
      awayMiles: context?.away.schedule.travelMiles ?? null,
      homeTimezoneShiftHours: context?.home.schedule.timezoneShiftHours ?? null,
      awayTimezoneShiftHours: context?.away.schedule.timezoneShiftHours ?? null,
    },
    availability: context
      ? { home: context.home.availability, away: context.away.availability }
      : null,
    pace: context?.matchup.pace ?? { home: null, away: null, missing: true },
  };
}

/** Required evidence for an actionable pregame moneyline decision. */
export function isPredictionDecisionEligible(
  game: FetchedGame,
  decisionContext: PredictionDecisionContext | undefined,
): boolean {
  if (!decisionContext) return false;
  const missing = new Set(decisionContext.dataQuality.missingSignals);
  if (game.sport === "NCAAF") {
    return Boolean(
      decisionContext.dataQuality.ncaafFeature?.sufficientIndependentEvidence
      && isPregameCommenceTime(game.commenceTimeISO),
    );
  }
  if (missing.has("market_odds") || missing.has("market_started_or_invalid")) return false;
  // MLB starter quality is a full-game input, not a neutral fallback. Retain the
  // game for display, but do not turn an unannounced/scratched starter into a pick.
  if (game.sport === "MLB" && missing.has("probable_pitchers")) return false;
  return true;
}

/**
 * Capture reproducible pregame evidence next to every new prediction. The
 * context is constructed before the mutable games row is upserted, so later
 * score, odds, lineup, and injury refreshes cannot rewrite the decision.
 */
export function createPredictionDecisionContext(
  game: FetchedGame,
  modelWeights: ModelWeights | null,
  options: ComputeOptions,
  availability: Record<string, unknown>,
  precomputedMlbEvidence?: MlbDecisionEvidence,
  ncaafFeatureMeta?: PredictionDecisionContext["dataQuality"]["ncaafFeature"],
): PredictionDecisionContext {
  const factorWeights = effectiveWeights(game.sport, modelWeights?.factorWeights);
  const factorContributions = computeFactorContributions(
    game.sport,
    game.homeTeamRecord,
    game.awayTeamRecord,
    options,
    factorWeights,
  );
  const hasValidMarket = hasValidMoneylineMarketForSport(game.sport, {
    homeOdds: options.realVegasHomeOdds,
    awayOdds: options.realVegasAwayOdds,
    drawOdds: options.realVegasDrawOdds,
  });
  const mlbEvidence = game.sport === "MLB"
    ? precomputedMlbEvidence ?? assessMlbDecisionEvidence(game, options, availability)
    : undefined;
  const missingSignals = [
    !hasValidMarket ? "market_odds" : null,
    !isPregameCommenceTime(game.commenceTimeISO) ? "market_started_or_invalid" : null,
    ...(mlbEvidence?.missingSignals ?? []),
    game.sport === "NHL" && options.goalieAdvantage == null ? "goalie_confirmation" : null,
    game.sport === "NFL" && options.injuryAdvantage == null ? "injury_report" : null,
    game.sport === "WNBA" && options.injuryAdvantage == null ? "player_availability" : null,
    ...(game.sport === "WNBA" ? wnbaMissingSignals(options.wnbaContext) : []),
    game.sport === "NCAAF" && options.ncaafRecommendationBlocked
      ? "independent_team_evidence"
      : null,
  ].filter((signal): signal is string => signal !== null);

  return {
    factorWeights,
    factorContributions,
    confidenceMultiplier: modelWeights?.confidenceMultiplier ?? 1,
    inputSignals: options as Record<string, unknown>,
    availability,
    dataQuality: {
      capturedAt: new Date().toISOString(),
      missingSignals: [...new Set(missingSignals)],
      source: "refresh",
      evidence: mlbEvidence,
      ncaafFeature: ncaafFeatureMeta ?? options.ncaafFeatureMetadata,
    },
  };
}

// ── Odds snapshot ─────────────────────────────────────────────────────────────

/**
 * Persist only verified moneyline prices as immutable pregame evidence.
 * Synthetic spread/total values must never be recorded as market history.
 */
async function writeOddsSnapshot(
  game: FetchedGame,
  proj: ProjectionResult,
  capturedAt: Date,
  espnSportsbookId: number,
  marketIds: Record<string, number>,
  decisionContext?: PredictionDecisionContext,
): Promise<void> {
  const mlId = marketIds["moneyline"];
  const marketMissing = decisionContext?.dataQuality.missingSignals.includes("market_odds") ?? true;
  if (!mlId || marketMissing || !hasValidMoneylineMarketForSport(game.sport, {
    homeOdds: proj.vegasHomeOdds,
    awayOdds: proj.vegasAwayOdds,
    drawOdds: game.sport === "Soccer" ? proj.vegasDrawOdds : undefined,
  })) {
    return;
  }

  const rows = [
    { marketId: mlId, selection: "home", price: proj.vegasHomeOdds, line: null as number | null },
    { marketId: mlId, selection: "away", price: proj.vegasAwayOdds, line: null as number | null },
    ...(game.sport === "Soccer"
      ? [{ marketId: mlId, selection: "draw", price: proj.vegasDrawOdds, line: null as number | null }]
      : []),
  ];

  for (const r of rows) {
    await db.insert(oddsSnapshotsTable).values({
      gameId: game.espnId,
      sportsbookId: espnSportsbookId,
      marketId: r.marketId,
      selection: r.selection,
      price: r.price,
      line: r.line,
      capturedAt,
      source: "espn",
      marketStatus: game.status === "final" ? "closed" : "open",
      isAvailable: true,
      isStale: false,
      isBestAvailable: true, // ESPN is currently the only source
    });
  }
}

// ── Immutable prediction snapshot ─────────────────────────────────────────────

/**
 * Write one immutable prediction row per game + model version + market.
 * Returns the new prediction ID, or null if one already exists (idempotent).
 *
 * IMPORTANT: never call this after a game becomes final — snapshots must
 * capture pre-game information only.
 */
async function writePredictionSnapshot(
  game: FetchedGame,
  proj: ProjectionResult,
  modelVersionId: number,
  capturedAt: Date,
  decisionContext?: PredictionDecisionContext,
  featureSnapshot?: Record<string, unknown>,
  publicationApproved = false,
): Promise<number | null> {
  if (!isPredictionDecisionEligible(game, decisionContext) || (game.sport !== "NCAAF" && !hasValidMoneylineMarketForSport(game.sport, {
    homeOdds: proj.vegasHomeOdds,
    awayOdds: proj.vegasAwayOdds,
    drawOdds: game.sport === "Soccer" ? proj.vegasDrawOdds : undefined,
  }))) {
    return null;
  }

  // Guard: one prediction per game + model version + market
  const [existing] = await db
    .select({ id: modelPredictionsTable.id })
    .from(modelPredictionsTable)
    .where(
      and(
        eq(modelPredictionsTable.gameId, game.espnId),
        eq(modelPredictionsTable.modelVersionId, modelVersionId),
        eq(modelPredictionsTable.market, "moneyline"),
      ),
    )
    .limit(1);

  if (existing) return null; // Already exists — do not overwrite

  // Build the feature snapshot: exact inputs used by computeProjection
  const snapshot = featureSnapshot ?? {
    schemaVersion: decisionContext?.dataQuality.ncaafFeature ? 4 : decisionContext ? 3 : 1,
    modelVersion: {
      id: modelVersionId,
      decisionEvidenceVersion: decisionContext?.dataQuality.evidence?.schemaVersion ?? null,
      ncaafFeatureVersion: decisionContext?.dataQuality.ncaafFeature?.schemaVersion ?? null,
    },
    homeRecord: game.homeTeamRecord,
    awayRecord: game.awayTeamRecord,
    homeTeamAbbr: game.homeTeamAbbr,
    awayTeamAbbr: game.awayTeamAbbr,
    sport: game.sport,
    gameDate: game.gameDate,
    gameId: game.espnId,
    gameStartsAt: game.commenceTimeISO,
    vegasHomeOdds: proj.vegasHomeOdds,
    vegasAwayOdds: proj.vegasAwayOdds,
    vegasSpread: proj.vegasSpread,
    vegasTotal: proj.vegasTotal,
    ...(buildWnbaSegmentation(game, proj, decisionContext)
      ? { wnbaSegmentation: buildWnbaSegmentation(game, proj, decisionContext) }
      : {}),
    ...(decisionContext ? {
      decision: {
        factorWeights: decisionContext.factorWeights,
        factorContributions: decisionContext.factorContributions,
        confidenceMultiplier: decisionContext.confidenceMultiplier,
        inputSignals: decisionContext.inputSignals,
        availability: decisionContext.availability,
        dataQuality: decisionContext.dataQuality,
      },
    } : {}),
  };

  const pickIsHome = game.sport === "NCAAF" ? proj.homeWinPct >= 50 : proj.edge >= 0;
  const pickOdds   = pickIsHome ? proj.vegasHomeOdds : proj.vegasAwayOdds;
  const pickProb   = pickIsHome ? proj.homeWinPct / 100 : 1 - proj.homeWinPct / 100;
  const impliedPickProb = pickOdds > 0
    ? 100 / (pickOdds + 100)
    : Math.abs(pickOdds) / (Math.abs(pickOdds) + 100);
  const fairMarket = removeVig2(proj.vegasHomeOdds, proj.vegasAwayOdds);
  const fairPickProbability = fairMarket == null ? null : pickIsHome ? fairMarket.home : fairMarket.away;

  const [inserted] = await db
    .insert(modelPredictionsTable)
    .values({
      gameId: game.espnId,
      modelVersionId,
      sport: game.sport,
      market: "moneyline",
      selection: pickIsHome ? "home" : "away",
      odds: pickOdds,
      modelProbability: pickProb,
      impliedProbability: impliedPickProb,
      fairProbability: fairPickProbability,
      edge: proj.edge,
      confidence: proj.confidence,
      recommendation: proj.valueRating,
      units: proj.units,
      podScore: proj.podScore,
      finalRating: proj.finalModelScore,
      marketIntelligenceGrade: proj.finalModelTier,
      sharpSignals: { sharpScore: proj.sharpScore, sharpSignal: proj.sharpSignal },
       featureSnapshot: snapshot,
      predictionTimestamp: capturedAt,
      dataCutoffTimestamp: capturedAt,
      isChallenger: !publicationApproved,
      cohort: publicationApproved ? "official" : "shadow",
    })
    // The explicit pre-insert lookup above preserves the one-original-decision
    // rule. Do not name a conflict target here: policy revisions extend the
    // database identity with policy_revision_id.
    .onConflictDoNothing()
    .returning({ id: modelPredictionsTable.id });

  return inserted?.id ?? null;
}

// ── Published pick ────────────────────────────────────────────────────────────

/**
 * Create a published pick and a pending pick_results row for tracking.
 * Strong Buy + Buy are marked public; Neutral and Fade are private.
 */
/**
 * Applies the pure downstream policy at the persistence boundary. Input IDs
 * only identify newly observed candidates; the transaction rehydrates and
 * ranks the complete effective Eastern-day slate before it changes any pick.
 */
export async function publishDownstreamCandidates(predictionIds: readonly number[], now = new Date()): Promise<void> {
  // This legacy model_predictions publisher is retained solely for historical
  // reconciliation.  It must not turn an incumbent revision into an official
  // pick after cutover.  A V4 publisher must additionally supply its exact
  // artifact ledger identity at its own persistence boundary.
  if (predictionIds.length === 0) return;
  const incoming = await db.select({ modelId: modelVersionsTable.modelId })
    .from(modelPredictionsTable)
    .innerJoin(modelVersionsTable, eq(modelVersionsTable.id, modelPredictionsTable.modelVersionId))
    .where(inArray(modelPredictionsTable.id, [...predictionIds]));
  if (!incoming.some((row) => /^.*v4(?:[-_]|$)/i.test(row.modelId))) return;
  await db.transaction(async (tx) => {
    await tx.execute(publishedPickEffectivenessWriterLock());
    const currentEasternDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
    const incomingDates = predictionIds.length === 0 ? [] : await tx.selectDistinct({
      slateDate: sql<string>`COALESCE(
        DATE(${gamesTable.startsAt} AT TIME ZONE 'America/New_York'),
        ${gamesTable.gameDate}
      )`,
    }).from(modelPredictionsTable)
      .innerJoin(gamesTable, eq(gamesTable.id, modelPredictionsTable.gameId))
      .where(inArray(modelPredictionsTable.id, [...predictionIds]));
    const slateDates = (incomingDates.length
      ? incomingDates.map((row) => String(row.slateDate))
      : [currentEasternDate]).sort();

    for (const easternDate of slateDates) {
    // This is deliberately an exclusive *daily* lock.  A batch is not allowed
    // to reserve capacity based on a stale view of another batch's slate.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`downstream-publication:${easternDate}`}))`);

    // The input IDs are only a wake-up signal.  The actual slate is every
    // effective decision already made for this Eastern day plus those IDs.
    // Thus sport/provider traversal cannot make an earlier six permanent.
    const slateDateWhere = sql`COALESCE(
      DATE(${gamesTable.startsAt} AT TIME ZONE 'America/New_York'),
      ${gamesTable.gameDate}
    ) = ${easternDate}`;
    const poolWhere = and(
      slateDateWhere,
      predictionIds.length > 0
      ? or(
        inArray(modelPredictionsTable.id, [...predictionIds]),
        eq(publishedPicksTable.isEffective, true),
      )
      : eq(publishedPicksTable.isEffective, true),
    );
    const rows = await tx.select({
      id: modelPredictionsTable.id,
      gameId: modelPredictionsTable.gameId,
      sport: modelPredictionsTable.sport,
      market: modelPredictionsTable.market,
      selection: modelPredictionsTable.selection,
      odds: modelPredictionsTable.odds,
      modelProbability: modelPredictionsTable.modelProbability,
      fairProbability: modelPredictionsTable.fairProbability,
      recommendation: modelPredictionsTable.recommendation,
      units: modelPredictionsTable.units,
      confidence: modelPredictionsTable.confidence,
      podScore: modelPredictionsTable.podScore,
      finalRating: modelPredictionsTable.finalRating,
      isChallenger: modelPredictionsTable.isChallenger,
      cohort: modelPredictionsTable.cohort,
      modelStatus: modelVersionsTable.status,
      modelId: modelVersionsTable.modelId,
      modelSport: modelVersionsTable.sport,
      modelMarket: modelVersionsTable.market,
      trainingDatasetId: modelVersionsTable.trainingDatasetId,
      featureVersions: modelVersionsTable.featureVersions,
      dataCutoff: modelPredictionsTable.dataCutoffTimestamp,
      gameStart: gamesTable.startsAt,
      existingPickId: publishedPicksTable.id,
      existingPredictionId: publishedPicksTable.predictionId,
      existingPublic: publishedPicksTable.isPublic,
      existingRank: publishedPicksTable.globalRank,
      existingPlayOfDay: publishedPicksTable.isPlayOfDay,
      performanceEligible: publishedPickPerformanceClassificationsTable.performanceEligible,
    }).from(modelPredictionsTable)
      .innerJoin(gamesTable, eq(gamesTable.id, modelPredictionsTable.gameId))
      .innerJoin(modelVersionsTable, eq(modelVersionsTable.id, modelPredictionsTable.modelVersionId))
      .leftJoin(publishedPicksTable, and(
        eq(publishedPicksTable.predictionId, modelPredictionsTable.id),
        eq(publishedPicksTable.isEffective, true),
      ))
      .leftJoin(publishedPickPerformanceClassificationsTable, eq(
        publishedPickPerformanceClassificationsTable.publishedPickId, publishedPicksTable.id,
      ))
      .where(poolWhere);

    // Multiple append-only performance classifications can join the same row.
    // Also prefer a newly supplied revision for a game/market over its current
    // effective source so the latter is explicitly superseded below.
    const incoming = new Set(predictionIds);
    const byGameMarket = new Map<string, typeof rows[number]>();
    const activeByGameMarket = new Map<string, typeof rows[number]>();
    for (const row of rows) {
      const key = `${row.gameId}:${row.market}`;
      if (row.existingPickId != null && !activeByGameMarket.has(key)) activeByGameMarket.set(key, row);
      const prior = byGameMarket.get(key);
      const rowIsIneligible = row.performanceEligible === false;
      if (prior && prior.id === row.id) {
        if (rowIsIneligible) (prior as { performanceEligible: boolean | null }).performanceEligible = false;
        continue;
      }
      if (!prior
        || (incoming.has(row.id) && !incoming.has(prior.id))
        || (incoming.has(row.id) === incoming.has(prior.id) && row.id > prior.id)) {
        byGameMarket.set(key, row);
      }
    }
    const predictions = [...byGameMarket.values()].filter((prediction) =>
      /^.*v4(?:[-_]|$)/i.test(prediction.modelId),
    ).map((prediction) => {
      const active = activeByGameMarket.get(`${prediction.gameId}:${prediction.market}`);
      // A started public decision is immutable at the publication layer too:
      // an arriving revision cannot replace or silently alter a live pick.
      return active?.existingPublic === true
        && active.gameStart != null
        && new Date(active.gameStart) <= now
        ? active
        : prediction;
    });
    for (const prediction of predictions) {
      const active = activeByGameMarket.get(`${prediction.gameId}:${prediction.market}`);
      // A newly supplied policy revision has no direct published-pick join,
      // but it still replaces the current effective game/market decision.
      if (active && prediction.existingPickId == null) {
        Object.assign(prediction, {
          existingPickId: active.existingPickId,
          existingPredictionId: active.existingPredictionId,
          existingPublic: active.existingPublic,
          existingRank: active.existingRank,
          existingPlayOfDay: active.existingPlayOfDay,
          performanceEligible: active.performanceEligible === false ? false : prediction.performanceEligible,
        });
      }
    }
    const approvalByPrediction = new Map<number, { approved: boolean; decisionId: number | null }>();
    for (const prediction of predictions) {
      const [approval] = await tx.select({
        id: marketApprovalDecisionsTable.id,
        status: marketApprovalDecisionsTable.status,
      }).from(marketApprovalDecisionsTable)
        .where(and(
          eq(marketApprovalDecisionsTable.sport, prediction.modelSport),
          eq(marketApprovalDecisionsTable.market, prediction.modelMarket),
          eq(marketApprovalDecisionsTable.modelVersion, prediction.modelId),
          eq(marketApprovalDecisionsTable.evaluationVersion, "model-registry-evaluation-v1"),
          eq(marketApprovalDecisionsTable.datasetVersion, prediction.trainingDatasetId == null
            ? "training-dataset:unassigned"
            : `training-dataset:${prediction.trainingDatasetId}`),
          eq(marketApprovalDecisionsTable.featureSchemaVersion,
            marketApprovalDecisionHash(prediction.featureVersions ?? {})),
          lte(marketApprovalDecisionsTable.evidenceCutoff, prediction.dataCutoff),
        ))
        .orderBy(
          desc(marketApprovalDecisionsTable.evidenceCutoff),
          desc(marketApprovalDecisionsTable.createdAt),
        )
        .limit(1);
      approvalByPrediction.set(prediction.id, {
        approved: approval?.status === "PRODUCTION_APPROVED",
        decisionId: approval?.id ?? null,
      });
    }
    const slate = decideDownstreamPublication(predictions.map((prediction) => ({
      id: prediction.id,
      recommendation: prediction.recommendation,
      requestedUnits: prediction.units,
      // Caller flags are never an approval authority.  The registry and
      // immutable cohort are both required; legacy NULL cohort is allowed only
      // where the prediction is explicitly non-challenger.
      productionModelApproved: prediction.modelStatus === "production"
        && prediction.isChallenger === false
        && (prediction.cohort === "official" || prediction.cohort == null)
        && approvalByPrediction.get(prediction.id)?.approved === true,
      performanceEligible: prediction.performanceEligible !== false,
      market: prediction.market,
      selection: prediction.selection,
      odds: prediction.odds,
      modelProbability: prediction.modelProbability,
      marketProbability: prediction.fairProbability,
      // Rank the complete immutable slate. Elapsed start time is applied below
      // as a publication-state gate, not allowed to destroy global ordering.
      gameStart: new Date(8640000000000000),
      // This is deliberately selected-side, rather than the signed home edge.
      selectedSideEdge: selectedSideEdgePercentagePoints(
        prediction.modelProbability,
        prediction.fairProbability,
      ),
      finalRating: prediction.finalRating ?? Number.NaN,
      podScore: prediction.podScore ?? Number.NaN,
    })), now);
    const byId = new Map(predictions.map((prediction) => [prediction.id, prediction]));
    const lockedIds = new Set(predictions
      .filter((prediction) => prediction.existingPickId != null
        && prediction.existingPublic === true
        && prediction.gameStart != null
        && new Date(prediction.gameStart) <= now)
      .map((prediction) => prediction.id));
    const remaining = Math.max(0, MAX_PUBLIC_PICKS_PER_EASTERN_DAY - lockedIds.size);
    const publicDecisions = slate.decisions
      .filter((decision) => {
        const prediction = byId.get(Number(decision.candidateId));
        return decision.eligibleRank != null
          && !lockedIds.has(Number(decision.candidateId))
          && prediction?.gameStart != null
          && new Date(prediction.gameStart) > now;
      })
      .sort((left, right) => left.eligibleRank! - right.eligibleRank!)
      .slice(0, remaining);
    const publicIds = new Set([
      ...lockedIds,
      ...publicDecisions.map((decision) => Number(decision.candidateId)),
    ]);
    // Once a public game has started, its already-visible POTD designation is
    // locked too; do not rewrite a live customer-facing pick.  Otherwise POTD
    // is selected from (and only from) the final public pool.
    const lockedPotdId = predictions.find((prediction) =>
      lockedIds.has(prediction.id) && prediction.existingPlayOfDay === true,
    )?.id;
    const potdId = lockedPotdId ?? predictions.filter((prediction) => publicIds.has(prediction.id))
      .slice()
      .sort((left, right) => {
        const leftDecision = slate.decisions.find((decision) => Number(decision.candidateId) === left.id);
        const rightDecision = slate.decisions.find((decision) => Number(decision.candidateId) === right.id);
        return (right.podScore ?? -Infinity) - (left.podScore ?? -Infinity)
          || (right.finalRating ?? -Infinity) - (left.finalRating ?? -Infinity)
          || (leftDecision?.eligibleRank ?? Infinity) - (rightDecision?.eligibleRank ?? Infinity)
          || left.id - right.id;
      })[0]?.id;

    await tx.update(publishedPicksTable).set({ isPlayOfDay: false }).where(and(
      eq(publishedPicksTable.isEffective, true),
      sql`${publishedPicksTable.predictionId} IN (
        SELECT mp.id FROM model_predictions mp
        JOIN model_versions mv ON mv.id = mp.model_version_id
        WHERE mv.model_id ~* 'v4([_-]|$)'
      )`,
      sql`${publishedPicksTable.gameId} IN (
        SELECT id FROM games WHERE COALESCE(
          DATE(starts_at AT TIME ZONE 'America/New_York'), game_date
        ) = ${easternDate}
      )`,
    ));
    for (const decision of slate.decisions) {
      const prediction = byId.get(Number(decision.candidateId));
      if (!prediction) continue;
      const isLocked = lockedIds.has(prediction.id);
      const isPublic = publicIds.has(prediction.id);
      const hasStarted = prediction.gameStart == null || new Date(prediction.gameStart) <= now;
      const startedPrivate = hasStarted && !isLocked;
      const capacityExcluded = decision.eligibleRank != null && !isPublic && !startedPrivate;
      const publicationStatus = isPublic
        ? PublicationDecisionStatus.PUBLISHED
        : startedPrivate
          ? PublicationDecisionStatus.SAFETY_BLOCKED
        : capacityExcluded
          ? PublicationDecisionStatus.CAP_EXCLUDED
          : decision.status;
      const publicationReason = isPublic
        ? PublicationDecisionReason.PUBLIC_TOP_RANKED
        : startedPrivate
          ? PublicationDecisionReason.GAME_STARTED
        : capacityExcluded
          ? PublicationDecisionReason.CAP_EXCLUDED
          : decision.reason;
      const selectedSideEdge = prediction.fairProbability == null
        ? null : selectedSideEdgePercentagePoints(
          prediction.modelProbability,
          prediction.fairProbability,
        );
      // The API package can be deployed against a generated DB declaration
      // which predates the additive audit columns; the physical schema's
      // additive contract is intentionally used here without changing it.
      // A revision for the same game/market replaces the effective source
      // rather than colliding with it.  The old row remains an auditable,
      // superseded decision.  Re-running the same prediction updates that one
      // effective row in place and never creates another pending result.
      const replacesPrior = prediction.existingPickId != null
        && prediction.existingPredictionId !== prediction.id;
      const demotesPrior = prediction.existingPickId != null
        && prediction.existingPublic === true && !isPublic;
      if (demotesPrior && !replacesPrior
        && prediction.gameStart != null && new Date(prediction.gameStart) > now) {
        await tx.update(pickResultsTable).set({
          result: "void",
          unitsWonLost: 0,
          gradedAt: now,
          gradingSource: replacesPrior ? "publication_superseded" : "publication_demoted",
        }).where(and(
          eq(pickResultsTable.pickId, prediction.existingPickId!),
          eq(pickResultsTable.result, "pending"),
        ));
      }
      if (prediction.existingPickId != null && prediction.existingPredictionId !== prediction.id) {
        await tx.update(publishedPicksTable).set({
          isEffective: false, isPlayOfDay: false, supersededAt: now,
        }).where(eq(publishedPicksTable.id, prediction.existingPickId));
        const supersessionAudit = JSON.stringify([{
          timestamp: now.toISOString(),
          previousResult: "pending",
          newResult: "void",
          performedBy: "downstream_publication_policy",
          reason: `Superseded before start by canonical prediction ${prediction.id}`,
        }]);
        // A pregame revision replaces only this pick's still-pending grading
        // row. Settled history and every unrelated pending pick are immutable.
        await tx.update(pickResultsTable).set({
          result: "void",
          unitsWonLost: 0,
          gradedAt: now,
          gradingSource: "downstream_publication_revision",
          gradeAudit: sql`COALESCE(${pickResultsTable.gradeAudit}, '[]'::jsonb) || ${supersessionAudit}::jsonb`,
        }).where(and(
          eq(pickResultsTable.pickId, prediction.existingPickId),
          eq(pickResultsTable.result, "pending"),
        ));
      }
      const pickValues = {
        predictionId: prediction.id, gameId: prediction.gameId, sport: prediction.sport,
        market: prediction.market, selection: prediction.selection, odds: prediction.odds,
        units: isPublic ? APPROVED_STAKE_UNITS : 0,
        recommendation: prediction.recommendation, confidence: prediction.confidence,
        isPublic, isEffective: true,
        isPlayOfDay: isPublic && String(decision.candidateId) === String(potdId),
        publicationStatus,
        publicationReasonCode: publicationReason,
        exclusionReasonCode: isPublic ? null : publicationReason,
        selectedSideEdge, rankScore: prediction.finalRating ?? null,
        globalRank: decision.eligibleRank, requestedUnits: decision.requestedUnits,
        approvedUnits: isPublic ? APPROVED_STAKE_UNITS : 0,
        stakePolicyVersion: decision.stakePolicyVersion,
        stakeReason: isPublic ? "STAKE_CAPPED_FAIL_CLOSED" : publicationReason,
        dataCutoff: prediction.dataCutoff, gameStart: prediction.gameStart,
        decisionTimestamp: now,
      };
      const [pick] = prediction.existingPickId != null && prediction.existingPredictionId === prediction.id
        ? await (tx.update(publishedPicksTable) as any).set(pickValues)
          .where(eq(publishedPicksTable.id, prediction.existingPickId))
          .returning({ id: publishedPicksTable.id })
        : await (tx.insert(publishedPicksTable) as any).values({
          ...pickValues,
          publishedAt: now,
          supersedesPickId: prediction.existingPickId ?? null,
        })
          .returning({ id: publishedPicksTable.id });
      if (pick && prediction.existingPickId != null && prediction.existingPredictionId !== prediction.id) {
        await tx.update(publishedPicksTable).set({ supersededByPickId: pick.id })
          .where(eq(publishedPicksTable.id, prediction.existingPickId));
      }
      if (pick) {
        const historyState = {
          predictionId: prediction.id,
          publishedPickId: pick.id,
          slateDate: easternDate,
          publicationStatus,
          publicationReasonCode: publicationReason,
          globalRank: decision.eligibleRank,
          isPublic,
          isPlayOfDay: isPublic && String(decision.candidateId) === String(potdId),
          requestedUnits: decision.requestedUnits,
          approvedUnits: isPublic ? APPROVED_STAKE_UNITS : 0,
          stakePolicyVersion: decision.stakePolicyVersion,
          approvalDecisionId: approvalByPrediction.get(prediction.id)?.decisionId ?? null,
        };
        const [previousHistory] = await tx.select()
          .from(publicationDecisionHistoryTable)
          .where(eq(publicationDecisionHistoryTable.publishedPickId, pick.id))
          .orderBy(desc(publicationDecisionHistoryTable.id))
          .limit(1);
        const unchanged = previousHistory != null
          && previousHistory.predictionId === historyState.predictionId
          && previousHistory.slateDate === historyState.slateDate
          && previousHistory.publicationStatus === historyState.publicationStatus
          && previousHistory.publicationReasonCode === historyState.publicationReasonCode
          && previousHistory.globalRank === historyState.globalRank
          && previousHistory.isPublic === historyState.isPublic
          && previousHistory.isPlayOfDay === historyState.isPlayOfDay
          && previousHistory.requestedUnits === historyState.requestedUnits
          && previousHistory.approvedUnits === historyState.approvedUnits
          && previousHistory.stakePolicyVersion === historyState.stakePolicyVersion
          && previousHistory.approvalDecisionId === historyState.approvalDecisionId;
        if (!unchanged) {
          const previousDecisionHash = previousHistory?.decisionHash ?? null;
          const decisionHash = createHash("sha256")
            .update(JSON.stringify({ ...historyState, previousDecisionHash }))
            .digest("hex");
          await tx.insert(publicationDecisionHistoryTable).values({
            ...historyState,
            previousDecisionHash,
            decisionHash,
            decidedAt: now,
          }).onConflictDoNothing();
        }
      }
      if (pick && !isPublic) {
        await tx.update(pickResultsTable).set({
          result: "void",
          unitsWonLost: 0,
          gradedAt: now,
          gradingSource: "downstream_publication_revision",
        }).where(and(
          eq(pickResultsTable.pickId, pick.id),
          eq(pickResultsTable.result, "pending"),
        ));
      }
      if (pick && isPublic) {
        await tx.insert(pickResultsTable).values({
          pickId: pick.id, result: "pending", unitsRisked: APPROVED_STAKE_UNITS,
          unitsWonLost: 0, gradeAudit: [],
        }).onConflictDoNothing();
      }
    }
    }
  });
}

/** Exact market approval, not a broad sport allowlist, controls publication. */
export function shouldPublishPrediction(_sport: string): boolean {
  return true;
}

// ── Game result ───────────────────────────────────────────────────────────────

/**
 * Write final scores to game_results when ESPN marks a game as final.
 * Idempotent — does nothing if a result row already exists.
 */
async function writeGameResult(game: FetchedGame): Promise<void> {
  if (game.status !== "final") return;
  if (game.homeScore == null || game.awayScore == null) return;

  const [existing] = await db
    .select({ id: gameResultsTable.id })
    .from(gameResultsTable)
    .where(eq(gameResultsTable.gameId, game.espnId))
    .limit(1);

  if (!existing) {
    await db.insert(gameResultsTable).values({
      gameId: game.espnId,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      homeTeamWon: game.homeScore > game.awayScore,
      overtimes: 0,
      statusDetail: "Final",
      gradingSource: "espn",
    });
  }

  // Always keep the games table scores current so game cards show final scores.
  await db
    .update(gamesTable)
    .set({ homeScore: game.homeScore, awayScore: game.awayScore })
    .where(eq(gamesTable.id, game.espnId));
}

// ── Closing lines ─────────────────────────────────────────────────────────────

/**
 * Capture the closing Vegas lines when a game goes final.
 * Uses the last known ESPN odds as the proxy for the closing line.
 * The uniqueIndex on (gameId, marketId, selection) makes this idempotent.
 */
async function writeClosingLines(
  game: FetchedGame,
  capturedAt: Date,
  marketIds: Record<string, number>,
): Promise<void> {
  if (game.status !== "final") return;

  const mlId = marketIds["moneyline"];
  if (!mlId) return;

  const cutoff = new Date(game.commenceTimeISO).getTime();
  if (!Number.isFinite(cutoff)) return;

  const selections = game.sport === "Soccer"
    ? ["home", "away", "draw"] as const
    : ["home", "away"] as const;
  for (const selection of selections) {
    const [lastPregame] = Number.isFinite(cutoff)
      ? await db
          .select({ price: oddsSnapshotsTable.price, line: oddsSnapshotsTable.line })
          .from(oddsSnapshotsTable)
          .where(
            and(
              eq(oddsSnapshotsTable.gameId, game.espnId),
              eq(oddsSnapshotsTable.marketId, mlId),
              eq(oddsSnapshotsTable.selection, selection),
              eq(oddsSnapshotsTable.isAvailable, true),
              eq(oddsSnapshotsTable.isStale, false),
              eq(oddsSnapshotsTable.marketStatus, "open"),
              lte(oddsSnapshotsTable.capturedAt, new Date(cutoff)),
            ),
          )
          .orderBy(desc(oddsSnapshotsTable.capturedAt))
          .limit(1)
      : [];
    if (!lastPregame || !isValidAmericanOdds(lastPregame.price)) continue;

    await db
      .insert(closingLinesTable)
      .values({
        gameId: game.espnId,
        marketId: mlId,
        selection,
        closingPrice: lastPregame.price,
        closingLine: lastPregame.line,
        capturedAt,
      })
      .onConflictDoNothing(); // uniqueIndex on (gameId, marketId, selection)
  }
}

// ── Master pipeline ───────────────────────────────────────────────────────────

export function buildImmutablePredictionFeatureSnapshot(
  game: FetchedGame,
  proj: ProjectionResult,
  modelVersionId: number,
  decisionContext?: PredictionDecisionContext,
): Record<string, unknown> {
  return {
    schemaVersion: decisionContext?.dataQuality.ncaafFeature ? 4 : decisionContext ? 3 : 1,
    modelVersion: {
      id: modelVersionId,
      decisionEvidenceVersion: decisionContext?.dataQuality.evidence?.schemaVersion ?? null,
      ncaafFeatureVersion: decisionContext?.dataQuality.ncaafFeature?.schemaVersion ?? null,
      ncaafModelVersion: decisionContext?.dataQuality.ncaafFeature?.modelVersion ?? null,
      ncaafConfigHash: decisionContext?.dataQuality.ncaafFeature?.configHash ?? null,
    },
    homeRecord: game.homeTeamRecord,
    awayRecord: game.awayTeamRecord,
    homeTeamAbbr: game.homeTeamAbbr,
    awayTeamAbbr: game.awayTeamAbbr,
    sport: game.sport,
    gameDate: game.gameDate,
    gameId: game.espnId,
    gameStartsAt: game.commenceTimeISO,
    vegasHomeOdds: proj.vegasHomeOdds,
    vegasAwayOdds: proj.vegasAwayOdds,
    vegasSpread: proj.vegasSpread,
    vegasTotal: proj.vegasTotal,
    ...(decisionContext?.dataQuality.ncaafFeature
      ? { ncaafFeature: decisionContext.dataQuality.ncaafFeature }
      : {}),
    ...(buildWnbaSegmentation(game, proj, decisionContext)
      ? { wnbaSegmentation: buildWnbaSegmentation(game, proj, decisionContext) }
      : {}),
    ...(decisionContext ? {
      decision: {
        factorWeights: decisionContext.factorWeights,
        factorContributions: decisionContext.factorContributions,
        confidenceMultiplier: decisionContext.confidenceMultiplier,
        inputSignals: decisionContext.inputSignals,
        availability: decisionContext.availability,
        dataQuality: decisionContext.dataQuality,
      },
    } : {}),
  };
}

/**
 * Run the full snapshot pipeline for one game after its projection is computed.
 *
 * Order:
 * 1. Always write an odds snapshot (timestamped market data).
 * 2. If game is not yet final: write immutable prediction; publish only promoted sports.
 * 3. If game just became final: write game result + closing lines.
 */
export async function processGameSnapshot(
  game: FetchedGame,
  proj: ProjectionResult,
  decisionContext?: PredictionDecisionContext,
  spreadInput?: Omit<SpreadEvaluationInput, "game">,
  deferPublication = false,
): Promise<number | null> {
  const { espnSportsbookId, marketIds, modelVersionIds } =
    await getBootstrapIds();
  const now = new Date();
  const modelVersionId = modelVersionIds[game.sport];

  if (!modelVersionId) {
    logger.warn(
      { sport: game.sport },
      "No production model version for sport, skipping snapshot",
    );
    return null;
  }

  try {
    let createdPredictionId: number | null = null;
    // 1. Capture and publish only while the game is genuinely upcoming.
    // Live/post-start provider prices must never become a new "pregame" model
    // decision or overwrite the market evidence used for later learning.
    if (game.status === "upcoming" && isPregameCommenceTime(game.commenceTimeISO)) {
      await writeOddsSnapshot(game, proj, now, espnSportsbookId, marketIds, decisionContext);
      const featureSnapshot = buildImmutablePredictionFeatureSnapshot(
        game, proj, modelVersionId, decisionContext,
      );
      // This writer is the incumbent ProjectionResult path.  It remains useful
      // for immutable PIT evidence and later grading, but it is permanently a
      // shadow path after the V4 official-publication cutover.  In particular,
      // an approval on a legacy model must not become an implicit V4 fallback.
      const publicationPermission = { approved: false } as const;
      const predictionId = await writePredictionSnapshot(
        game,
        proj,
        modelVersionId,
        now,
        decisionContext,
        featureSnapshot,
        publicationPermission.approved,
      );
      if (predictionId !== null && deferPublication) createdPredictionId = predictionId;
      if (spreadInput) {
        await writeSpreadCandidateSnapshots({ game, ...spreadInput });
      }
    }

    // 2. Result + closing lines (when final). Closing price is sourced from
    // the final valid pregame snapshot rather than the current final/live feed.
    if (game.status === "final") {
      await writeGameResult(game);
      await writeClosingLines(game, now, marketIds);
      await settleSpreadPredictions(game, now);
      // Research-only V4 evaluation is deliberately independent from grading,
      // Results, ROI, and learning. It is bounded to this completed game.
      if (game.sport === "MLB") {
        try {
          await captureCompletedMlbBoxscore(game);
          const evidence = await db.select({ id: mlbForecastEvidenceTable.id })
            .from(mlbForecastEvidenceTable)
            .where(eq(mlbForecastEvidenceTable.gameId, game.espnId));
          for (const row of evidence) await evaluateMlbForecastEvidence(row.id);
        } catch (err) {
          logger.error({ err, gameId: game.espnId }, "MLB PIT postgame evaluation failed (nonfatal)");
        }
      }
    }
    return createdPredictionId;
  } catch (err) {
    logger.error({ err, gameId: game.espnId }, "processGameSnapshot error");
    return null;
  }
}
