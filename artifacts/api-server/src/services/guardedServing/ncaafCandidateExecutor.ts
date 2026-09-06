import { and, eq, gt, inArray, lt, lte } from "drizzle-orm";
import {
  db, ncaafCfbdTeamMappingsTable, ncaafFootballIntelligenceSnapshotsTable,
  ncaafGameEvidenceTable,
} from "@workspace/db";
import { assertNoNcaafMarketShapedKeys } from "../ncaafFootballIntelligenceSnapshots";
import {
  buildNcaafV42026FeatureBridge, NCAAF_V4_2026_FBS_UNIVERSE_PROOF,
  ncaafV42026InputChecksum, type NcaafSafeTeamMapping, type NcaafV42026ChallengerInput,
} from "../ncaafV42026FeatureBridge";
import { predictFrozenNcaafV4 } from "../ncaafV4GameDay";
import type { V4Prediction } from "../ncaafV4ExpectedScore";
import { NCAAF_V4_DATASET_VERSION, NCAAF_V4_FEATURE_SCHEMA_VERSION } from "../ncaafV4ExpectedScore";
import {
  canonicalExecutionHash, candidateExecutorRegistry, type CandidateExecutor, type CandidateExecutorRegistry,
  type CandidateInputEvidence,
} from "./executorRegistry";
import { NCAAF_V4_EXECUTABLE_ARTIFACT_HASH, NCAAF_V4_EXECUTABLE_DESCRIPTOR } from "./ncaafArtifactDescriptor";

export interface NcaafCandidateOutput {
  readonly predictionId: string;
  readonly gameId: string;
  readonly modelVersion: string;
  readonly datasetVersion: string;
  readonly featureSchemaVersion: string;
  readonly featureCutoff: string;
  readonly expectedHomePoints: number;
  readonly expectedAwayPoints: number;
  readonly expectedMargin: number;
  readonly expectedTotal: number;
  readonly homeWinProbability: number;
  readonly awayWinProbability: number;
  readonly marginUncertainty: number;
  readonly totalUncertainty: number;
  readonly dataQuality: V4Prediction["dataQuality"];
  readonly configurationHash: string;
  readonly parameterHash: string;
}

export type MaterializedNcaafCandidateInput = Readonly<{
  snapshotId: string;
  input: NcaafV42026ChallengerInput;
  materializedAt: string;
}>;

const sha256 = /^[a-f0-9]{64}$/;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function evidenceFor(value: MaterializedNcaafCandidateInput, now = new Date()): CandidateInputEvidence {
  const reasons: string[] = [];
  const input = value?.input;
  if (!input || input.season !== 2026) reasons.push("INVALID_SEASON_OR_INPUT");
  if (!input || !sha256.test(input.checksum)) reasons.push("INVALID_INPUT_CHECKSUM");
  const cutoff = new Date(input?.featureCutoff ?? "");
  const kickoff = new Date(input?.kickoffAt ?? "");
  if (!Number.isFinite(cutoff.getTime()) || !Number.isFinite(kickoff.getTime()) || !(cutoff < kickoff) || cutoff > now) {
    reasons.push("INVALID_PREGAME_CUTOFF");
  }
  if (input?.sourceAudit?.targetResultUsed !== false
    || input?.sourceAudit?.featureFreeze !== "replayNcaafChronologically_before_targets") {
    reasons.push("PIT_SOURCE_AUDIT_FAILED");
  }
  const audit = input?.sourceAudit ?? {};
  const replayRowChecksum = typeof audit.replayRowChecksum === "string" ? audit.replayRowChecksum : "";
  if (!replayRowChecksum || input?.checksum !== ncaafV42026InputChecksum(replayRowChecksum, input.featureCutoff)) reasons.push("CANONICAL_INPUT_CHECKSUM_MISMATCH");
  if (String(audit.snapshotId ?? "") !== String(value?.snapshotId ?? "")
    || audit.snapshotKickoffAt !== input?.kickoffAt || audit.snapshotDataCutoffAt !== input?.featureCutoff
    || audit.targetProvider == null || audit.targetEventId == null
    || `${audit.targetProvider}:${audit.targetEventId}` !== input?.stableGameId) reasons.push("SNAPSHOT_PROVENANCE_MISMATCH");
  for (const sourceTime of [audit.evidenceMaxCapturedAt, audit.evidenceMaxModeledAt]) {
    if (sourceTime != null && !(new Date(String(sourceTime)) < cutoff)) reasons.push("POST_CUTOFF_SOURCE_EVIDENCE");
  }
  try {
    assertNoNcaafMarketShapedKeys(input?.features, "candidateExecutor.input.features");
  } catch {
    reasons.push("MARKET_LEAKAGE");
  }
  return Object.freeze({
    snapshotId: String(value?.snapshotId ?? ""),
    inputHash: String(input?.checksum ?? ""),
    featureCutoff: input?.featureCutoff ?? "",
    materializedAt: value?.materializedAt ?? "",
    pitSafe: !reasons.some(reason => reason.includes("PIT") || reason.includes("CUTOFF")),
    leakageSafe: !reasons.includes("MARKET_LEAKAGE"),
    fresh: kickoff > now,
    complete: reasons.length === 0 && Boolean(input?.stableGameId && value?.snapshotId),
    reasons: Object.freeze(reasons),
  });
}

const exactIdentity = Object.freeze({ ...NCAAF_V4_EXECUTABLE_DESCRIPTOR, artifactHash: NCAAF_V4_EXECUTABLE_ARTIFACT_HASH });
export const ncaafCandidateExecutor: CandidateExecutor<MaterializedNcaafCandidateInput, NcaafCandidateOutput> = {
  identity: Object.freeze({
    sport: exactIdentity.sport,
    modelFamily: exactIdentity.modelFamily,
    modelId: exactIdentity.modelId,
    modelVersion: exactIdentity.modelVersion,
    artifactId: exactIdentity.artifactId,
    artifactHash: exactIdentity.artifactHash,
    inputContractVersion: exactIdentity.inputContractVersion,
    configurationHash: exactIdentity.configurationHash,
    parameterHash: exactIdentity.parameterHash,
    supportedMarkets: Object.freeze({
      moneyline: "EXECUTOR_SUPPORTED",
      spread: "DERIVABLE_BUT_NOT_APPROVED",
      total: "DERIVABLE_BUT_NOT_APPROVED",
    }),
  }),
  reproducibility: Object.freeze({
    deterministic: true, comparison: "EXACT_CANONICAL_OUTPUT_HASH", tolerance: 0,
    runtime: "predictFrozenNcaafV4",
  }),
  async health() {
    const valid = exactIdentity.configurationHash === NCAAF_V4_EXECUTABLE_DESCRIPTOR.configurationHash
      && exactIdentity.parameterHash === NCAAF_V4_EXECUTABLE_DESCRIPTOR.parameterHash
      && exactIdentity.inputContractVersion === NCAAF_V4_FEATURE_SCHEMA_VERSION;
    return Object.freeze({
      status: valid ? "HEALTHY" as const : "UNHEALTHY" as const,
      reproducibilityReady: valid,
      reason: valid ? "EXACT_FROZEN_ARTIFACT_READY" : "FROZEN_ARTIFACT_IDENTITY_MISMATCH",
      checkedAt: new Date().toISOString(),
    });
  },
  validateInput(input, now) {
    return evidenceFor(input as MaterializedNcaafCandidateInput, now);
  },
  validateOutput(output): asserts output is NcaafCandidateOutput {
    const candidate = output as Partial<NcaafCandidateOutput>;
    const numeric = [candidate.expectedHomePoints, candidate.expectedAwayPoints, candidate.expectedMargin,
      candidate.expectedTotal, candidate.homeWinProbability, candidate.awayWinProbability,
      candidate.marginUncertainty, candidate.totalUncertainty];
    if (candidate.modelVersion !== exactIdentity.modelVersion
      || candidate.featureSchemaVersion !== NCAAF_V4_FEATURE_SCHEMA_VERSION
      || candidate.datasetVersion !== NCAAF_V4_DATASET_VERSION
      || candidate.configurationHash !== exactIdentity.configurationHash
      || candidate.parameterHash !== exactIdentity.parameterHash
      || numeric.some(value => !finite(value))
      || (candidate.homeWinProbability ?? -1) < 0 || (candidate.homeWinProbability ?? 2) > 1
      || (candidate.awayWinProbability ?? -1) < 0 || (candidate.awayWinProbability ?? 2) > 1
      || Math.abs((candidate.homeWinProbability ?? 0) + (candidate.awayWinProbability ?? 0) - 1) > 1e-12
      || Math.abs((candidate.expectedMargin ?? 0) - ((candidate.expectedHomePoints ?? 0) - (candidate.expectedAwayPoints ?? 0))) > 1e-12
      || Math.abs((candidate.expectedTotal ?? 0) - ((candidate.expectedHomePoints ?? 0) + (candidate.expectedAwayPoints ?? 0))) > 1e-12) {
      throw new Error("NCAAF candidate output failed exact artifact/schema validation");
    }
  },
  async execute(materialized, now = new Date()) {
    const evidence = evidenceFor(materialized, now);
    if (!evidence.complete || !evidence.pitSafe || !evidence.leakageSafe || !evidence.fresh) {
      throw new Error(`NCAAF candidate input rejected: ${evidence.reasons.join(",") || "NOT_FRESH"}`);
    }
    const raw = predictFrozenNcaafV4(materialized.input);
    const output: NcaafCandidateOutput = Object.freeze({
      predictionId: raw.predictionId, gameId: raw.gameId, modelVersion: raw.modelVersion,
      datasetVersion: raw.datasetVersion, featureSchemaVersion: raw.featureSchemaVersion,
      featureCutoff: raw.featureCutoff, expectedHomePoints: raw.expectedHomePoints,
      expectedAwayPoints: raw.expectedAwayPoints, expectedMargin: raw.expectedMargin,
      expectedTotal: raw.expectedTotal, homeWinProbability: raw.homeWinProbability,
      awayWinProbability: raw.awayWinProbability, marginUncertainty: raw.marginUncertainty,
      totalUncertainty: raw.totalUncertainty, dataQuality: raw.dataQuality,
      configurationHash: String(raw.diagnostics.configurationHash),
      parameterHash: String(raw.diagnostics.parameterHash),
    });
    ncaafCandidateExecutor.validateOutput(output);
    if (output.predictionId !== raw.predictionId || output.gameId !== materialized.input.stableGameId
      || output.featureCutoff !== materialized.input.featureCutoff) {
      throw new Error("NCAAF candidate output does not bind to its exact input");
    }
    return Object.freeze({ output, outputHash: canonicalExecutionHash(output), executedAt: now.toISOString(), evidence });
  },
};

/** Shared authentic execution path for dry-run evidence and central serving. */
export async function executeCurrentNcaafCandidateTwice(now: Date, espnEventId?: string) {
  const materialized = await materializeCurrentNcaafCandidateInput(now, espnEventId);
  const health = await ncaafCandidateExecutor.health();
  if (!materialized) return { materialized: null, first: null, second: null, health };
  const first = await ncaafCandidateExecutor.execute(materialized, now);
  const second = await ncaafCandidateExecutor.execute(materialized, now);
  if (first.outputHash !== second.outputHash) throw new Error("NCAAF candidate reproducibility comparison failed");
  return { materialized, first, second, health };
}

/** Explicit idempotent bootstrap; duplicate foreign registrations fail closed. */
export function registerNcaafCandidateExecutor(registry: CandidateExecutorRegistry = candidateExecutorRegistry): void {
  const existing = registry.resolve({ ...exactIdentity, market: "moneyline" });
  if (existing === ncaafCandidateExecutor) return;
  if (existing) throw new Error("NCAAF exact executor identity is already owned by another executor");
  registry.register(ncaafCandidateExecutor);
}

/** Fresh authoritative materialization. It does not read board, preview prediction,
 * model_prediction, official identity, pick, notification, analytics, or result tables. */
export async function materializeCurrentNcaafCandidateInput(
  now = new Date(), requestedGameId?: string,
): Promise<MaterializedNcaafCandidateInput | null> {
  const snapshots = await db.select().from(ncaafFootballIntelligenceSnapshotsTable).where(and(
    eq(ncaafFootballIntelligenceSnapshotsTable.season, 2026),
    gt(ncaafFootballIntelligenceSnapshotsTable.kickoffAt, now),
    lte(ncaafFootballIntelligenceSnapshotsTable.dataCutoffAt, now),
    lt(ncaafFootballIntelligenceSnapshotsTable.dataCutoffAt, ncaafFootballIntelligenceSnapshotsTable.kickoffAt),
  ));
  const eventIds = [...new Set(snapshots.map(row => row.targetEventId))];
  const [history, mappings] = await Promise.all([
    db.select().from(ncaafGameEvidenceTable).where(and(
      inArray(ncaafGameEvidenceTable.season, [2025, 2026]),
      eq(ncaafGameEvidenceTable.gameStatus, "final"),
      lt(ncaafGameEvidenceTable.kickoffAt, now),
    )),
    db.select().from(ncaafCfbdTeamMappingsTable).where(eq(ncaafCfbdTeamMappingsTable.season, 2026)),
  ]);
  if (!eventIds.length) return null;
  const bridge = buildNcaafV42026FeatureBridge({
    snapshots, evidence: history,
    mappings: mappings.map(row => ({ ...row, ...(row.evidence as object) })) as NcaafSafeTeamMapping[],
    fbsUniverseProof: NCAAF_V4_2026_FBS_UNIVERSE_PROOF, assessedAt: now,
  });
  const selected = bridge.inputs
    .filter(input => !requestedGameId
      || input.stableGameId === requestedGameId
      || input.stableGameId.endsWith(`:${requestedGameId}`))
    .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))[0];
  if (!selected) return null;
  const snapshot = snapshots.find(row =>
    `${row.targetProvider}:${row.targetEventId}` === selected.stableGameId
    && row.dataCutoffAt.toISOString() === selected.featureCutoff);
  if (!snapshot) throw new Error("Authoritative NCAAF bridge input lost exact snapshot identity");
  return Object.freeze({ snapshotId: String(snapshot.id), input: selected, materializedAt: now.toISOString() });
}

export type NcaafOfficialDownstreamValues = Readonly<{
  modelVersionId: number; odds: number; impliedProbability: number; edge: number;
  confidence: string; recommendation: string; units: number; podScore: number; finalRating: number;
}>;

/** Pure bridge only. It has no DB handle and cannot persist. A caller must supply
 * no downstream values.  The old optional argument remains source-compatible
 * but is deliberately ignored: caller-provided numbers are not evidence.
 * Exact registry and market resolution live in ncaafMoneylineBridge. */
export function buildNcaafModelPredictionBridge(
  output: NcaafCandidateOutput, snapshotId: string, executionTimestamp: string,
  _downstream?: NcaafOfficialDownstreamValues,
) {
  return Object.freeze({
    persisted: false as const,
    persistenceReady: false,
    blockers: Object.freeze([
      "EXACT_MODEL_VERSION_FOREIGN_KEY_UNRESOLVED",
      "MARKET_ODDS_IMPLIED_EDGE_UNAVAILABLE",
      "RISK_CONFIDENCE_RECOMMENDATION_UNAVAILABLE",
      "UNIVERSAL_RATING_AND_POD_UNAVAILABLE",
    ]),
    modelPrediction: Object.freeze({
      id: { status: "UNAVAILABLE" as const, value: null, reason: "DRY_RUN_NEVER_PERSISTS_MODEL_PREDICTIONS" },
      modelVersionId: { status: "UNAVAILABLE" as const, value: null, reason: "EXACT_MODEL_VERSION_FOREIGN_KEY_UNRESOLVED" },
      featureSnapshotId: { status: "AVAILABLE" as const, value: snapshotId, reason: null },
      rawEvidence: { status: "AVAILABLE" as const, value: output, reason: null },
      marketOdds: { status: "UNAVAILABLE" as const, value: null, reason: "MARKET_NOT_PART_OF_MODEL_INPUT" },
      impliedProbability: { status: "UNAVAILABLE" as const, value: null, reason: "MARKET_NOT_PART_OF_MODEL_INPUT" },
      edge: { status: "UNAVAILABLE" as const, value: null, reason: "MARKET_NOT_PART_OF_MODEL_INPUT" },
      confidence: { status: "UNAVAILABLE" as const, value: null, reason: "RISK_POLICY_NOT_EXECUTED" },
      recommendation: { status: "UNAVAILABLE" as const, value: null, reason: "RISK_POLICY_NOT_EXECUTED" },
      units: { status: "UNAVAILABLE" as const, value: null, reason: "RISK_POLICY_NOT_EXECUTED" },
      podScore: { status: "UNAVAILABLE" as const, value: null, reason: "UNIVERSAL_PIPELINE_INPUT_UNAVAILABLE" },
      finalRating: { status: "UNAVAILABLE" as const, value: null, reason: "UNIVERSAL_PIPELINE_INPUT_UNAVAILABLE" },
    }),
    gameId: output.gameId,
    sport: "NCAAF" as const,
    market: "moneyline" as const,
    selection: output.homeWinProbability >= .5 ? "home" as const : "away" as const,
    modelProbability: Math.max(output.homeWinProbability, output.awayWinProbability),
    expectedHomePoints: output.expectedHomePoints,
    expectedAwayPoints: output.expectedAwayPoints,
    projectedSpread: -output.expectedMargin,
    projectedTotal: output.expectedTotal,
    modelVersion: output.modelVersion,
    inputVersion: output.featureSchemaVersion,
    featureCutoff: output.featureCutoff,
    executionTimestamp,
  });
}

export const toDryRunModelPredictionBridge = (
  output: NcaafCandidateOutput, snapshotId: string, executionTimestamp: string,
) => buildNcaafModelPredictionBridge(output, snapshotId, executionTimestamp);