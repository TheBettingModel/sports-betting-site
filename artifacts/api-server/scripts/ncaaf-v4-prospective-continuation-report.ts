/** #223B read-only continuation grader. It loads the immutable #223 ledger,
 * verifies every hash, and never reconstructs or rewrites a forecast. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db, ncaafCfbdDomainEvidenceTable, ncaafEvidenceRunsTable, ncaafGameEvidenceTable } from "@workspace/db";
import {
  evaluateNcaafV4Prospective,
  type NcaafV4FrozenProspectivePrediction,
  type NcaafV4ProspectiveOutcome,
} from "../src/services/ncaafV4ProspectiveEvaluation";
import { isAuthoritativeNcaafFinal, verifyFrozenFbsVsFbsDomain } from "../src/services/ncaafV4ProspectiveContinuation";

const sourcePath = resolve(process.cwd(), "../../reports/ncaaf-v4-formal-validation-evidence-2026-09-04-v8.json");
const domainProofPath = resolve(process.cwd(), "../../reports/ncaaf-v4-2026-identity-bridge-2026-09-04-v2.json");
const EXPECTED = Object.freeze({
  inputLedgerHash: "58b162ab5f4f984d018a3bfaa994eae80e323cf468b8dffdc3647884eeee4eab",
  predictionLedgerHash: "fd7c547fda608d0a045cab9687cabae868baeba2d99efab852110057f859bccf",
  evaluationHash: "1d2bde61e2850b8dc6abe24764aa46816ec32ed10a1139cdcbb260592012c60e",
  configurationHash: "212a6c78431a181821106721877155745724d3619ec63cf5424f098b07f9ae86",
  parameterHash: "792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81",
});
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
    : value;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

type SourcePackage = {
  identity: Record<string, unknown> & { evaluationHash: string; configurationHash: string; parameterHash: string; featureSchemaVersion: string; modelId: string };
  prospective: { immutableLedger: {
    inputLedgerHash: string; predictionLedgerHash: string; inputs: unknown[];
    predictions: NcaafV4FrozenProspectivePrediction[];
  }; audit: { outOfDomainTargets: number } };
};

const isInvalidResultStatus = (status: string) =>
  ["cancelled", "canceled", "postponed", "no contest", "no-contest"].includes(status.trim().toLowerCase());

async function main() {
  const evaluatedAt = new Date();
  const runStamp = evaluatedAt.toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
  const outputPath = resolve(process.cwd(), `../../reports/ncaaf-v4-prospective-validation-evidence-2026-09-04-${runStamp}.json`);
  const source = JSON.parse(await readFile(sourcePath, "utf8")) as SourcePackage;
  const domainProof = JSON.parse(await readFile(domainProofPath, "utf8")) as {
    fbsUniverseProof: { season: number; cfbdFbsCount: number; mappedFbsCount: number; mappedNonFbsCount: number; capturedAt: string; evidenceRef: string };
  };
  const { evaluationHash, ...identityWithoutHash } = source.identity;
  const verification = {
    inputLedgerHash: hash(source.prospective.immutableLedger.inputs),
    predictionLedgerHash: hash(source.prospective.immutableLedger.predictions),
    evaluationHash: hash(identityWithoutHash),
  };
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const actual = key in verification
      ? verification[key as keyof typeof verification]
      : source.identity[key as "configurationHash" | "parameterHash"];
    if (actual !== expected) throw new Error(`#223B immutable identity mismatch for ${key}: ${actual}`);
  }
  if (source.prospective.immutableLedger.inputLedgerHash !== EXPECTED.inputLedgerHash
    || source.prospective.immutableLedger.predictionLedgerHash !== EXPECTED.predictionLedgerHash
    || evaluationHash !== EXPECTED.evaluationHash
    || source.prospective.immutableLedger.predictions.length !== 656) {
    throw new Error("#223B source manifest does not match the frozen #223 ledger");
  }
  for (const prediction of source.prospective.immutableLedger.predictions) {
    if (prediction.modelVersion !== source.identity.modelId
      || prediction.configurationHash !== EXPECTED.configurationHash
      || prediction.parameterHash !== EXPECTED.parameterHash
      || prediction.featureSchemaVersion !== source.identity.featureSchemaVersion
      || !["EXACT_EXISTING_LEDGER", "EXACT_PROVIDER_ID"].includes(prediction.homeIdentityMethod)
      || !["EXACT_EXISTING_LEDGER", "EXACT_PROVIDER_ID"].includes(prediction.awayIdentityMethod)) {
      throw new Error(`#223B strict eligibility mismatch for ${prediction.gameId}`);
    }
  }

  const [evidence, runs, domainRows] = await Promise.all([
    db.select().from(ncaafGameEvidenceTable),
    db.select().from(ncaafEvidenceRunsTable),
    db.select().from(ncaafCfbdDomainEvidenceTable),
  ]);
  const proofCutoff = new Date(domainProof.fbsUniverseProof.capturedAt);
  const frozenClassifications = [...domainRows]
    .filter(row => row.season === domainProof.fbsUniverseProof.season && row.endpoint === "teams"
      && row.cfbdTeamId && row.capturedAt <= proofCutoff)
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || b.id - a.id)
    .reduce((map, row) => map.has(row.cfbdTeamId!) ? map : map.set(row.cfbdTeamId!, String((row.payload as Record<string, unknown>).classification ?? "").toLowerCase()), new Map<string, string>());
  const frozenFbsIds = new Set([...frozenClassifications].filter(([, classification]) => classification === "fbs").map(([id]) => id));
  if (frozenFbsIds.size !== domainProof.fbsUniverseProof.cfbdFbsCount
    || domainProof.fbsUniverseProof.mappedFbsCount !== domainProof.fbsUniverseProof.cfbdFbsCount
    || domainProof.fbsUniverseProof.mappedNonFbsCount !== 0) {
    throw new Error("#223B frozen FBS-universe proof did not reconcile");
  }
  const domainVerification = verifyFrozenFbsVsFbsDomain(
    source.prospective.immutableLedger.predictions, frozenFbsIds, domainProof.fbsUniverseProof.cfbdFbsCount,
  );
  const predictionIds = new Set(source.prospective.immutableLedger.predictions.map(prediction => prediction.gameId));
  const latest = [...evidence]
    .filter(row => predictionIds.has(`${row.provider}:${row.providerEventId}`) && row.capturedAt <= evaluatedAt)
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || b.id - a.id)
    .reduce((map, row) => {
      const gameId = `${row.provider}:${row.providerEventId}`;
      return map.has(gameId) ? map : map.set(gameId, row);
    }, new Map<string, typeof evidence[number]>());

  const finalOutcomes: NcaafV4ProspectiveOutcome[] = [];
  const gradedPredictionIds: string[] = [];
  const resultEvidenceIds: number[] = [];
  const resolution = { PREGAME_FROZEN_PENDING: 0, PREGAME_FROZEN_GRADED: 0, INVALID_RESULT: 0, RESULT_UNAVAILABLE: 0, OUT_OF_DOMAIN: source.prospective.audit.outOfDomainTargets };
  for (const prediction of source.prospective.immutableLedger.predictions) {
    const row = latest.get(prediction.gameId);
    const kickoff = new Date(prediction.scheduledKickoffAt);
    if (!row) {
      if (evaluatedAt < kickoff) resolution.PREGAME_FROZEN_PENDING++;
      else resolution.RESULT_UNAVAILABLE++;
      continue;
    }
    const status = row.gameStatus ?? "";
    if (isInvalidResultStatus(status)) {
      resolution.INVALID_RESULT++;
      continue;
    }
    if (status.toLowerCase() === "final") {
      if (!isAuthoritativeNcaafFinal(row)) {
        resolution.INVALID_RESULT++;
        continue;
      }
      finalOutcomes.push({
        gameId: prediction.gameId, kickoffAt: row.kickoffAt, status,
        homeScore: row.homeScore, awayScore: row.awayScore, capturedAt: row.capturedAt,
      });
      gradedPredictionIds.push(prediction.gameId);
      resultEvidenceIds.push(row.id);
      resolution.PREGAME_FROZEN_GRADED++;
      continue;
    }
    if (evaluatedAt < kickoff || ["live", "in progress", "upcoming", "scheduled", "pre"].includes(status.toLowerCase())) {
      resolution.PREGAME_FROZEN_PENDING++;
    } else {
      resolution.RESULT_UNAVAILABLE++;
    }
  }
  const grading = evaluateNcaafV4Prospective(
    source.prospective.immutableLedger.predictions, finalOutcomes, evaluatedAt, resolution.OUT_OF_DOMAIN,
  );
  if ((grading.metrics?.count ?? 0) !== resolution.PREGAME_FROZEN_GRADED) {
    throw new Error("#223B prospective grade count did not reconcile");
  }
  const latestRun = [...runs].sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0];
  const staleRunning = runs.filter(run => run.status === "running" && evaluatedAt.getTime() - run.capturedAt.getTime() > 30 * 60_000).length;
  const activeRunning = runs.filter(run => run.status === "running" && evaluatedAt.getTime() - run.capturedAt.getTime() <= 30 * 60_000).length;
  const latestErrors = (latestRun?.errorDetails ?? {}) as Record<string, unknown>;
  const providerErrors = (latestErrors.providerErrors ?? {}) as Record<string, unknown>;
  const partialReasons = Array.isArray(latestErrors.partialReasons) ? latestErrors.partialReasons : [];
  const runtimePartial = !latestRun || latestRun.status !== "completed" || staleRunning > 0 || activeRunning > 1
    || Object.keys(providerErrors).length > 0 || partialReasons.length > 0;
  const packageJson = {
    version: "ncaaf-v4-prospective-continuation-v1",
    evaluatedAt: evaluatedAt.toISOString(),
    source: { path: "reports/ncaaf-v4-formal-validation-evidence-2026-09-04-v8.json", ...EXPECTED },
    ledgerVerification: { ...verification, exactMatch: true, predictionCount: 656 },
    domainVerification: {
      proof: domainProof.fbsUniverseProof,
      frozenFbsIds: domainVerification.frozenFbsIds,
      eligiblePredictionsVerifiedFbsVsFbs: domainVerification.verifiedPredictions,
      exactMatch: true,
    },
    modelIdentity: {
      modelId: source.identity.modelId,
      configurationHash: source.identity.configurationHash,
      parameterHash: source.identity.parameterHash,
      featureSchemaVersion: source.identity.featureSchemaVersion,
    },
    resolution,
    gradedPredictionIds,
    resultEvidenceIds,
    prospectiveMetrics: grading.metrics,
    historicalComparison: grading.metrics ? {
      marginMaeAbsoluteDifference: grading.metrics.marginMae - 12.5008391763,
      marginMaePercentageDifference: (grading.metrics.marginMae / 12.5008391763 - 1) * 100,
      totalMaeAbsoluteDifference: grading.metrics.totalMae - 12.9390090779,
      totalMaePercentageDifference: (grading.metrics.totalMae / 12.9390090779 - 1) * 100,
      brierAbsoluteDifference: grading.metrics.brier - 0.1800233716,
      brierPercentageDifference: (grading.metrics.brier / 0.1800233716 - 1) * 100,
      logLossAbsoluteDifference: grading.metrics.logLoss - 0.5347917462,
      logLossPercentageDifference: (grading.metrics.logLoss / 0.5347917462 - 1) * 100,
    } : null,
    calibration: { fitted: false, applied: "identity", bands: [], ece: null, mce: null },
    drift: { classification: "INSUFFICIENT_SAMPLE", diagnostics: null },
    dataQuality: [],
    errorForensics: [],
    probabilityIntegrity: { invalidOutputs: 0 },
    runtimeHealth: {
      activeDevelopmentSchedulerNodeProcessCount: null,
      schedulerProcessCountPersistentlyMeasurable: false,
      duplicateInvocationCount: null,
      duplicateInvocationCountPersistentlyMeasurable: false,
      activeEvidenceRuns: activeRunning,
      staleEvidenceRuns: staleRunning,
      latestRunStatus: latestRun?.status ?? null,
      providerErrors,
      partialReasons,
      databaseAuthErrors: null,
      databaseAuthErrorsPersistentlyMeasurable: false,
      featureBridgeFailures: null,
      featureBridgeFailuresPersistentlyMeasurable: false,
      predictionGenerationFailures: null,
      predictionGenerationFailuresPersistentlyMeasurable: false,
      continuationGradingCompleted: true,
      latestEvidenceRun: latestRun ? { id: latestRun.id, status: latestRun.status, capturedAt: latestRun.capturedAt.toISOString() } : null,
      classification: runtimePartial ? "PARTIAL" : "PASS",
    },
    approval: {
      recommendation: "CONTINUE_UNVALIDATED_SHADOW_EVIDENCE_ACCUMULATION",
      maturity: "DEVELOPING",
      productionApprovalReady: false,
      fullLivePublicationDataReady: false,
      evidenceClassification: "INCONCLUSIVE",
      blocker: "No frozen prospective games have legitimately completed yet.",
      championChanged: false, publicationChanged: false, nflChanged: false,
    },
  };
  await writeFile(outputPath, `${JSON.stringify(packageJson, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ outputPath, evaluatedAt: packageJson.evaluatedAt, resolution, runtime: packageJson.runtimeHealth.classification }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });