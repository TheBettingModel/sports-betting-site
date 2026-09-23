import { and, eq, sql } from "drizzle-orm";
import {
  db,
  modelPredictionsTable,
  pickResultsTable,
  publishedPicksTable,
} from "@workspace/db";
import {
  publishedPickEffectivenessLock,
  publishedPickEffectivenessWriterLock,
} from "./publishedPickReconciliation";

/**
 * If canonical ranking fails after a revision prediction commits, replace the
 * old public decision with an explicit private block. This prevents a stale
 * superseded opinion from remaining actionable while retaining both revisions.
 */
export async function failClosedRevisionPublication(
  predictionId: number,
  reason = "REVISION_PUBLICATION_FAILED",
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [prediction] = await tx
      .select()
      .from(modelPredictionsTable)
      .where(eq(modelPredictionsTable.id, predictionId))
      .limit(1);
    if (!prediction) throw new Error(`Revision prediction ${predictionId} was not found.`);

    await tx.execute(publishedPickEffectivenessWriterLock());
    await tx.execute(publishedPickEffectivenessLock(prediction.gameId, prediction.market));
    const cutoff = await tx.execute(sql`
      SELECT id, starts_at
      FROM games
      WHERE id = ${prediction.gameId}
        AND status = 'upcoming'
        AND starts_at > clock_timestamp()
      FOR UPDATE
    `);
    if (cutoff.rows.length === 0) {
      throw new Error(`Cannot fail closed revision ${predictionId} after game start.`);
    }
    const [active] = await tx
      .select()
      .from(publishedPicksTable)
      .where(and(
        eq(publishedPicksTable.gameId, prediction.gameId),
        eq(publishedPicksTable.market, prediction.market),
        eq(publishedPicksTable.isEffective, true),
      ))
      .limit(1);
    if (!active || active.predictionId === predictionId) return;

    await tx.update(publishedPicksTable).set({
      isEffective: false,
      isPlayOfDay: false,
      supersededAt: now,
    }).where(eq(publishedPicksTable.id, active.id));
    await tx.update(pickResultsTable).set({
      result: "void",
      unitsWonLost: 0,
      gradedAt: now,
      gradingSource: "revision_publication_failure",
    }).where(and(
      eq(pickResultsTable.pickId, active.id),
      eq(pickResultsTable.result, "pending"),
    ));

    const [blocked] = await (tx.insert(publishedPicksTable) as any).values({
      predictionId,
      policyRevisionId: prediction.policyRevisionId,
      supersedesPickId: active.id,
      gameId: prediction.gameId,
      sport: prediction.sport,
      market: prediction.market,
      selection: prediction.selection,
      odds: prediction.odds,
      units: 0,
      recommendation: prediction.recommendation,
      confidence: prediction.confidence,
      isPlayOfDay: false,
      isPublic: false,
      isEffective: true,
      publicationStatus: "SAFETY_BLOCKED",
      publicationReasonCode: reason,
      exclusionReasonCode: reason,
      selectedSideEdge: prediction.fairProbability == null
        ? null
        : (prediction.modelProbability - prediction.fairProbability) * 100,
      rankScore: prediction.finalRating,
      globalRank: null,
      requestedUnits: prediction.units,
      approvedUnits: 0,
      stakePolicyVersion: "fail-closed-flat-v1",
      stakeReason: reason,
      decisionTimestamp: now,
      dataCutoff: prediction.dataCutoffTimestamp,
      gameStart: (cutoff.rows[0] as { starts_at: Date }).starts_at,
      publishedAt: now,
    }).returning({ id: publishedPicksTable.id });
    if (!blocked) throw new Error(`Could not record blocked revision ${predictionId}.`);
    await tx.update(publishedPicksTable).set({ supersededByPickId: blocked.id })
      .where(eq(publishedPicksTable.id, active.id));
  });
}