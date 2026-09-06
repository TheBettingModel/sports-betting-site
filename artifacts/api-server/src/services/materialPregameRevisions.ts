import { createHash } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  gamesTable,
  mlbPolicyRevisionsTable,
  modelPredictionsTable,
  pickResultsTable,
  publishedPicksTable,
} from "@workspace/db";
import type { FetchedGame } from "./espn";
import type { ProjectionResult } from "./model";
import { MLB_MAX_FAVORITE_ODDS, removeVig2 } from "./model";
import {
  hasValidMoneylineMarketForSport,
  isPregameCommenceTime,
} from "./oddsApi";
import {
  publishedPickEffectivenessLock,
  publishedPickEffectivenessWriterLock,
} from "./publishedPickReconciliation";
import { isActionablePublication } from "./publicationEligibility";

const MATERIAL_EDGE_DELTA = 3;
const MATERIAL_PROBABILITY_DELTA = 0.025;
const MATERIAL_ODDS_DELTA = 15;

type MaterialRecommendation = "Strong Buy" | "Buy" | "Neutral" | "Fade";

class PregameCutoffReachedError extends Error {
  constructor() {
    super("Pregame revision cutoff reached");
  }
}

export interface MaterialPregameDecision {
  selection: "home" | "away";
  odds: number;
  modelProbability: number;
  edge: number;
  confidence: string;
  recommendation: MaterialRecommendation;
  units: number;
  podScore: number;
  finalRating: number;
  marketIntelligenceGrade: string;
}

interface PriorDecision extends MaterialPregameDecision {
  featureSnapshot: Record<string, unknown>;
}

export interface MaterialChange {
  changed: boolean;
  reasons: string[];
}

function stableJson(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function numberOr(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Produces a stable evidence identity from the inputs that can change a
 * pregame MLB decision. Refresh timestamps and cache ages are intentionally
 * excluded so ordinary scheduler runs do not churn immutable records.
 */
export function materialMlbEvidenceFingerprint(snapshot: Record<string, unknown>): string | null {
  const decision = recordOrEmpty(snapshot.decision);
  const availability = recordOrEmpty(decision.availability);
  const dataQuality = recordOrEmpty(decision.dataQuality);
  const evidence = recordOrEmpty(dataQuality.evidence);
  if (Object.keys(decision).length === 0) return null;

  const lineup = (side: "home" | "away") => {
    const value = recordOrEmpty(availability[`${side}Lineup`]);
    return {
      confirmed: availability[`${side}LineupConfirmed`] === true,
      batterCount: numberOr(value.batterCount),
    };
  };
  const starter = (side: "home" | "away") => {
    const value = recordOrEmpty(availability[`${side}Starter`]);
    return {
      playerId: value.playerId ?? null,
      name: value.name ?? null,
      pitchHand: value.pitchHand ?? null,
      seasonEra: numberOr(value.seasonEra),
      seasonWhip: numberOr(value.seasonWhip),
      recentEra: numberOr(value.recentEra),
      fip: numberOr(value.fip),
      kMinusBbPct: numberOr(value.kMinusBbPct),
    };
  };
  const bullpen = (side: "home" | "away") => {
    const value = recordOrEmpty(availability[`${side}Bullpen`]);
    return {
      fatigueLabel: value.fatigueLabel ?? null,
      weightedPitches: numberOr(value.weightedPitches),
      gamesLast3Days: numberOr(value.gamesLast3Days),
    };
  };
  const weather = recordOrEmpty(availability.venueWeather);

  return hash({
    missingSignals: Array.isArray(dataQuality.missingSignals) ? dataQuality.missingSignals : [],
    recommendationBlocked: evidence.recommendationBlocked === true,
    qualityReasons: Array.isArray(evidence.qualityReasons) ? evidence.qualityReasons : [],
    homeStarter: starter("home"),
    awayStarter: starter("away"),
    homeLineup: lineup("home"),
    awayLineup: lineup("away"),
    homeBullpen: bullpen("home"),
    awayBullpen: bullpen("away"),
    weather: {
      isDome: weather.isDome ?? null,
      windSpeedMph: numberOr(weather.windSpeedMph),
      windDirectionDeg: numberOr(weather.windDirectionDeg),
      precipitationMm: numberOr(weather.precipitationMm),
      temperatureCelsius: numberOr(weather.temperatureCelsius),
    },
  });
}

function requiredMlbEvidenceWithdrawal(featureSnapshot: Record<string, unknown>): {
  blocked: boolean;
  qualityReasons: string[];
} {
  const decision = recordOrEmpty(featureSnapshot.decision);
  const dataQuality = recordOrEmpty(decision.dataQuality);
  const evidence = recordOrEmpty(dataQuality.evidence);
  const missingSignals = Array.isArray(dataQuality.missingSignals)
    ? dataQuality.missingSignals.filter((signal): signal is string => typeof signal === "string")
    : [];
  const qualityReasons = Array.isArray(evidence.qualityReasons)
    ? evidence.qualityReasons.filter((reason): reason is string => typeof reason === "string")
    : [];
  return {
    blocked: evidence.recommendationBlocked === true && missingSignals.includes("probable_pitchers"),
    qualityReasons,
  };
}

export function currentPregameDecision(proj: ProjectionResult): MaterialPregameDecision {
  const selection = proj.edge >= 0 ? "home" : "away";
  const odds = selection === "home" ? proj.vegasHomeOdds : proj.vegasAwayOdds;
  const modelProbability = selection === "home" ? proj.homeWinPct / 100 : 1 - proj.homeWinPct / 100;
  let recommendation: MaterialRecommendation = (
    proj.valueRating === "Strong Buy" ||
    proj.valueRating === "Buy" ||
    proj.valueRating === "Fade"
  )
    ? proj.valueRating
    : "Neutral";
  // Defend the immutable replacement path independently of its caller. The
  // regular projection already applies this price gate, but a pregame revision
  // must never revive a retired -200-style favorite if that changes later.
  if (
    (recommendation === "Strong Buy" || recommendation === "Buy") &&
    odds <= MLB_MAX_FAVORITE_ODDS
  ) {
    recommendation = "Neutral";
  }
  return {
    selection,
    odds,
    modelProbability,
    // Preserve the immutable forecast's original home-perspective edge. The
    // selected-side normalization belongs only to the publication contract.
    edge: proj.edge,
    confidence: proj.confidence,
    recommendation,
    units: recommendation === "Neutral" ? 1 : proj.units > 0 ? proj.units : 1,
    podScore: recommendation === "Neutral" ? 0 : proj.podScore,
    finalRating: proj.finalModelScore,
    marketIntelligenceGrade: proj.finalModelTier,
  };
}

export function currentMlbPregameDecision(proj: ProjectionResult): MaterialPregameDecision {
  return currentPregameDecision(proj);
}

/**
 * Recommendation and side changes are always material. Within the same
 * recommendation, revisions require a meaningful market/model move or a
 * changed pitcher, lineup, bullpen, weather, or data-quality fingerprint.
 */
export function assessMlbMaterialPregameChange(
  previous: PriorDecision,
  current: MaterialPregameDecision,
  currentEvidenceFingerprint: string | null,
): MaterialChange {
  const reasons: string[] = [];
  if (previous.recommendation !== current.recommendation) reasons.push("recommendation_changed");
  if (previous.selection !== current.selection) reasons.push("selection_changed");
  if (Math.abs(Math.abs(previous.edge) - Math.abs(current.edge)) >= MATERIAL_EDGE_DELTA) {
    reasons.push("edge_changed");
  }
  if (Math.abs(previous.modelProbability - current.modelProbability) >= MATERIAL_PROBABILITY_DELTA) {
    reasons.push("model_probability_changed");
  }
  if (Math.abs(previous.odds - current.odds) >= MATERIAL_ODDS_DELTA) reasons.push("market_price_changed");

  const priorEvidenceFingerprint = materialMlbEvidenceFingerprint(previous.featureSnapshot);
  if (
    currentEvidenceFingerprint != null &&
    priorEvidenceFingerprint != null &&
    currentEvidenceFingerprint !== priorEvidenceFingerprint
  ) {
    reasons.push("validated_evidence_changed");
  }
  return { changed: reasons.length > 0, reasons };
}

/**
 * WNBA refreshes revise the effective pick only when the actionable decision
 * changes. Ordinary price/probability movement remains in timestamped odds
 * snapshots and must not churn immutable recommendation records.
 */
export function assessWnbaMaterialPregameChange(
  previous: Pick<MaterialPregameDecision, "selection" | "recommendation">,
  current: Pick<MaterialPregameDecision, "selection" | "recommendation">,
): MaterialChange {
  const reasons: string[] = [];
  if (previous.recommendation !== current.recommendation) reasons.push("recommendation_changed");
  if (previous.selection !== current.selection) reasons.push("selection_changed");
  return { changed: reasons.length > 0, reasons };
}

function revisionManifest(
  sport: string,
  priorPredictionId: number,
  current: MaterialPregameDecision,
  evidenceFingerprint: string | null,
  reasons: string[],
) {
  return {
    version: `${sport.toLowerCase()}-pregame-data-revision-v1`,
    revisionType: "material_pregame_data",
    sport,
    priorPredictionId,
    currentDecision: current,
    evidenceFingerprint,
    reasons,
  };
}

export function isMaterialPregameRevisionEligible(
  game: FetchedGame,
  proj: ProjectionResult,
  eligible: boolean,
  featureSnapshot?: Record<string, unknown>,
): boolean {
  if (game.sport !== "MLB" && game.sport !== "WNBA") return false;
  const evidenceWithdrawal = game.sport === "MLB" && featureSnapshot
    ? requiredMlbEvidenceWithdrawal(featureSnapshot).blocked
    : false;
  return (
    game.status === "upcoming" &&
    isPregameCommenceTime(game.commenceTimeISO) &&
    (
      evidenceWithdrawal ||
      (
        eligible &&
        hasValidMoneylineMarketForSport(game.sport, {
          homeOdds: proj.vegasHomeOdds,
          awayOdds: proj.vegasAwayOdds,
        })
      )
    )
  );
}

export function isMlbMaterialPregameRevisionEligible(
  game: FetchedGame,
  proj: ProjectionResult,
  eligible: boolean,
  featureSnapshot?: Record<string, unknown>,
): boolean {
  return game.sport === "MLB"
    && isMaterialPregameRevisionEligible(game, proj, eligible, featureSnapshot);
}

/**
 * Replaces an effective MLB or WNBA pregame decision only when the current validated
 * projection has changed materially. The previous prediction and pick remain
 * immutable audit records; the previous pending result becomes void.
 */
export async function applyMaterialPregameRevision(
  game: FetchedGame,
  proj: ProjectionResult,
  modelVersionId: number,
  featureSnapshot: Record<string, unknown>,
  eligible: boolean,
): Promise<boolean> {
  if (!isMaterialPregameRevisionEligible(game, proj, eligible, featureSnapshot)) {
    return false;
  }

  const evidenceWithdrawal = game.sport === "MLB"
    ? requiredMlbEvidenceWithdrawal(featureSnapshot)
    : { blocked: false, qualityReasons: [] };
  const evidenceFingerprint = game.sport === "MLB"
    ? materialMlbEvidenceFingerprint(featureSnapshot)
    : null;
  try {
    const outcome = await db.transaction(async (tx) => {
    await tx.execute(publishedPickEffectivenessWriterLock());
    await tx.execute(publishedPickEffectivenessLock(game.espnId, "moneyline"));

    const [stillEligible] = await tx
      .select({ id: gamesTable.id })
      .from(gamesTable)
      .where(and(
        eq(gamesTable.id, game.espnId),
        eq(gamesTable.status, "upcoming"),
      ))
      .limit(1);
    if (!stillEligible) return { changed: false, predictionId: null, actionable: false };

    const [activePick] = await tx
      .select()
      .from(publishedPicksTable)
      .where(and(
        eq(publishedPicksTable.gameId, game.espnId),
        eq(publishedPicksTable.market, "moneyline"),
        eq(publishedPicksTable.isEffective, true),
      ))
      .limit(1);
    if (!activePick) return { changed: false, predictionId: null, actionable: false };

    const [priorPrediction] = await tx
      .select()
      .from(modelPredictionsTable)
      .where(eq(modelPredictionsTable.id, activePick.predictionId))
      .limit(1);
    if (!priorPrediction) return { changed: false, predictionId: null, actionable: false };

    const prior: PriorDecision = {
      selection: activePick.selection === "away" ? "away" : "home",
      odds: activePick.odds ?? priorPrediction.odds ?? 0,
      modelProbability: priorPrediction.modelProbability,
      edge: priorPrediction.edge,
      confidence: activePick.confidence,
      recommendation: activePick.recommendation as MaterialRecommendation,
      units: activePick.units,
      podScore: priorPrediction.podScore ?? 0,
      finalRating: priorPrediction.finalRating ?? 0,
      marketIntelligenceGrade: priorPrediction.marketIntelligenceGrade ?? "",
      featureSnapshot: recordOrEmpty(priorPrediction.featureSnapshot),
    };
    // A source-quality withdrawal is intentionally independent of a current
    // odds refresh. Preserve the prior selection/price for this immutable
    // neutral record so an odds outage cannot keep a rejected pitcher pick live.
    const current: MaterialPregameDecision = evidenceWithdrawal.blocked
      ? {
          selection: prior.selection,
          odds: prior.odds,
          modelProbability: 0.5,
          edge: 0,
          confidence: "Low",
          recommendation: "Neutral",
          units: 1,
          podScore: 0,
          finalRating: 0,
          marketIntelligenceGrade: "",
        }
      : currentPregameDecision(proj);
    const change = game.sport === "WNBA"
      ? assessWnbaMaterialPregameChange(prior, current)
      : assessMlbMaterialPregameChange(prior, current, evidenceFingerprint);
    if (evidenceWithdrawal.blocked && prior.recommendation !== "Neutral") {
      change.reasons.push(
        "required_pitcher_evidence_unavailable",
        ...evidenceWithdrawal.qualityReasons.map((reason) => `pitcher_evidence:${reason}`),
      );
    }
    if (change.reasons.length === 0) {
      return { changed: false, predictionId: null, actionable: false };
    }

    const manifest = revisionManifest(
      game.sport,
      priorPrediction.id,
      current,
      evidenceFingerprint,
      change.reasons,
    );
    const materialHash = hash(manifest);
    const revisionKey = `pregame-data-${game.espnId}-${materialHash.slice(0, 16)}`;
    const revisionCreatedAt = new Date();
    let [revision] = await tx
      .select()
      .from(mlbPolicyRevisionsTable)
      .where(eq(mlbPolicyRevisionsTable.revisionKey, revisionKey))
      .limit(1);
    if (!revision) {
      const [created] = await tx
        .insert(mlbPolicyRevisionsTable)
        .values({
          revisionKey,
          sport: game.sport,
          market: "moneyline",
          policyManifest: manifest,
          policyHash: materialHash,
          reason: `Automated material pregame refresh: ${change.reasons.join(", ")}`,
          createdBy: "automation",
          activatedAt: revisionCreatedAt,
        })
        .onConflictDoNothing()
        .returning();
      revision = created;
      if (!revision) {
        [revision] = await tx
          .select()
          .from(mlbPolicyRevisionsTable)
          .where(eq(mlbPolicyRevisionsTable.revisionKey, revisionKey))
          .limit(1);
      }
    }
    if (!revision || revision.policyHash !== materialHash) {
      throw new Error(`Could not create a stable ${game.sport} pregame data revision.`);
    }

    const [alreadyWritten] = await tx
      .select({ id: modelPredictionsTable.id })
      .from(modelPredictionsTable)
      .where(and(
        eq(modelPredictionsTable.gameId, game.espnId),
        eq(modelPredictionsTable.modelVersionId, modelVersionId),
        eq(modelPredictionsTable.market, "moneyline"),
        eq(modelPredictionsTable.policyRevisionId, revision.id),
      ))
      .limit(1);
    if (alreadyWritten) {
      return { changed: false, predictionId: null, actionable: false };
    }

    // Take a row lock and use PostgreSQL's wall-clock time immediately before
    // writing a replacement. `CURRENT_TIMESTAMP` is transaction-start time,
    // so `clock_timestamp()` is required after a potentially long lock wait.
    const predictionCutoffCheck = await tx.execute(sql`
      SELECT id
      FROM games
      WHERE id = ${game.espnId}
        AND status = 'upcoming'
        AND starts_at > clock_timestamp()
      FOR UPDATE
    `);
    if (predictionCutoffCheck.rows.length === 0) {
      throw new PregameCutoffReachedError();
    }
    const now = new Date();

    const revisionSnapshot = {
      ...featureSnapshot,
      schemaVersion: 5,
      pregameDataRevision: {
        id: revision.id,
        revisionKey: revision.revisionKey,
        materialHash,
        priorPredictionId: priorPrediction.id,
        priorDecision: {
          selection: prior.selection,
          recommendation: prior.recommendation,
          odds: prior.odds,
          edge: prior.edge,
          modelProbability: prior.modelProbability,
        },
        currentDecision: current,
        evidenceFingerprint,
        reasons: change.reasons,
        appliedAt: now.toISOString(),
      },
    };

    const retainedFairProbability = typeof priorPrediction.fairProbability === "number"
      && Number.isFinite(priorPrediction.fairProbability)
      ? Math.max(0.001, Math.min(0.999, priorPrediction.fairProbability))
      : 0.5;
    const fairMarket = evidenceWithdrawal.blocked
      ? prior.selection === "home"
        ? { home: retainedFairProbability, away: 1 - retainedFairProbability }
        : { home: 1 - retainedFairProbability, away: retainedFairProbability }
      : removeVig2(proj.vegasHomeOdds, proj.vegasAwayOdds);
    const [insertedPrediction] = await tx
      .insert(modelPredictionsTable)
      .values({
        gameId: game.espnId,
        modelVersionId,
        policyRevisionId: revision.id,
        supersedesPredictionId: priorPrediction.id,
        sport: game.sport,
        market: "moneyline",
        selection: current.selection,
        odds: current.odds,
        modelProbability: current.modelProbability,
        impliedProbability: current.odds > 0
          ? 100 / (current.odds + 100)
          : Math.abs(current.odds) / (Math.abs(current.odds) + 100),
        fairProbability: current.selection === "home" ? fairMarket.home : fairMarket.away,
        edge: current.edge,
        confidence: current.confidence,
        recommendation: current.recommendation,
        units: current.units,
        podScore: current.recommendation === "Neutral" ? 0 : current.podScore,
        finalRating: current.finalRating,
        marketIntelligenceGrade: current.marketIntelligenceGrade,
        sharpSignals: { sharpScore: proj.sharpScore, sharpSignal: proj.sharpSignal },
        featureSnapshot: revisionSnapshot,
        predictionTimestamp: now,
        dataCutoffTimestamp: now,
        isChallenger: false,
        cohort: "official",
      })
      .returning({ id: modelPredictionsTable.id });
    if (!insertedPrediction) {
      return { changed: false, predictionId: null, actionable: false };
    }
    // Actionable revisions must compete in the canonical complete daily pool.
    // Return the immutable prediction identity and publish only after this
    // transaction commits; publishDownstreamCandidates owns its transaction.
    if (isActionablePublication(current.recommendation, current.units)) {
      return { changed: true, predictionId: insertedPrediction.id, actionable: true };
    }

    // The reads above can wait on database work. Recheck at the last safe
    // point before the effective decision is replaced; throwing rolls back the
    // newly inserted prediction as well as every pending mutation.
    const replacementCutoffCheck = await tx.execute(sql`
      SELECT id
      FROM games
      WHERE id = ${game.espnId}
        AND status = 'upcoming'
        AND starts_at > clock_timestamp()
      FOR UPDATE
    `);
    if (replacementCutoffCheck.rows.length === 0) {
      throw new PregameCutoffReachedError();
    }

    await tx
      .update(publishedPicksTable)
      .set({ isEffective: false, supersededAt: now })
      .where(eq(publishedPicksTable.id, activePick.id));
    const supersessionAudit = JSON.stringify([{
      timestamp: now.toISOString(),
      previousResult: "pending",
      newResult: "void",
      performedBy: "automation",
      reason: `Superseded before start by ${game.sport} material pregame revision ${revision.revisionKey}`,
    }]);
    await tx
      .update(pickResultsTable)
      .set({
        result: "void",
        unitsWonLost: 0,
        gradedAt: now,
        gradingSource: "pregame_data_revision",
        gradeAudit: sql`COALESCE(${pickResultsTable.gradeAudit}, '[]'::jsonb) || ${supersessionAudit}::jsonb`,
      })
      .where(and(
        eq(pickResultsTable.pickId, activePick.id),
        eq(pickResultsTable.result, "pending"),
      ));

    const [pick] = await tx
      .insert(publishedPicksTable)
      .values({
        predictionId: insertedPrediction.id,
        policyRevisionId: revision.id,
        supersedesPickId: activePick.id,
        gameId: game.espnId,
        sport: game.sport,
        market: "moneyline",
        selection: current.selection,
        odds: current.odds,
        units: 0,
        recommendation: current.recommendation,
        confidence: current.confidence,
        isPlayOfDay: false,
        isPublic: false,
        isEffective: true,
        publicationStatus: "SAFETY_BLOCKED",
        publicationReasonCode: "MATERIAL_REVISION_WITHDRAWN",
        exclusionReasonCode: "MATERIAL_REVISION_WITHDRAWN",
        selectedSideEdge: (current.selection === "home"
          ? current.modelProbability - fairMarket.home
          : current.modelProbability - fairMarket.away) * 100,
        rankScore: current.finalRating,
        globalRank: (activePick as any).globalRank,
        requestedUnits: current.units,
        approvedUnits: 0,
        stakePolicyVersion: "fail-closed-flat-v1",
        stakeReason: "MATERIAL_REVISION_WITHDRAWN",
        decisionTimestamp: now,
        dataCutoff: now,
        gameStart: new Date(game.commenceTimeISO),
        publishedAt: now,
      } as any)
      .returning({ id: publishedPicksTable.id });
    if (!pick) throw new Error(`Failed to create effective ${game.sport} material revision pick.`);

    await tx
      .update(publishedPicksTable)
      .set({ supersededByPickId: pick.id })
      .where(eq(publishedPicksTable.id, activePick.id));
    return { changed: true, predictionId: insertedPrediction.id, actionable: false };
    });
    if (outcome.actionable && outcome.predictionId != null) {
      const { publishDownstreamCandidates } = await import("./snapshot");
      try {
        await publishDownstreamCandidates([outcome.predictionId]);
      } catch (publicationError) {
        const { failClosedRevisionPublication } = await import("./revisionPublicationSafety");
        await failClosedRevisionPublication(outcome.predictionId);
        throw publicationError;
      }
    }
    return outcome.changed;
  } catch (error) {
    if (error instanceof PregameCutoffReachedError) return false;
    throw error;
  }
}