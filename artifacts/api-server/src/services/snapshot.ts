import { and, desc, eq, lte, sql } from "drizzle-orm";
import {
  db,
  closingLinesTable,
  gameResultsTable,
  gamesTable,
  modelPredictionsTable,
  oddsSnapshotsTable,
  publishedPicksTable,
  pickResultsTable,
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
  publishedPickEffectivenessLock,
  publishedPickEffectivenessWriterLock,
} from "./publishedPickReconciliation";
import {
  hasValidMoneylineMarketForSport,
  isValidAmericanOdds,
  isPregameCommenceTime,
} from "./oddsApi";
import { assessMlbDecisionEvidence, type MlbDecisionEvidence } from "./mlbDecisionEvidence";
import { applyMaterialPregameRevision } from "./materialPregameRevisions";
import type { WnbaGameContext } from "./wnbaContext";
import {
  writeSpreadCandidateSnapshots,
  type SpreadEvaluationInput,
} from "./spreadModel";

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
  const impliedPickProb = game.sport === "NCAAF" ? null :
    pickOdds > 0
      ? 100 / (pickOdds + 100)
      : Math.abs(pickOdds) / (Math.abs(pickOdds) + 100);
  const fairMarket = game.sport === "NCAAF" ? null : removeVig2(proj.vegasHomeOdds, proj.vegasAwayOdds);
  const fairPickProbability = fairMarket == null ? null : pickIsHome ? fairMarket.home : fairMarket.away;

  const [inserted] = await db
    .insert(modelPredictionsTable)
    .values({
      gameId: game.espnId,
      modelVersionId,
      sport: game.sport,
      market: "moneyline",
      selection: pickIsHome ? "home" : "away",
      odds: game.sport === "NCAAF" ? null : pickOdds,
      modelProbability: pickProb,
      impliedProbability: impliedPickProb,
      fairProbability: fairPickProbability,
      edge: game.sport === "NCAAF" ? 0 : proj.edge,
      confidence: proj.confidence,
      recommendation: proj.valueRating,
      units: game.sport === "NCAAF" ? 0 : proj.units > 0 ? proj.units : 1.0,
      podScore: proj.podScore,
      finalRating: proj.finalModelScore,
      marketIntelligenceGrade: proj.finalModelTier,
      sharpSignals: { sharpScore: proj.sharpScore, sharpSignal: proj.sharpSignal },
       featureSnapshot: snapshot,
      predictionTimestamp: capturedAt,
      dataCutoffTimestamp: capturedAt,
      isChallenger: game.sport === "NCAAF",
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
/** Maximum public picks surfaced to subscribers per calendar day (ET). */
const MAX_PUBLIC_PICKS_PER_DAY = 6;

async function publishPick(
  predictionId: number,
  game: FetchedGame,
  proj: ProjectionResult,
  publishedAt: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(publishedPickEffectivenessWriterLock());
    await tx.execute(publishedPickEffectivenessLock(game.espnId, "moneyline"));
    let isPublic =
      proj.valueRating === "Strong Buy" || proj.valueRating === "Buy";

    // Enforce the daily cap — if we've already reached MAX_PUBLIC_PICKS_PER_DAY
    // for today, demote this pick to private so subscribers aren't overwhelmed.
    // Picks are processed in ESPN order; the model thresholds are the primary
    // quality gate and the cap is a safety ceiling.
    if (isPublic) {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(publishedPicksTable)
        .where(
          and(
            sql`DATE(published_at AT TIME ZONE 'America/New_York') = CURRENT_DATE`,
            eq(publishedPicksTable.isPublic, true),
          ),
        );
      if (count >= MAX_PUBLIC_PICKS_PER_DAY) {
        isPublic = false;
      }
    }

    const isPlayOfDay = proj.finalModelTier === "Elite" || proj.podScore >= 50;
    const units = proj.units > 0 ? proj.units : 1.0;
    const pickIsHomePub = proj.edge >= 0;

    const [pick] = await tx
      .insert(publishedPicksTable)
      .values({
        predictionId,
        gameId: game.espnId,
        sport: game.sport,
        market: "moneyline",
        selection: pickIsHomePub ? "home" : "away",
        odds: pickIsHomePub ? proj.vegasHomeOdds : proj.vegasAwayOdds,
        units,
        recommendation: proj.valueRating,
        confidence: proj.confidence,
        isPlayOfDay,
        isPublic,
        // The schema default is deliberately false for safe rollout of legacy
        // data. Every newly published baseline decision is immediately current.
        isEffective: true,
        publishedAt,
      })
      .returning({ id: publishedPicksTable.id });

    if (!pick) return;

    // Seed a pending pick_results row so the grader can find it
    await tx.insert(pickResultsTable).values({
      pickId: pick.id,
      result: "pending",
      unitsRisked: units,
      unitsWonLost: 0,
      gradeAudit: [],
    });
  });
}

/** NCAAF is an isolated challenger and cannot enter publication/grading/learning. */
export function shouldPublishPrediction(sport: string): boolean {
  return sport !== "NCAAF";
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
): Promise<void> {
  const { espnSportsbookId, marketIds, modelVersionIds } =
    await getBootstrapIds();
  const now = new Date();
  const modelVersionId = modelVersionIds[game.sport];

  if (!modelVersionId) {
    logger.warn(
      { sport: game.sport },
      "No production model version for sport, skipping snapshot",
    );
    return;
  }

  try {
    // 1. Capture and publish only while the game is genuinely upcoming.
    // Live/post-start provider prices must never become a new "pregame" model
    // decision or overwrite the market evidence used for later learning.
    if (game.status === "upcoming" && isPregameCommenceTime(game.commenceTimeISO)) {
      await writeOddsSnapshot(game, proj, now, espnSportsbookId, marketIds, decisionContext);
      const featureSnapshot = buildImmutablePredictionFeatureSnapshot(
        game, proj, modelVersionId, decisionContext,
      );
      const predictionId = await writePredictionSnapshot(
        game,
        proj,
        modelVersionId,
        now,
        decisionContext,
        featureSnapshot,
      );
      if (predictionId !== null) {
        if (shouldPublishPrediction(game.sport)) {
          await publishPick(predictionId, game, proj, now);
        }
      } else if (shouldPublishPrediction(game.sport)) {
        await applyMaterialPregameRevision(
          game,
          proj,
          modelVersionId,
          featureSnapshot,
          isPredictionDecisionEligible(game, decisionContext),
        );
      }
      if (spreadInput) {
        await writeSpreadCandidateSnapshots({ game, ...spreadInput });
      }
    }

    // 2. Result + closing lines (when final). Closing price is sourced from
    // the final valid pregame snapshot rather than the current final/live feed.
    if (game.status === "final") {
      await writeGameResult(game);
      await writeClosingLines(game, now, marketIds);
    }
  } catch (err) {
    logger.error({ err, gameId: game.espnId }, "processGameSnapshot error");
  }
}
