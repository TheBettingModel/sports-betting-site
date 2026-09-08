import { and, desc, eq, sql } from "drizzle-orm";
import {
  db, gamesTable, marketApprovalDecisionsTable, modelPredictionsTable,
  modelVersionsTable, pickResultsTable, publicationDecisionHistoryTable, publishedPicksTable, v4ArtifactModelVersionMappingsTable,
  v4ForecastVersionsTable, v4MarketEvidenceTable, v4OfficialDecisionRevisionsTable,
} from "@workspace/db";
import { acquireExactApprovalDecisionLock, resolveExactApproval } from "./guardedServing/approvalRegistry";
import { stableHash, type CanonicalV4Forecast } from "./v4Platform";
import { canonicalV4EngineRegistry } from "./v4Platform";
import { rankOfficialV4Candidates, validateActionableV4MarketEvidence } from "./v4OfficialPublication";

const MAX_V4_PUBLIC_PER_EASTERN_DAY = 6;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ExecutableV4Revision<T> = Readonly<{
  value: T;
  gameId: string;
  market: string;
  modelPredictionId: number;
  decisionRevisionId: number;
  marketEvidenceId: string;
  marketEvidenceHash: string;
  evidenceCapturedAt: Date;
  existingEffective: boolean;
  executable: boolean;
}>;

/** Eligibility is applied before one deterministic revision is selected. */
export function selectExecutableV4Revisions<T>(
  revisions: readonly ExecutableV4Revision<T>[],
): ExecutableV4Revision<T>[] {
  const selected = new Map<string, ExecutableV4Revision<T>>();
  for (const revision of revisions) {
    if (!revision.executable) continue;
    const key = `${revision.gameId}\0${revision.market}`;
    const prior = selected.get(key);
    if (!prior || (revision.existingEffective && !prior.existingEffective)
      || (revision.existingEffective === prior.existingEffective
        && (revision.evidenceCapturedAt > prior.evidenceCapturedAt
          || (revision.evidenceCapturedAt.getTime() === prior.evidenceCapturedAt.getTime()
            && (revision.decisionRevisionId > prior.decisionRevisionId
              || (revision.decisionRevisionId === prior.decisionRevisionId
                && revision.modelPredictionId > prior.modelPredictionId)))))) {
      selected.set(key, revision);
    }
  }
  return [...selected.values()].sort((a, b) =>
    a.gameId.localeCompare(b.gameId) || a.market.localeCompare(b.market));
}

function easternDay(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function americanImplied(odds: number) { return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100); }

/** Converts a provider's complete same-snapshot moneyline into PIT evidence. */
export async function captureV4MoneylineEvidenceFromSnapshot(input: {
  sport: string; gameId: string; eventStart: string; source: string; providerIdentity: string;
  snapshotId: string; providerUpdatedAt?: Date; sportsbook: string;
  prices: ReadonlyArray<{ selection: string; odds: number }>;
}): Promise<void> {
  const receivedAt = new Date();
  const start = new Date(input.eventStart);
  const selections = new Set(input.prices.map(p => p.selection));
  const required = input.sport === "SOCCER" ? ["home", "draw", "away"] : ["home", "away"];
  if (!Number.isFinite(start.getTime()) || receivedAt >= start
    || required.some(selection => !selections.has(selection)) || input.prices.length !== required.length) return;
  if (input.providerUpdatedAt && (input.providerUpdatedAt > receivedAt
    || receivedAt.getTime() - input.providerUpdatedAt.getTime() > 15 * 60_000)) return;
  const implied = input.prices.map(p => americanImplied(p.odds));
  if (implied.some(p => !Number.isFinite(p) || p <= 0)) return;
  const total = implied.reduce((a, b) => a + b, 0);
  for (const [index, price] of input.prices.entries()) {
    await appendV4MarketEvidence({
      evidenceId: `${input.snapshotId}:${price.selection}`, sport: input.sport, gameId: input.gameId,
      market: "moneyline", selection: price.selection, line: null, odds: price.odds,
      fairProbability: implied[index] / total, sportsbook: input.sportsbook, source: input.source,
      capturedAt: receivedAt.toISOString(), snapshotId: input.snapshotId,
      providerIdentity: input.providerIdentity, eventStart: input.eventStart,
      payloadHash: stableHash({ ...input, providerUpdatedAt: input.providerUpdatedAt?.toISOString() ?? null, receivedAt: receivedAt.toISOString(), price }),
    });
  }
}

/** Captures the provider price before it can be consumed by publication. */
export async function appendV4MarketEvidence(
  evidence: import("./v4OfficialPublication").V4ActionableMarketEvidence & { evidenceId: string; payloadHash: string; sport: string; gameId: string },
): Promise<void> {
  const receipt = new Date();
  const suppliedReceipt = new Date(evidence.capturedAt);
  if (!Number.isFinite(suppliedReceipt.getTime())
    || Math.abs(receipt.getTime() - suppliedReceipt.getTime()) > 60_000) {
    throw new Error("SERVER_RECEIPT_TIMESTAMP_REQUIRED");
  }
  const syntheticForecast = { predictionTimestamp: evidence.capturedAt } as CanonicalV4Forecast;
  const reason = validateActionableV4MarketEvidence(evidence, syntheticForecast);
  if (reason) throw new Error(reason);
  await db.insert(v4MarketEvidenceTable).values({
    evidenceId: evidence.evidenceId, sport: evidence.sport, gameId: evidence.gameId,
    market: evidence.market, selection: evidence.selection, line: evidence.line, odds: evidence.odds,
    fairProbability: evidence.fairProbability, sportsbook: evidence.sportsbook, source: evidence.source,
    capturedAt: new Date(evidence.capturedAt), snapshotId: evidence.snapshotId,
    providerIdentity: evidence.providerIdentity, eventStart: new Date(evidence.eventStart), payloadHash: evidence.payloadHash,
  }).onConflictDoNothing();
}

/**
 * The sole V4-to-official write boundary.  It intentionally accepts forecast IDs
 * rather than an incumbent projection, and missing evidence/mapping/approval
 * returns no write rather than a legacy fallback.
 */
export async function persistOfficialV4Forecasts(predictionIds: readonly string[], now = new Date()): Promise<void> {
  await db.transaction(async tx => {
    const day = easternDay(now);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`v4-official:${day}`}))`);
    const forecasts = predictionIds.length ? await tx.select().from(v4ForecastVersionsTable)
      .where(sql`${v4ForecastVersionsTable.predictionId} = ANY(${[...predictionIds]})`) : [];
    for (const stored of forecasts) {
      const forecast = stored.forecastPayload as unknown as CanonicalV4Forecast;
      if (forecast.approvalState !== "PRODUCTION_APPROVED") continue;
      const outcomes = [
        ["home", forecast.homeWinProbability ?? -1],
        ["away", forecast.awayWinProbability ?? -1],
        ...(forecast.drawProbability == null ? [] : [["draw", forecast.drawProbability] as const]),
      ] as Array<readonly [string, number]>;
      const selection = outcomes.slice().sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      const [mapping] = await tx.select().from(v4ArtifactModelVersionMappingsTable).where(and(
        eq(v4ArtifactModelVersionMappingsTable.sport, forecast.sport), eq(v4ArtifactModelVersionMappingsTable.market, "moneyline"),
        eq(v4ArtifactModelVersionMappingsTable.modelFamily, forecast.modelFamily), eq(v4ArtifactModelVersionMappingsTable.modelId, forecast.modelId),
        eq(v4ArtifactModelVersionMappingsTable.modelVersion, forecast.modelVersion), eq(v4ArtifactModelVersionMappingsTable.artifactId, forecast.artifactId),
        eq(v4ArtifactModelVersionMappingsTable.artifactHash, forecast.artifactHash), eq(v4ArtifactModelVersionMappingsTable.inputContractVersion, forecast.inputContractVersion),
        eq(v4ArtifactModelVersionMappingsTable.configurationHash, forecast.configurationHash), eq(v4ArtifactModelVersionMappingsTable.parameterHash, forecast.parameterHash),
      )).limit(1);
      if (!mapping) continue;
      await acquireExactApprovalDecisionLock(tx as Tx, { sport: forecast.sport, market: "moneyline", modelFamily: forecast.modelFamily, modelId: forecast.modelId, modelVersion: forecast.modelVersion, artifactId: forecast.artifactId, artifactHash: forecast.artifactHash, inputContractVersion: forecast.inputContractVersion, inputHash: forecast.inputHash, configurationHash: forecast.configurationHash, parameterHash: forecast.parameterHash });
      const approval = await resolveExactApproval({ sport: forecast.sport, market: "moneyline", modelFamily: forecast.modelFamily, modelId: forecast.modelId, modelVersion: forecast.modelVersion, artifactId: forecast.artifactId, artifactHash: forecast.artifactHash, inputContractVersion: forecast.inputContractVersion, inputHash: forecast.inputHash, configurationHash: forecast.configurationHash, parameterHash: forecast.parameterHash }, "full", tx as Tx);
      const [market] = await tx.select().from(v4MarketEvidenceTable).where(and(
        eq(v4MarketEvidenceTable.sport, forecast.sport), eq(v4MarketEvidenceTable.gameId, forecast.gameId),
        eq(v4MarketEvidenceTable.market, "moneyline"), eq(v4MarketEvidenceTable.selection, selection),
      )).orderBy(desc(v4MarketEvidenceTable.capturedAt)).limit(1);
      const completeMarket = market ? await tx.select().from(v4MarketEvidenceTable)
        .where(and(eq(v4MarketEvidenceTable.snapshotId, market.snapshotId),
          eq(v4MarketEvidenceTable.sportsbook, market.sportsbook),
          eq(v4MarketEvidenceTable.capturedAt, market.capturedAt))) : [];
      const requiredSelections = forecast.sport === "SOCCER" ? ["home", "draw", "away"] : ["home", "away"];
      const sameBookComplete = completeMarket.length === requiredSelections.length
        && requiredSelections.every(value => completeMarket.some(row => row.selection === value));
      const marketReason = market && validateActionableV4MarketEvidence({
        ...market, capturedAt: market.capturedAt.toISOString(), eventStart: market.eventStart.toISOString(),
      }, forecast);
      if (!approval.approved || marketReason || !market || !sameBookComplete
        || now.getTime() - market.capturedAt.getTime() > 15 * 60_000) continue;
      const [marketApproval] = await tx.select({ status: marketApprovalDecisionsTable.status }).from(marketApprovalDecisionsTable)
        .where(and(eq(marketApprovalDecisionsTable.sport, forecast.sport), eq(marketApprovalDecisionsTable.market, "moneyline"), eq(marketApprovalDecisionsTable.modelVersion, forecast.modelId)))
        .orderBy(desc(marketApprovalDecisionsTable.createdAt)).limit(1);
      if (marketApproval?.status !== "PRODUCTION_APPROVED") continue;
      const [existing] = await tx.select({ id: v4OfficialDecisionRevisionsTable.id })
        .from(v4OfficialDecisionRevisionsTable).where(and(
          eq(v4OfficialDecisionRevisionsTable.forecastPredictionId, forecast.predictionId),
          eq(v4OfficialDecisionRevisionsTable.forecastVersion, stored.version),
          eq(v4OfficialDecisionRevisionsTable.marketEvidenceId, market.evidenceId),
          eq(v4OfficialDecisionRevisionsTable.marketEvidenceHash, market.payloadHash),
        )).limit(1);
      if (existing) continue;
      const modelProbability = selection === "home" ? forecast.homeWinProbability
        : selection === "away" ? forecast.awayWinProbability : forecast.drawProbability;
      if (modelProbability == null || modelProbability <= market.fairProbability) continue;
      const [createdPrediction] = await tx.insert(modelPredictionsTable).values({
        gameId: forecast.gameId, modelVersionId: mapping.modelVersionId,
        sport: forecast.sport === "SOCCER" ? "Soccer" : forecast.sport,
        market: "moneyline", selection,
        odds: market.odds, modelProbability, impliedProbability: americanImplied(market.odds), fairProbability: market.fairProbability,
        edge: (modelProbability - market.fairProbability) * 100,
        confidence: "High", recommendation: "Buy", units: 1,
        finalRating: (modelProbability - market.fairProbability) * 100, featureSnapshot: {
          v4PredictionId: forecast.predictionId, modelId: forecast.modelId, modelVersion: forecast.modelVersion,
          forecastExecutionTimestamp: forecast.predictionTimestamp,
          artifactId: forecast.artifactId, artifactHash: forecast.artifactHash, inputHash: forecast.inputHash,
          modelFamily: forecast.modelFamily, inputContractVersion: forecast.inputContractVersion,
          configurationHash: forecast.configurationHash, parameterHash: forecast.parameterHash,
          marketEvidenceId: market.evidenceId, marketEvidenceHash: market.payloadHash,
          marketOutcomeCount: forecast.sport === "SOCCER" ? 3 : 2,
        },
        predictionTimestamp: now, dataCutoffTimestamp: new Date(forecast.dataCutoff),
        isChallenger: false, cohort: "official",
      }).returning({ id: modelPredictionsTable.id });
      if (!createdPrediction) continue;
      await tx.insert(v4OfficialDecisionRevisionsTable).values({
        forecastPredictionId: forecast.predictionId, forecastVersion: stored.version,
        marketEvidenceId: market.evidenceId, marketEvidenceHash: market.payloadHash,
        modelPredictionId: createdPrediction.id,
      });
    }
    await rankV4OfficialDay(tx as Tx, day, now);
  });
}

/** Runs without requiring a new forecast wake-up. */
export async function reconcileOfficialV4Day(now = new Date()): Promise<void> {
  await persistOfficialV4Forecasts([], now);
}

async function withdrawV4Pick(tx: Tx, pick: typeof publishedPicksTable.$inferSelect, day: string, now: Date, reason: string) {
  const decisionHash = stableHash({ pickId: pick.id, day, status: "WITHDRAWN", reason, at: now.toISOString() });
  const [previous] = await tx.select({ hash: publicationDecisionHistoryTable.decisionHash })
    .from(publicationDecisionHistoryTable).where(eq(publicationDecisionHistoryTable.publishedPickId, pick.id))
    .orderBy(desc(publicationDecisionHistoryTable.decidedAt), desc(publicationDecisionHistoryTable.id)).limit(1);
  await tx.insert(publicationDecisionHistoryTable).values({
    decisionHash, previousDecisionHash: previous?.hash ?? null, predictionId: pick.predictionId,
    publishedPickId: pick.id, slateDate: day, publicationStatus: "WITHDRAWN",
    publicationReasonCode: reason, globalRank: pick.globalRank, isPublic: false, isPlayOfDay: false,
    requestedUnits: pick.requestedUnits ?? pick.units, approvedUnits: 0,
    stakePolicyVersion: pick.stakePolicyVersion ?? "v4-flat-1u-v1",
    approvalDecisionId: null, decidedAt: now,
  }).onConflictDoNothing();
  await tx.update(publishedPicksTable).set({
    isEffective: false, isPublic: false, isPlayOfDay: false, supersededAt: now,
    publicationStatus: "WITHDRAWN", exclusionReasonCode: reason, approvedUnits: 0, units: 0,
  }).where(eq(publishedPicksTable.id, pick.id));
  await tx.update(pickResultsTable).set({
    result: "void", unitsWonLost: 0, gradedAt: now, gradingSource: "v4_publication_withdrawal",
    gradeAudit: sql`COALESCE(${pickResultsTable.gradeAudit}, '[]'::jsonb) || ${JSON.stringify([{
      timestamp: now.toISOString(), previousResult: "pending", newResult: "void",
      performedBy: "v4_official_reconciliation", reason,
    }])}::jsonb`,
  }).where(and(eq(pickResultsTable.pickId, pick.id), eq(pickResultsTable.result, "pending")));
}

async function rankV4OfficialDay(tx: Tx, day: string, now: Date) {
  const effectiveUnstarted = await tx.select({ pick: publishedPicksTable })
    .from(publishedPicksTable).innerJoin(modelPredictionsTable, eq(modelPredictionsTable.id, publishedPicksTable.predictionId))
    .innerJoin(gamesTable, eq(gamesTable.id, publishedPicksTable.gameId))
    .where(and(eq(publishedPicksTable.isEffective, true),
      sql`${modelPredictionsTable.featureSnapshot} ? 'v4PredictionId'`,
      sql`DATE(${gamesTable.startsAt} AT TIME ZONE 'America/New_York') = ${day}`,
      sql`${gamesTable.startsAt} > ${now}`));
  const locked = await tx.select({ pick: publishedPicksTable, gameStart: gamesTable.startsAt })
    .from(publishedPicksTable).innerJoin(modelPredictionsTable, eq(modelPredictionsTable.id, publishedPicksTable.predictionId))
    .innerJoin(gamesTable, eq(gamesTable.id, publishedPicksTable.gameId))
    .where(and(eq(modelPredictionsTable.cohort, "official"), eq(publishedPicksTable.isEffective, true),
      eq(publishedPicksTable.isPublic, true), sql`${modelPredictionsTable.featureSnapshot} ? 'v4PredictionId'`,
      sql`DATE(${gamesTable.startsAt} AT TIME ZONE 'America/New_York') = ${day}`,
      sql`${gamesTable.startsAt} <= ${now}`));
  const lockedPotd = locked.find(row => row.pick.isPlayOfDay === true)?.pick.id;
  const remaining = Math.max(0, MAX_V4_PUBLIC_PER_EASTERN_DAY - locked.length);
  const rows = await tx.select({
    prediction: modelPredictionsTable, gameStart: gamesTable.startsAt,
    decisionRevisionId: v4OfficialDecisionRevisionsTable.id,
  })
    .from(modelPredictionsTable).innerJoin(modelVersionsTable, eq(modelVersionsTable.id, modelPredictionsTable.modelVersionId))
    .innerJoin(v4OfficialDecisionRevisionsTable,
      eq(v4OfficialDecisionRevisionsTable.modelPredictionId, modelPredictionsTable.id))
    .innerJoin(gamesTable, eq(gamesTable.id, modelPredictionsTable.gameId))
    .where(and(eq(modelPredictionsTable.cohort, "official"), sql`DATE(${gamesTable.startsAt} AT TIME ZONE 'America/New_York') = ${day}`, eq(modelVersionsTable.status, "production")));
  const ids = rows.map(r => String((r.prediction.featureSnapshot as Record<string, unknown>)["v4PredictionId"] ?? ""));
  const payloads = ids.length ? await tx.select().from(v4ForecastVersionsTable)
    .where(sql`${v4ForecastVersionsTable.predictionId} = ANY(${ids})`) : [];
  const payloadByForecastId = new Map(payloads.map(row => [row.predictionId, row]));
  const eligible: Array<{
    candidate: typeof rows[number]; forecast: CanonicalV4Forecast;
    evidenceCapturedAt: Date; existingEffective: boolean;
  }> = [];
  for (const candidate of rows) {
    const forecastId = String((candidate.prediction.featureSnapshot as Record<string, unknown>)["v4PredictionId"] ?? "");
    const forecastRow = payloadByForecastId.get(forecastId);
    if (!forecastRow) continue;
    const forecast = forecastRow.forecastPayload as unknown as CanonicalV4Forecast;
    if (forecast.approvalState !== "PRODUCTION_APPROVED") continue;
    const engine = canonicalV4EngineRegistry.get(forecast.sport);
    if (!engine || engine.approvalState !== "PRODUCTION_APPROVED"
      || engine.identity.modelId !== forecast.modelId
      || engine.identity.artifactId !== forecast.artifactId
      || engine.identity.artifactHash !== forecast.artifactHash) continue;
    const identity = {
      sport: forecast.sport, market: candidate.prediction.market, modelFamily: forecast.modelFamily,
      modelId: forecast.modelId, modelVersion: forecast.modelVersion, artifactId: forecast.artifactId,
      artifactHash: forecast.artifactHash, inputContractVersion: forecast.inputContractVersion,
      inputHash: forecast.inputHash, configurationHash: forecast.configurationHash, parameterHash: forecast.parameterHash,
    };
    await acquireExactApprovalDecisionLock(tx, identity);
    const approval = await resolveExactApproval(identity, "full", tx);
    if (!approval.approved || candidate.prediction.edge <= 0) continue;
    const [mapping] = await tx.select({ id: v4ArtifactModelVersionMappingsTable.id })
      .from(v4ArtifactModelVersionMappingsTable).where(and(
        eq(v4ArtifactModelVersionMappingsTable.modelVersionId, candidate.prediction.modelVersionId),
        eq(v4ArtifactModelVersionMappingsTable.artifactId, forecast.artifactId),
        eq(v4ArtifactModelVersionMappingsTable.artifactHash, forecast.artifactHash),
        eq(v4ArtifactModelVersionMappingsTable.configurationHash, forecast.configurationHash),
        eq(v4ArtifactModelVersionMappingsTable.parameterHash, forecast.parameterHash),
      )).limit(1);
    if (!mapping) continue;
    const snapshot = candidate.prediction.featureSnapshot as Record<string, unknown>;
    const [evidence] = await tx.select().from(v4MarketEvidenceTable).where(and(
      eq(v4MarketEvidenceTable.evidenceId, String(snapshot["marketEvidenceId"] ?? "")),
      eq(v4MarketEvidenceTable.selection, candidate.prediction.selection),
      eq(v4MarketEvidenceTable.market, candidate.prediction.market),
    )).limit(1);
    const completeMarket = evidence ? await tx.select().from(v4MarketEvidenceTable).where(and(
      eq(v4MarketEvidenceTable.snapshotId, evidence.snapshotId),
      eq(v4MarketEvidenceTable.sportsbook, evidence.sportsbook),
      eq(v4MarketEvidenceTable.capturedAt, evidence.capturedAt),
    )) : [];
    const requiredSelections = forecast.sport === "SOCCER" ? ["home", "draw", "away"] : ["home", "away"];
    const evidenceReason = evidence && validateActionableV4MarketEvidence({
      ...evidence, capturedAt: evidence.capturedAt.toISOString(), eventStart: evidence.eventStart.toISOString(),
    }, forecast);
    if (!evidence || evidenceReason || completeMarket.length !== requiredSelections.length
      || !requiredSelections.every(value => completeMarket.some(item => item.selection === value))
    ) continue;
    const [existingDecision] = await tx.select({
      id: publishedPicksTable.id, effective: publishedPicksTable.isEffective,
    }).from(publishedPicksTable)
      .where(eq(publishedPicksTable.predictionId, candidate.prediction.id)).limit(1);
    // Eligibility is final before dedupe/rank: withdrawn identities cannot
    // consume capacity, and a never-published decision needs a quote fresh at
    // this transaction. Requalification uses a new immutable revision.
    if ((existingDecision && !existingDecision.effective)
      || (!existingDecision && (evidence.capturedAt > now
        || now.getTime() - evidence.capturedAt.getTime() > 15 * 60_000))) continue;
    const [marketApproval] = await tx.select({ status: marketApprovalDecisionsTable.status })
      .from(marketApprovalDecisionsTable).where(and(
        eq(marketApprovalDecisionsTable.sport, forecast.sport),
        eq(marketApprovalDecisionsTable.market, candidate.prediction.market),
        eq(marketApprovalDecisionsTable.modelVersion, forecast.modelId),
      )).orderBy(desc(marketApprovalDecisionsTable.createdAt)).limit(1);
    if (marketApproval?.status !== "PRODUCTION_APPROVED") continue;
    eligible.push({
      candidate, forecast, evidenceCapturedAt: evidence.capturedAt,
      existingEffective: existingDecision?.effective === true,
    });
  }
  const deduped = selectExecutableV4Revisions(eligible.map(revision => {
    const snapshot = revision.candidate.prediction.featureSnapshot as Record<string, unknown>;
    return {
      value: revision, gameId: revision.candidate.prediction.gameId,
      market: revision.candidate.prediction.market,
      modelPredictionId: revision.candidate.prediction.id,
      decisionRevisionId: revision.candidate.decisionRevisionId,
      marketEvidenceId: String(snapshot["marketEvidenceId"] ?? ""),
      marketEvidenceHash: String(snapshot["marketEvidenceHash"] ?? ""),
      evidenceCapturedAt: revision.evidenceCapturedAt,
      existingEffective: revision.existingEffective, executable: true,
    };
  })).map(item => item.value);
  const byRankingId = new Map<string, typeof eligible[number]>();
  const ranked = rankOfficialV4Candidates(deduped.map(revision => {
    const rankingId = `${revision.forecast.predictionId}:revision:${revision.candidate.decisionRevisionId}`;
    byRankingId.set(rankingId, revision);
    return {
      forecast: { ...revision.forecast, predictionId: rankingId },
      exactApproval: true,
      publicationEligible: revision.candidate.gameStart != null && revision.candidate.gameStart > now,
      rankScore: revision.candidate.prediction.finalRating ?? Number.NaN,
    };
  })).filter(decision => decision.rank != null)
    .sort((a, b) => a.rank! - b.rank!).slice(0, remaining)
    .map(decision => byRankingId.get(decision.predictionId)!.candidate);
  const selectedPredictionIds = new Set(ranked.map(row => row.prediction.id));
  for (const { pick } of effectiveUnstarted) {
    if (!selectedPredictionIds.has(pick.predictionId)) {
      await withdrawV4Pick(tx, pick, day, now, "V4_REVALIDATION_OR_RANK_EXCLUDED");
    }
  }
  for (const [index, row] of ranked.entries()) {
    const [pick] = await tx.select({ id: publishedPicksTable.id, isEffective: publishedPicksTable.isEffective })
      .from(publishedPicksTable).where(eq(publishedPicksTable.predictionId, row.prediction.id)).limit(1);
    const decision = { isPublic: true, isEffective: true, isPlayOfDay: lockedPotd == null && index === 0, units: 1, approvedUnits: 1, globalRank: locked.length + index + 1, rankScore: row.prediction.finalRating, publicationStatus: "PUBLISHED", publicationReasonCode: "V4_EXACT_APPROVED", decisionTimestamp: now };
    let pickId: number;
    if (pick) {
      if (!pick.isEffective) continue;
      await tx.update(publishedPicksTable).set(decision).where(eq(publishedPicksTable.id, pick.id));
      pickId = pick.id;
    } else {
      const snapshot = row.prediction.featureSnapshot as Record<string, unknown>;
      const [publicationEvidence] = await tx.select({ capturedAt: v4MarketEvidenceTable.capturedAt })
        .from(v4MarketEvidenceTable)
        .where(eq(v4MarketEvidenceTable.evidenceId, String(snapshot["marketEvidenceId"] ?? ""))).limit(1);
      // A candidate that was merely stored earlier cannot become a new wager
      // from an old quote. A fresh quote requires a new immutable decision.
      if (!publicationEvidence || publicationEvidence.capturedAt > now
        || now.getTime() - publicationEvidence.capturedAt.getTime() > 15 * 60_000) continue;
      let predecessorPickId: number | null = null;
      const [predecessor] = await tx.select({ pick: publishedPicksTable, startsAt: gamesTable.startsAt })
        .from(publishedPicksTable).innerJoin(modelPredictionsTable, eq(modelPredictionsTable.id, publishedPicksTable.predictionId))
        .innerJoin(gamesTable, eq(gamesTable.id, publishedPicksTable.gameId))
        .where(and(eq(publishedPicksTable.gameId, row.prediction.gameId),
          eq(publishedPicksTable.market, row.prediction.market), eq(publishedPicksTable.isEffective, true))).limit(1);
      if (predecessor) {
        if (!predecessor.startsAt || predecessor.startsAt <= now) continue;
        await withdrawV4Pick(tx, predecessor.pick, day, now, "SUPERSEDED_BY_EXACT_V4_DECISION");
        predecessorPickId = predecessor.pick.id;
      }
      const [created] = await tx.insert(publishedPicksTable).values({
        predictionId: row.prediction.id, gameId: row.prediction.gameId, sport: row.prediction.sport,
        market: row.prediction.market, selection: row.prediction.selection, odds: row.prediction.odds,
        recommendation: row.prediction.recommendation, confidence: row.prediction.confidence,
        ...decision, publishedAt: now,
      }).returning({ id: publishedPicksTable.id });
      pickId = created.id;
      if (predecessorPickId != null) {
        await tx.update(publishedPicksTable).set({ supersededByPickId: pickId })
          .where(eq(publishedPicksTable.id, predecessorPickId));
      }
      await tx.insert(pickResultsTable).values({
        pickId, result: "pending", unitsRisked: 1, unitsWonLost: 0,
        gradingSource: "v4_official_publication",
        gradeAudit: [{ timestamp: now.toISOString(), previousResult: null, newResult: "pending", performedBy: "v4_official_publication", reason: "Effective official V4 pick created" }],
      }).onConflictDoNothing();
    }
    const decisionHash = stableHash({ pickId, predictionId: row.prediction.id, day, ...decision });
    const [previous] = await tx.select({ hash: publicationDecisionHistoryTable.decisionHash })
      .from(publicationDecisionHistoryTable)
      .where(eq(publicationDecisionHistoryTable.publishedPickId, pickId))
      .orderBy(desc(publicationDecisionHistoryTable.decidedAt), desc(publicationDecisionHistoryTable.id)).limit(1);
    await tx.insert(publicationDecisionHistoryTable).values({
      decisionHash, previousDecisionHash: previous?.hash ?? null, predictionId: row.prediction.id, publishedPickId: pickId,
      slateDate: day, publicationStatus: "PUBLISHED", publicationReasonCode: "V4_EXACT_APPROVED",
      globalRank: decision.globalRank, isPublic: true, isPlayOfDay: decision.isPlayOfDay,
      requestedUnits: 1, approvedUnits: 1, stakePolicyVersion: "v4-flat-1u-v1",
      approvalDecisionId: null, decidedAt: now,
    }).onConflictDoNothing();
  }
}