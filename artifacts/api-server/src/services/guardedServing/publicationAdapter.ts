import type { ApprovalState, EngineIdentity, MlbResolution, NcaafResolution } from "./types";

export const GUARDED_PUBLICATION_ADAPTER_VERSION = "guarded-publication-adapter-v1";
export const UNIVERSAL_PIPELINE_ADAPTER_VERSION = "universal-pipeline-adapter-v1";

export interface NextGenPublicationInput {
  sport: "MLB" | "NCAAF";
  gameId: string;
  market: string;
  selection: string;
  line: number | null;
  odds: number | null;
  sportsbook: string | null;
  modelProbability: number;
  impliedProbability: number | null;
  edge: number;
  confidence: string;
  recommendation: string;
  units: number;
  rawEvidence: Readonly<Record<string, unknown>>;
  identity: EngineIdentity;
}

export interface UniversalPipelineValue<T> {
  status: "AVAILABLE" | "UNAVAILABLE";
  value: T | null;
  reason: string | null;
}

export interface AdaptedPublication {
  adapterVersion: typeof GUARDED_PUBLICATION_ADAPTER_VERSION;
  universalAdapterVersion: typeof UNIVERSAL_PIPELINE_ADAPTER_VERSION;
  gameId: string;
  sport: string;
  market: string;
  selection: string;
  line: number | null;
  odds: number | null;
  sportsbook: string | null;
  modelProbability: number;
  impliedProbability: number | null;
  edge: number;
  confidence: string;
  recommendation: string;
  units: number;
  identity: EngineIdentity;
  universal: {
    marketIntelligence: UniversalPipelineValue<unknown>;
    finalRating: UniversalPipelineValue<number>;
    podScore: UniversalPipelineValue<number>;
    sportsbookComparison: UniversalPipelineValue<unknown>;
    sharpBookAnalysis: UniversalPipelineValue<unknown>;
    lineShopping: UniversalPipelineValue<unknown>;
    marketIntelligenceGrade: UniversalPipelineValue<string>;
    finalModelTier: UniversalPipelineValue<string>;
    finalRecommendation: UniversalPipelineValue<string>;
  };
  rawEvidenceReference: Readonly<Record<string, unknown>>;
}

const unavailable = <T>(reason: string): UniversalPipelineValue<T> => ({
  status: "UNAVAILABLE", value: null, reason,
});
const available = <T>(value: T): UniversalPipelineValue<T> => ({
  status: "AVAILABLE", value, reason: null,
});

function isCandidateResolution(resolution: MlbResolution | NcaafResolution): boolean {
  return ["V4_GUARDED", "V4_FULL", "NEXTGEN_GUARDED", "NEXTGEN_FULL"].includes(resolution.kind);
}

/** Adapts at the publication boundary and retains the raw evidence by reference. */
export function adaptApprovedNextGenOutput(
  input: NextGenPublicationInput,
  resolution: MlbResolution | NcaafResolution,
): AdaptedPublication | null {
  if (!isCandidateResolution(resolution)) return null;
  const approved: ApprovalState[] = resolution.kind.endsWith("_FULL")
    ? ["FULL_APPROVED", "PRODUCTION_APPROVED"]
    : ["GUARDED_APPROVED", "FULL_APPROVED", "PRODUCTION_APPROVED"];
  if (!approved.includes(input.identity.approvalStatus)) return null;
  return Object.freeze({
    adapterVersion: GUARDED_PUBLICATION_ADAPTER_VERSION,
    universalAdapterVersion: UNIVERSAL_PIPELINE_ADAPTER_VERSION,
    gameId: input.gameId,
    sport: input.sport,
    market: input.market,
    selection: input.selection,
    line: input.line,
    odds: input.odds,
    sportsbook: input.sportsbook,
    modelProbability: input.modelProbability,
    impliedProbability: input.impliedProbability,
    edge: input.edge,
    confidence: input.confidence,
    recommendation: input.recommendation,
    units: input.units,
    identity: input.identity,
    universal: {
      marketIntelligence: unavailable<unknown>("NEXTGEN_SEMANTIC_MAPPING_NOT_IMPLEMENTED"),
      finalRating: unavailable<number>("NEXTGEN_SEMANTIC_MAPPING_NOT_IMPLEMENTED"),
      podScore: unavailable<number>("NEXTGEN_SEMANTIC_MAPPING_NOT_IMPLEMENTED"),
      sportsbookComparison: input.sportsbook ? available({ sportsbook: input.sportsbook, odds: input.odds }) : unavailable("SPORTSBOOK_UNAVAILABLE"),
      sharpBookAnalysis: unavailable<unknown>("SHARP_BOOK_EVIDENCE_UNAVAILABLE"),
      lineShopping: unavailable<unknown>("MULTIBOOK_COMPARISON_UNAVAILABLE"),
      marketIntelligenceGrade: unavailable<string>("NEXTGEN_SEMANTIC_MAPPING_NOT_IMPLEMENTED"),
      finalModelTier: unavailable<string>("NEXTGEN_SEMANTIC_MAPPING_NOT_IMPLEMENTED"),
      finalRecommendation: available(input.recommendation),
    },
    rawEvidenceReference: input.rawEvidence,
  });
}

export function dryRunDisposition(
  resolution: MlbResolution | NcaafResolution,
  adapted: AdaptedPublication | null,
): "WOULD_SERVE" | "WOULD_FALLBACK" | "WOULD_PASS" {
  if (adapted) return "WOULD_SERVE";
  if (resolution.fallbackUsed) return "WOULD_FALLBACK";
  return "WOULD_PASS";
}