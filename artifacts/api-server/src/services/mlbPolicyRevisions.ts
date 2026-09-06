import { createHash } from "crypto";
import { and, desc, eq, gt, inArray, lte, sql, type SQL } from "drizzle-orm";
import {
  db,
  gamesTable,
  mlbPolicyRevisionsTable,
  modelPredictionsTable,
  publishedPicksTable,
  pickResultsTable,
} from "@workspace/db";
import {
  publishedPickEffectivenessLock,
  publishedPickEffectivenessWriterLock,
} from "./publishedPickReconciliation";
import { isActionablePublication } from "./publicationEligibility";
import { MLB_MAX_FAVORITE_ODDS } from "./model";

export interface MlbMoneylinePolicy {
  version: "mlb-moneyline-policy-v1";
  buyThreshold: number;
  strongBuyThreshold: number;
  awayOffset: number;
  maxFavoriteOdds: number;
}

export const DEFAULT_MLB_MONEYLINE_POLICY: MlbMoneylinePolicy = {
  version: "mlb-moneyline-policy-v1",
  buyThreshold: 7,
  strongBuyThreshold: 12,
  awayOffset: 3,
  maxFavoriteOdds: MLB_MAX_FAVORITE_ODDS,
};

export interface PolicyDecision {
  recommendation: "Strong Buy" | "Buy" | "Neutral";
  units: number;
  blockedReason: string | null;
}

export function isMlbFavoritePriceCapViolation(
  recommendation: string,
  odds: number | null,
  maxFavoriteOdds = MLB_MAX_FAVORITE_ODDS,
): boolean {
  return (
    (recommendation === "Buy" || recommendation === "Strong Buy") &&
    odds != null &&
    odds <= maxFavoriteOdds
  );
}

function isCredibleOdds(odds: number | null): odds is number {
  return odds != null && Number.isInteger(odds) && Math.abs(odds) >= 100 && Math.abs(odds) <= 2_000;
}

/**
 * Applies only recommendation policy to already-frozen pregame evidence. The
 * model probability, market price, and original decision remain untouched.
 */
export function evaluateMlbMoneylinePolicy(
  input: {
    edge: number;
    selection: string;
    odds: number | null;
    confidence: string;
    missingSignals: string[];
  },
  policy: MlbMoneylinePolicy,
): PolicyDecision {
  const hardBlocks = new Set(["market_odds", "market_started_or_invalid", "probable_pitchers"]);
  const failure = input.missingSignals.find((signal) => hardBlocks.has(signal));
  if (failure || !isCredibleOdds(input.odds)) {
    return { recommendation: "Neutral", units: 1, blockedReason: failure ?? "invalid_moneyline" };
  }

  const isAwayPick = input.selection === "away";
  const edge = Math.abs(input.edge);
  const buyThreshold = policy.buyThreshold + (isAwayPick ? policy.awayOffset : 0);
  const strongBuyThreshold = policy.strongBuyThreshold + (isAwayPick ? policy.awayOffset : 0);
  let recommendation: PolicyDecision["recommendation"] =
    edge >= strongBuyThreshold ? "Strong Buy" :
    edge >= buyThreshold ? "Buy" : "Neutral";

  if (recommendation !== "Neutral" && input.odds <= policy.maxFavoriteOdds) {
    recommendation = "Neutral";
  }
  if (recommendation === "Strong Buy" && input.confidence !== "High") {
    recommendation = "Buy";
  }
  return {
    recommendation,
    units: recommendation === "Neutral" ? 1 : recommendation === "Strong Buy" ? 2 : 1.5,
    blockedReason: recommendation === "Neutral" && edge >= buyThreshold ? "favorite_price_cap" : null,
  };
}

function normalizePolicy(value: unknown): MlbMoneylinePolicy {
  const candidate = value as Partial<MlbMoneylinePolicy> | null;
  const policy: MlbMoneylinePolicy = {
    ...DEFAULT_MLB_MONEYLINE_POLICY,
    ...(candidate ?? {}),
    version: "mlb-moneyline-policy-v1",
  };
  if (
    !Number.isFinite(policy.buyThreshold) || policy.buyThreshold < 1 ||
    !Number.isFinite(policy.strongBuyThreshold) || policy.strongBuyThreshold < policy.buyThreshold ||
    !Number.isFinite(policy.awayOffset) || policy.awayOffset < 0 ||
    !Number.isInteger(policy.maxFavoriteOdds) ||
    policy.maxFavoriteOdds > -100 ||
    policy.maxFavoriteOdds < MLB_MAX_FAVORITE_ODDS
  ) {
    throw new Error(`Invalid MLB moneyline policy thresholds. The favorite cap cannot be looser than ${MLB_MAX_FAVORITE_ODDS}.`);
  }
  return policy;
}

function policyHash(policy: MlbMoneylinePolicy): string {
  return createHash("sha256")
    .update(JSON.stringify({
      version: policy.version,
      buyThreshold: policy.buyThreshold,
      strongBuyThreshold: policy.strongBuyThreshold,
      awayOffset: policy.awayOffset,
      maxFavoriteOdds: policy.maxFavoriteOdds,
    }))
    .digest("hex");
}

function missingSignals(snapshot: unknown): string[] {
  const data = snapshot as { decision?: { dataQuality?: { missingSignals?: unknown } } };
  return Array.isArray(data.decision?.dataQuality?.missingSignals)
    ? data.decision.dataQuality.missingSignals.filter((signal): signal is string => typeof signal === "string")
    : ["decision_evidence_missing"];
}

function revisionSnapshot(
  snapshot: Record<string, unknown>,
  revision: { id: number; revisionKey: string; policyHash: string },
  originalPredictionId: number,
  decision: PolicyDecision,
): Record<string, unknown> {
  return {
    ...snapshot,
    schemaVersion: 4,
    policyRevision: {
      id: revision.id,
      revisionKey: revision.revisionKey,
      policyHash: revision.policyHash,
      originalPredictionId,
      appliedAt: new Date().toISOString(),
      policyDecision: decision,
    },
  };
}

export interface ApplyMlbPolicyRevisionInput {
  revisionKey: string;
  reason: string;
  actor: string;
  policy?: unknown;
  /** Used only by the automatic -160 repair to avoid rewriting compliant picks. */
  onlyPriceCapViolations?: boolean;
}

export interface ApplyMlbPolicyRevisionResult {
  revision: typeof mlbPolicyRevisionsTable.$inferSelect;
  createdPredictions: number;
  effectivePicks: number;
  skipped: number;
}

class PolicyRevisionPregameCutoffReachedError extends Error {
  constructor() {
    super("Pregame policy revision cutoff reached");
  }
}

/**
 * Locks the game row against concurrent updates and checks PostgreSQL's live
 * wall clock. Call it immediately before an immutable effective-pick mutation.
 */
export async function hasFutureMlbPolicyRevisionCutoff(
  tx: { execute: (query: SQL) => Promise<{ rows: unknown[] }> },
  gameId: string,
): Promise<boolean> {
  const cutoffCheck = await tx.execute(sql`
    SELECT id
    FROM games
    WHERE id = ${gameId}
      AND status = 'upcoming'
      AND starts_at > clock_timestamp()
    FOR UPDATE
  `);
  return cutoffCheck.rows.length > 0;
}

/**
 * Writes a new immutable decision only for games with a recorded future start.
 * Advisory locks serialize competing revisions for the same game/market so the
 * effective-pick pointer cannot split under concurrent admin requests.
 */
export async function applyMlbPolicyRevision(
  input: ApplyMlbPolicyRevisionInput,
): Promise<ApplyMlbPolicyRevisionResult> {
  if (!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(input.revisionKey)) {
    throw new Error("revisionKey must be 3–81 letters, numbers, dots, underscores, or dashes.");
  }
  if (input.reason.trim().length < 8) {
    throw new Error("A reason of at least 8 characters is required for an auditable policy revision.");
  }

  const policy = normalizePolicy(input.policy);
  const hash = policyHash(policy);
  const now = new Date();
  let revision: typeof mlbPolicyRevisionsTable.$inferSelect;

  const [existing] = await db
    .select()
    .from(mlbPolicyRevisionsTable)
    .where(eq(mlbPolicyRevisionsTable.revisionKey, input.revisionKey))
    .limit(1);
  if (existing) {
    if (existing.policyHash !== hash) {
      throw new Error("revisionKey already exists with a different immutable policy manifest.");
    }
    revision = existing;
  } else {
    const [created] = await db
      .insert(mlbPolicyRevisionsTable)
      .values({
        revisionKey: input.revisionKey,
        policyManifest: policy,
        policyHash: hash,
        reason: input.reason.trim(),
        createdBy: input.actor,
        activatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (created) {
      revision = created;
    } else {
      const [concurrentlyCreated] = await db
        .select()
        .from(mlbPolicyRevisionsTable)
        .where(eq(mlbPolicyRevisionsTable.revisionKey, input.revisionKey))
        .limit(1);
      if (!concurrentlyCreated || concurrentlyCreated.policyHash !== hash) {
        throw new Error("revisionKey already exists with a different immutable policy manifest.");
      }
      revision = concurrentlyCreated;
    }
  }

  const candidates = await db
    .select({
      gameId: gamesTable.id,
      modelVersionId: modelPredictionsTable.modelVersionId,
      predictionId: modelPredictionsTable.id,
      recommendation: publishedPicksTable.recommendation,
      selection: modelPredictionsTable.selection,
      odds: modelPredictionsTable.odds,
      edge: modelPredictionsTable.edge,
      confidence: modelPredictionsTable.confidence,
      featureSnapshot: modelPredictionsTable.featureSnapshot,
      podScore: modelPredictionsTable.podScore,
      finalRating: modelPredictionsTable.finalRating,
      marketIntelligenceGrade: modelPredictionsTable.marketIntelligenceGrade,
      sharpSignals: modelPredictionsTable.sharpSignals,
      impliedProbability: modelPredictionsTable.impliedProbability,
      fairProbability: modelPredictionsTable.fairProbability,
      modelProbability: modelPredictionsTable.modelProbability,
      sportsbookId: modelPredictionsTable.sportsbookId,
      lineShoppingInfo: modelPredictionsTable.lineShoppingInfo,
    })
    .from(publishedPicksTable)
    .innerJoin(modelPredictionsTable, eq(publishedPicksTable.predictionId, modelPredictionsTable.id))
    .innerJoin(gamesTable, eq(modelPredictionsTable.gameId, gamesTable.id))
    .where(and(
      eq(gamesTable.sport, "MLB"),
      eq(gamesTable.status, "upcoming"),
      gt(gamesTable.startsAt, now),
      eq(modelPredictionsTable.market, "moneyline"),
      eq(publishedPicksTable.market, "moneyline"),
      eq(publishedPicksTable.isEffective, true),
      input.onlyPriceCapViolations
        ? inArray(publishedPicksTable.recommendation, ["Buy", "Strong Buy"])
        : sql`TRUE`,
      input.onlyPriceCapViolations
        ? lte(modelPredictionsTable.odds, policy.maxFavoriteOdds)
        : sql`TRUE`,
    ))
    .orderBy(desc(modelPredictionsTable.predictionTimestamp));

  let createdPredictions = 0;
  let effectivePicks = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    if (
      input.onlyPriceCapViolations &&
      !isMlbFavoritePriceCapViolation(candidate.recommendation, candidate.odds, policy.maxFavoriteOdds)
    ) {
      skipped++;
      continue;
    }
    const snapshot = candidate.featureSnapshot as Record<string, unknown>;
    const decision = evaluateMlbMoneylinePolicy({
      edge: candidate.edge,
      selection: candidate.selection,
      odds: candidate.odds,
      confidence: candidate.confidence,
      missingSignals: missingSignals(snapshot),
    }, policy);

    let outcome: {
      created: boolean;
      effective: boolean;
      predictionId: number | null;
      actionable: boolean;
    };
    try {
      outcome = await db.transaction(async (tx) => {
      // hashtext is scoped to this transaction and serializes only this
      // game/market, allowing doubleheaders and unrelated games to proceed.
      await tx.execute(publishedPickEffectivenessWriterLock());
      await tx.execute(publishedPickEffectivenessLock(candidate.gameId, "moneyline"));
      // Recheck against the database after the lock is acquired. The original
      // candidate list may have waited behind another game; no decision may be
      // revised once its recorded first-pitch cutoff has passed.
      if (!await hasFutureMlbPolicyRevisionCutoff(tx, candidate.gameId)) {
        return { created: false, effective: false, predictionId: null, actionable: false };
      }
      const [alreadyWritten] = await tx
        .select({ id: modelPredictionsTable.id })
        .from(modelPredictionsTable)
        .where(and(
          eq(modelPredictionsTable.gameId, candidate.gameId),
          eq(modelPredictionsTable.modelVersionId, candidate.modelVersionId),
          eq(modelPredictionsTable.market, "moneyline"),
          eq(modelPredictionsTable.policyRevisionId, revision.id),
        ))
        .limit(1);
      if (alreadyWritten) {
        return { created: false, effective: false, predictionId: null, actionable: false };
      }

      const [insertedPrediction] = await tx
        .insert(modelPredictionsTable)
        .values({
          gameId: candidate.gameId,
          modelVersionId: candidate.modelVersionId,
          policyRevisionId: revision.id,
          supersedesPredictionId: candidate.predictionId,
          sport: "MLB",
          market: "moneyline",
          selection: candidate.selection,
          odds: candidate.odds,
          sportsbookId: candidate.sportsbookId,
          modelProbability: candidate.modelProbability,
          impliedProbability: candidate.impliedProbability,
          fairProbability: candidate.fairProbability,
          edge: candidate.edge,
          confidence: candidate.confidence,
          recommendation: decision.recommendation,
          units: decision.units,
          podScore: decision.recommendation === "Neutral" ? 0 : candidate.podScore,
          finalRating: candidate.finalRating,
          marketIntelligenceGrade: candidate.marketIntelligenceGrade,
          sharpSignals: candidate.sharpSignals,
          lineShoppingInfo: candidate.lineShoppingInfo,
          featureSnapshot: revisionSnapshot(snapshot, revision, candidate.predictionId, decision),
          predictionTimestamp: now,
          dataCutoffTimestamp: now,
          isChallenger: false,
          cohort: "official",
        })
        .returning({ id: modelPredictionsTable.id });
      if (!insertedPrediction) {
        return { created: false, effective: false, predictionId: null, actionable: false };
      }
      const actionable = isActionablePublication(decision.recommendation, decision.units);
      // Actionable revisions must be ranked with the complete cross-sport
      // daily slate. Commit the immutable prediction first, then invoke the
      // canonical publisher outside this transaction.
      if (actionable) {
        return {
          created: true,
          effective: false,
          predictionId: insertedPrediction.id,
          actionable: true,
        };
      }

      const active = await tx
        .select({ id: publishedPicksTable.id })
        .from(publishedPicksTable)
        .where(and(
          eq(publishedPicksTable.gameId, candidate.gameId),
          eq(publishedPicksTable.market, "moneyline"),
          eq(publishedPicksTable.isEffective, true),
        ));
      // The reads and immutable prediction insert above can take time. Recheck
      // at the last safe point so a pick can never be voided/replaced after its
      // recorded first pitch. Throwing rolls back the inserted prediction too.
      if (!await hasFutureMlbPolicyRevisionCutoff(tx, candidate.gameId)) {
        throw new PolicyRevisionPregameCutoffReachedError();
      }
      // Deactivate before inserting the replacement so the partial unique
      // index enforces exactly one effective game/market row at commit.
      if (active.length > 0) {
        await tx
          .update(publishedPicksTable)
          .set({ isEffective: false, supersededAt: now })
          .where(and(
            eq(publishedPicksTable.gameId, candidate.gameId),
            eq(publishedPicksTable.market, "moneyline"),
            eq(publishedPicksTable.isEffective, true),
          ));
        // A recommendation replaced before first pitch was never an active bet
        // for settlement. Preserve its row and audit trail, but remove it from
        // the operational pending queue so it cannot be graded twice or make
        // the admin health count appear stuck.
        const supersessionAudit = JSON.stringify([{
          timestamp: now.toISOString(),
          previousResult: "pending",
          newResult: "void",
          performedBy: input.actor,
          reason: `Superseded before start by MLB policy revision ${revision.revisionKey}`,
        }]);
        await tx
          .update(pickResultsTable)
          .set({
            result: "void",
            unitsWonLost: 0,
            gradedAt: now,
            gradingSource: "policy_revision",
            gradeAudit: sql`COALESCE(${pickResultsTable.gradeAudit}, '[]'::jsonb) || ${supersessionAudit}::jsonb`,
          })
          .where(and(
            inArray(pickResultsTable.pickId, active.map((row) => row.id)),
            eq(pickResultsTable.result, "pending"),
          ));
      }
      const [pick] = await tx
        .insert(publishedPicksTable)
        .values({
          predictionId: insertedPrediction.id,
          policyRevisionId: revision.id,
          supersedesPickId: active[0]?.id ?? null,
          gameId: candidate.gameId,
          sport: "MLB",
          market: "moneyline",
          selection: candidate.selection,
          odds: candidate.odds,
          units: 0,
          recommendation: decision.recommendation,
          confidence: candidate.confidence,
          isPlayOfDay: false,
          isPublic: false,
          isEffective: true,
          publicationStatus: "SAFETY_BLOCKED",
          publicationReasonCode: "POLICY_REVISION_WITHDRAWN",
          exclusionReasonCode: "POLICY_REVISION_WITHDRAWN",
          selectedSideEdge: candidate.fairProbability == null
            ? null
            : (candidate.modelProbability - candidate.fairProbability) * 100,
          rankScore: candidate.finalRating,
          globalRank: null,
          requestedUnits: decision.units,
          approvedUnits: 0,
          stakePolicyVersion: "fail-closed-flat-v1",
          stakeReason: "POLICY_REVISION_WITHDRAWN",
          decisionTimestamp: now,
          dataCutoff: now,
          gameStart: sql`(SELECT starts_at FROM games WHERE id = ${candidate.gameId})`,
          publishedAt: now,
        } as any)
        .returning({ id: publishedPicksTable.id });
      if (!pick) throw new Error("Failed to create the effective MLB policy-revision pick.");

      if (active.length > 0) {
        await tx
          .update(publishedPicksTable)
          .set({ supersededByPickId: pick.id })
          .where(and(
            inArray(publishedPicksTable.id, active.map((row) => row.id)),
          ));
      }
      return {
        created: true,
        effective: true,
        predictionId: insertedPrediction.id,
        actionable: false,
      };
      });
    } catch (error) {
      if (error instanceof PolicyRevisionPregameCutoffReachedError) {
        skipped++;
        continue;
      }
      throw error;
    }
    if (outcome.actionable && outcome.predictionId != null) {
      const { publishDownstreamCandidates } = await import("./snapshot");
      try {
        await publishDownstreamCandidates([outcome.predictionId], now);
      } catch (publicationError) {
        const { failClosedRevisionPublication } = await import("./revisionPublicationSafety");
        await failClosedRevisionPublication(outcome.predictionId, "MLB_POLICY_REVISION_PUBLICATION_FAILED", now);
        throw publicationError;
      }
      outcome.effective = true;
    }
    if (outcome.created) createdPredictions++;
    if (outcome.effective) effectivePicks++;
    if (!outcome.created) skipped++;
  }

  return { revision, createdPredictions, effectivePicks, skipped };
}

const MLB_FAVORITE_PRICE_CAP_REPAIR_KEY = "mlb-favorite-cap-160";

/**
 * On deployment, replace only current unstarted picks that were published under
 * the retired, looser price ceiling. The fixed revision key makes restarts safe.
 */
export async function applyMlbFavoritePriceCapRepair(): Promise<ApplyMlbPolicyRevisionResult> {
  return applyMlbPolicyRevision({
    revisionKey: MLB_FAVORITE_PRICE_CAP_REPAIR_KEY,
    reason: "Enforce the approved -160 MLB favorite price ceiling.",
    actor: "system",
    policy: DEFAULT_MLB_MONEYLINE_POLICY,
    onlyPriceCapViolations: true,
  });
}

export async function listMlbPolicyRevisionAudit() {
  const revisions = await db
    .select()
    .from(mlbPolicyRevisionsTable)
    .orderBy(desc(mlbPolicyRevisionsTable.activatedAt));
  return Promise.all(revisions.map(async (revision) => {
    const [summary] = await db
      .select({
        predictions: sql<number>`count(${modelPredictionsTable.id})::int`,
      })
      .from(modelPredictionsTable)
      .where(eq(modelPredictionsTable.policyRevisionId, revision.id));
    const [picks] = await db
      .select({ effectivePicks: sql<number>`count(*)::int` })
      .from(publishedPicksTable)
      .where(and(
        eq(publishedPicksTable.policyRevisionId, revision.id),
        eq(publishedPicksTable.isEffective, true),
      ));
    return {
      ...revision,
      affectedPredictions: Number(summary?.predictions ?? 0),
      effectivePicks: Number(picks?.effectivePicks ?? 0),
    };
  }));
}