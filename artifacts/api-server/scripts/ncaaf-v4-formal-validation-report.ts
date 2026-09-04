/** Development-only #223 immutable evidence generator. All database reads are
 * read-only; the sole write is a new wx report artifact. */
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  db, ncaafCfbdDomainEvidenceTable, ncaafCfbdTeamMappingsTable,
  ncaafFootballIntelligenceSnapshotsTable, ncaafGameEvidenceTable,
} from "@workspace/db";
import { buildNcaafV42026FeatureBridge } from "../src/services/ncaafV42026FeatureBridge";
import { loadNcaafV4TrainingRows } from "../src/services/ncaafV4TrainingLoader";
import { trainNcaafV4, type V4Row } from "../src/services/ncaafV4ExpectedScore";
import { validateNcaafV4Formal } from "../src/services/ncaafV4FormalValidator";
import { evaluateNcaafV4Prospective } from "../src/services/ncaafV4ProspectiveEvaluation";

const report = resolve(process.cwd(), "../../reports/ncaaf-v4-formal-validation-evidence-2026-09-04-v8.json");
const bridgeAssessedAt = new Date("2026-09-04T14:15:00.000Z");
const evaluatedAt = new Date("2026-09-04T14:15:00.000Z");
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
    : value;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

async function main() {
  const [rows, snapshots, evidence, mappings, domainEvidence] = await Promise.all([
    loadNcaafV4TrainingRows(),
    db.select().from(ncaafFootballIntelligenceSnapshotsTable),
    db.select().from(ncaafGameEvidenceTable),
    db.select().from(ncaafCfbdTeamMappingsTable),
    db.select().from(ncaafCfbdDomainEvidenceTable),
  ]);
  const formal = validateNcaafV4Formal(rows);
  const trained = trainNcaafV4(rows);
  const latestTeams = [...domainEvidence]
    .filter(row => row.season === 2026 && row.endpoint === "teams" && row.cfbdTeamId)
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || b.id - a.id)
    .reduce((map, row) => map.has(row.cfbdTeamId!) ? map : map.set(row.cfbdTeamId!, row), new Map<string, typeof domainEvidence[number]>());
  const latestMappings = [...mappings].filter(row => row.season === 2026)
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || b.id - a.id)
    .reduce((map, row) => map.has(row.cfbdTeamId) ? map : map.set(row.cfbdTeamId, row), new Map<string, typeof mappings[number]>());
  const classification = (row: typeof domainEvidence[number]) =>
    String((row.payload as Record<string, unknown>).classification ?? "").toLowerCase();
  const fbs = [...latestTeams.values()].filter(row => classification(row) === "fbs");
  const nonFbs = [...latestTeams.values()].filter(row => classification(row) !== "fbs");
  const isMapped = (row: typeof mappings[number] | undefined) => row?.state === "MAPPED" && !!row.canonicalTeamId;
  const proofCapturedAt = new Date(Math.max(
    ...fbs.map(row => row.capturedAt.getTime()),
    ...[...latestMappings.values()].map(row => row.capturedAt.getTime()),
  ));
  const fbsUniverseProof = {
    season: 2026 as const, cfbdFbsCount: fbs.length,
    mappedFbsCount: fbs.filter(row => isMapped(latestMappings.get(row.cfbdTeamId!))).length,
    mappedNonFbsCount: nonFbs.filter(row => isMapped(latestMappings.get(row.cfbdTeamId!))).length,
    capturedAt: proofCapturedAt,
    evidenceRef: `cfbd-teams-2026:${fbs.length}:${proofCapturedAt.toISOString()}`,
  };
  const bridge = buildNcaafV42026FeatureBridge({
    snapshots, evidence, mappings, fbsUniverseProof, assessedAt: bridgeAssessedAt,
    predict: input => trained.predict({ ...input, targets: { homeWin: 0, homeMargin: 0, totalPoints: 0 } } as V4Row),
  });
  const kickoffByGame = new Map(bridge.inputs.map(input => [input.stableGameId, new Date(input.kickoffAt).toISOString()]));
  const frozenPredictions = bridge.predictions.map(prediction => {
    const scheduledKickoffAt = kickoffByGame.get(prediction.gameId);
    if (!scheduledKickoffAt) throw new Error(`Missing frozen kickoff for ${prediction.gameId}`);
    return { ...prediction, scheduledKickoffAt };
  });
  const newestOutcome = [...evidence].filter(row => row.season === 2026 && row.kickoffAt)
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())
    .reduce((map, row) => {
      const gameId = `${row.provider}:${row.providerEventId}`;
      return map.has(gameId) ? map : map.set(gameId, {
        gameId, kickoffAt: row.kickoffAt!, status: row.gameStatus ?? "",
        homeScore: row.homeScore, awayScore: row.awayScore, capturedAt: row.capturedAt,
      });
    }, new Map<string, { gameId: string; kickoffAt: Date; status: string; homeScore: number | null; awayScore: number | null; capturedAt: Date }>());
  const prospective = evaluateNcaafV4Prospective(
    frozenPredictions, [...newestOutcome.values()], evaluatedAt, bridge.audit.outOfDomainTargets,
  );
  const invalidBridgeProbabilities = bridge.predictions.filter(prediction =>
    ![prediction.homeWinProbability, prediction.awayWinProbability, prediction.expectedHomePoints,
      prediction.expectedAwayPoints, prediction.marginUncertainty, prediction.totalUncertainty].every(Number.isFinite)
    || Math.abs(prediction.homeWinProbability + prediction.awayWinProbability - 1) > 1e-9
    || prediction.homeWinProbability <= 0 || prediction.homeWinProbability >= 1
    || prediction.marginUncertainty <= 0 || prediction.totalUncertainty <= 0).length;
  const packageJson = {
    identity: formal.identity,
    frozenModel: formal.actualIdentity,
    historical: {
      baselineComparison: {
        rows: formal.baselineComparison,
        probabilityMetricWarning: "Baseline table uses the original fixed-sigma comparison only. Baseline D probability metrics here are deprecated and must not replace canonical final-uncertainty metrics.",
        canonicalBaselineDProbabilityMetrics: {
          validationBrier: formal.validation.metrics.brier, validationLogLoss: formal.validation.metrics.logLoss,
          oosBrier: formal.oos.metrics.brier, oosLogLoss: formal.oos.metrics.logLoss,
        },
      },
      validation: formal.validation,
      oos: formal.oos, calibration: formal.calibration, integrity: formal.integrity,
      audit: formal.audit, gates: formal.gates,
    },
    prospective: {
      bridgeVersion: bridge.version, bridgeAssessedAt: bridgeAssessedAt.toISOString(),
      immutableLedger: {
        frozenAt: bridgeAssessedAt.toISOString(),
        earliestKickoffAt: bridge.inputs.map(input => new Date(input.kickoffAt).toISOString()).sort()[0],
        inputLedgerHash: hash(bridge.inputs),
        predictionLedgerHash: hash(frozenPredictions),
        sourceSnapshotIdsHash: hash(bridge.predictions.map(prediction => prediction.snapshotId).sort((a, b) => a - b)),
        modelIdentityHash: hash(formal.actualIdentity),
        inputs: bridge.inputs,
        predictions: frozenPredictions,
      },
      frozenPredictions: bridge.predictions.length, eligibleInputs: bridge.inputs.length,
      audit: bridge.audit, grading: prospective, invalidProbabilityOutputs: invalidBridgeProbabilities,
      incumbentComparison: { sampleCount: 0, status: "UNAVAILABLE_NO_COMPARABLE_V4_MODEL_PREDICTION_ROWS" },
      marketComparisonSandbox: { sampleCount: 0, status: "NOT_EVALUATED_NO_GRADED_PROSPECTIVE_GAMES" },
      clvEvaluation: { sampleCount: 0, status: "NOT_AVAILABLE_AND_NOT_USED" },
    },
    recommendation: {
      calibration: {
        selectedHistoricalCandidate: formal.calibration.selected,
        applied: "identity",
        decision: "NO_CHANGE_PENDING_PROSPECTIVE_EVIDENCE",
      },
      approvalState: "SHADOW_RECOMMENDED_NOT_APPLIED",
      maturity: "DEVELOPING",
      productionApprovalReady: false,
      blocker: "No frozen 2026 games have completed; prospective performance sample is 0.",
      championChanged: false, publicationChanged: false,
    },
  };
  await mkdir(resolve(report, ".."), { recursive: true });
  await writeFile(report, `${JSON.stringify(packageJson, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({
    report, historicalGate: formal.gates.pass, calibration: formal.calibration.selected,
    frozen: bridge.predictions.length, prospectiveGraded: prospective.cohorts.PREGAME_FROZEN_GRADED,
    invalidProbabilityOutputs: invalidBridgeProbabilities,
  }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });