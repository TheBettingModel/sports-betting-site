import {
  stableHash,
  validateCanonicalV4Forecast,
  validateV4Evidence,
  type CanonicalV4Forecast,
  type SportEngineV4,
  type V4EvidenceEnvelope,
} from "./v4Platform";
import {
  materializeCurrentNcaafCandidateInput,
  ncaafCandidateExecutor,
  type MaterializedNcaafCandidateInput,
  type NcaafCandidateOutput,
} from "./guardedServing/ncaafCandidateExecutor";
import {
  NCAAF_V4_EXECUTABLE_ARTIFACT_HASH,
  NCAAF_V4_EXECUTABLE_DESCRIPTOR,
} from "./guardedServing/ncaafArtifactDescriptor";

type ExecutionResult = Readonly<{
  output: NcaafCandidateOutput;
  outputHash: string;
  executedAt: string;
}>;

export interface NcaafV4SharedAdapterDependencies {
  materialize?: (now: Date, requestedGameId: string) => Promise<MaterializedNcaafCandidateInput | null>;
  execute?: (input: MaterializedNcaafCandidateInput, now: Date) => Promise<ExecutionResult>;
}

type SharedNcaafEvidence = Readonly<{
  sharedGameId: string;
  materialized: MaterializedNcaafCandidateInput;
}>;

const identity = Object.freeze({
  sport: "NCAAF" as const,
  modelId: NCAAF_V4_EXECUTABLE_DESCRIPTOR.modelId,
  modelVersion: NCAAF_V4_EXECUTABLE_DESCRIPTOR.modelVersion,
  artifactHash: NCAAF_V4_EXECUTABLE_ARTIFACT_HASH,
  contractId: NCAAF_V4_EXECUTABLE_DESCRIPTOR.inputContractVersion,
  contractHash: stableHash({
    inputContractVersion: NCAAF_V4_EXECUTABLE_DESCRIPTOR.inputContractVersion,
    configurationHash: NCAAF_V4_EXECUTABLE_DESCRIPTOR.configurationHash,
    parameterHash: NCAAF_V4_EXECUTABLE_DESCRIPTOR.parameterHash,
  }),
});

function easternDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function assertCurrentEasternGame(input: MaterializedNcaafCandidateInput, now: Date): void {
  const kickoff = new Date(input.input.kickoffAt);
  if (!Number.isFinite(kickoff.getTime()) || kickoff <= now) {
    throw new Error("NCAAF_SHARED_ADAPTER_GAME_ALREADY_STARTED");
  }
  if (easternDate(kickoff) !== easternDate(now)) {
    throw new Error("NCAAF_SHARED_ADAPTER_CURRENT_EASTERN_DATE_ONLY");
  }
}

function assertExactEspnBinding(
  requestedGameId: string,
  materialized: MaterializedNcaafCandidateInput,
): void {
  const match = /^NCAAF-(\d+)$/.exec(requestedGameId);
  if (!match) throw new Error("NCAAF_SHARED_ADAPTER_EVENT_IDENTITY_MISMATCH");
  const espnEventId = match[1]!;
  const audit = materialized.input.sourceAudit;
  if (audit.targetProvider !== "espn"
    || audit.targetEventId !== espnEventId
    || materialized.input.stableGameId !== `espn:${espnEventId}`) {
    throw new Error("NCAAF_SHARED_ADAPTER_EVENT_IDENTITY_MISMATCH");
  }
}

export function createNcaafV4SharedAdapter(
  dependencies: NcaafV4SharedAdapterDependencies = {},
): SportEngineV4<MaterializedNcaafCandidateInput> {
  const materialize = dependencies.materialize ?? materializeCurrentNcaafCandidateInput;
  const execute = dependencies.execute ?? ((input, now) => ncaafCandidateExecutor.execute(input, now));

  const engine: SportEngineV4<MaterializedNcaafCandidateInput> = {
    identity,
    approvalState: "UNVALIDATED",
    maturity: "DEVELOPING",
    async collectEvidence(gameId, now) {
      const match = /^NCAAF-(\d+)$/.exec(gameId);
      if (!match) throw new Error("NCAAF_SHARED_ADAPTER_EVENT_IDENTITY_MISMATCH");
      const input = await materialize(now, match[1]!);
      if (!input) throw new Error("NCAAF_SHARED_ADAPTER_NO_ELIGIBLE_PIT_INPUT");
      assertExactEspnBinding(gameId, input);
      assertCurrentEasternGame(input, now);
      return Object.freeze({ sharedGameId: gameId, materialized: input });
    },
    async materializeInput(evidence, now) {
      const sharedEvidence = evidence as SharedNcaafEvidence;
      const materialized = sharedEvidence.materialized;
      assertCurrentEasternGame(materialized, now);
      assertExactEspnBinding(sharedEvidence.sharedGameId, materialized);
      const audit = materialized.input.sourceAudit;
      const sourceEvidenceTimes = [audit.evidenceMaxCapturedAt, audit.evidenceMaxModeledAt]
        .filter((value): value is string => typeof value === "string");
      const envelope = Object.freeze({
        gameId: sharedEvidence.sharedGameId,
        eventStart: materialized.input.kickoffAt,
        dataCutoff: materialized.input.featureCutoff,
        predictionTimestamp: materialized.materializedAt,
        sourceEvidenceTimes: Object.freeze(sourceEvidenceTimes.length
          ? sourceEvidenceTimes : [materialized.input.featureCutoff]),
        featureSnapshotId: materialized.snapshotId,
        featureHash: materialized.input.checksum,
        input: materialized,
      });
      validateV4Evidence(envelope);
      return envelope;
    },
    validateInput(envelope) {
      const gameId = envelope.gameId;
      assertExactEspnBinding(gameId, envelope.input);
      if (envelope.featureHash !== envelope.input.input.checksum
        || envelope.featureSnapshotId !== envelope.input.snapshotId
        || envelope.dataCutoff !== envelope.input.input.featureCutoff
        || envelope.eventStart !== envelope.input.input.kickoffAt) {
        throw new Error("NCAAF_SHARED_ADAPTER_EVIDENCE_IDENTITY_MISMATCH");
      }
      const validation = ncaafCandidateExecutor.validateInput(
        envelope.input,
        new Date(envelope.predictionTimestamp),
      );
      if (!validation.complete || !validation.pitSafe || !validation.leakageSafe || !validation.fresh) {
        throw new Error(`NCAAF_SHARED_ADAPTER_INPUT_REJECTED:${validation.reasons.join(",")}`);
      }
    },
    async predict(envelope) {
      const result = await execute(envelope.input, new Date(envelope.predictionTimestamp));
      const match = /^NCAAF-(\d+)$/.exec(envelope.gameId);
      if (!match || result.output.gameId !== `espn:${match[1]}`) {
        throw new Error("NCAAF_SHARED_ADAPTER_OUTPUT_IDENTITY_MISMATCH");
      }
      return Object.freeze({
        predictionId: result.output.predictionId,
        sport: "NCAAF",
        gameId: envelope.gameId,
        modelId: identity.modelId,
        modelVersion: identity.modelVersion,
        artifactHash: identity.artifactHash,
        contractId: identity.contractId,
        contractHash: identity.contractHash,
        featureSnapshotId: envelope.featureSnapshotId,
        featureHash: envelope.featureHash,
        dataCutoff: envelope.dataCutoff,
        predictionTimestamp: result.executedAt,
        approvalState: "UNVALIDATED",
        maturity: "DEVELOPING",
        homeWinProbability: result.output.homeWinProbability,
        awayWinProbability: result.output.awayWinProbability,
        expectedHomeScore: result.output.expectedHomePoints,
        expectedAwayScore: result.output.expectedAwayPoints,
        expectedMargin: result.output.expectedMargin,
        expectedTotal: result.output.expectedTotal,
        evidenceTier: result.output.dataQuality,
        qualityFlags: Object.freeze([
          "V4_VALIDATING",
          "NO_OFFICIAL_PLAY",
          "PREVIEW_ONLY",
          `EXECUTION_HASH:${result.outputHash}`,
        ]),
      });
    },
    validateOutput(output, envelope) {
      validateCanonicalV4Forecast(output, envelope, identity);
      if (output.approvalState !== "UNVALIDATED"
        || output.maturity !== "DEVELOPING"
        || !output.qualityFlags.includes("NO_OFFICIAL_PLAY")
        || output.predictionTimestamp !== envelope.predictionTimestamp) {
        throw new Error("NCAAF_SHARED_ADAPTER_PUBLICATION_BOUNDARY_VIOLATION");
      }
    },
  };
  return Object.freeze(engine);
}

export const ncaafV4SharedAdapter = createNcaafV4SharedAdapter();