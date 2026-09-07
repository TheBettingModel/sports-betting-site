import { createHash } from "node:crypto";

export const TBM_V4_SPORTS = Object.freeze([
  "MLB", "NCAAF", "NFL", "NBA", "WNBA", "NHL", "SOCCER", "UFC", "NCAAMB",
] as const);
export type TbmV4Sport = typeof TBM_V4_SPORTS[number];
export type V4ApprovalState =
  | "UNVALIDATED" | "SHADOW" | "PROVISIONAL" | "PRODUCTION_APPROVED" | "SUSPENDED";
export type V4Maturity = "EXPERIMENTAL" | "DEVELOPING" | "VALIDATED" | "MATURE";

export interface V4ArtifactIdentity {
  sport: TbmV4Sport;
  modelId: string;
  modelVersion: string;
  artifactHash: string;
  contractId: string;
  contractHash: string;
}

export interface V4EvidenceEnvelope<T> {
  gameId: string;
  eventStart: string;
  dataCutoff: string;
  predictionTimestamp: string;
  sourceEvidenceTimes: readonly string[];
  featureSnapshotId: string;
  featureHash: string;
  input: T;
}

export interface CanonicalV4Forecast {
  predictionId: string;
  sport: TbmV4Sport;
  gameId: string;
  modelId: string;
  modelVersion: string;
  artifactHash: string;
  contractId: string;
  contractHash: string;
  featureSnapshotId: string;
  featureHash: string;
  dataCutoff: string;
  predictionTimestamp: string;
  approvalState: V4ApprovalState;
  maturity: V4Maturity;
  homeWinProbability?: number;
  awayWinProbability?: number;
  drawProbability?: number;
  expectedHomeScore?: number;
  expectedAwayScore?: number;
  expectedMargin?: number;
  expectedTotal?: number;
  evidenceTier: string;
  qualityFlags: readonly string[];
}

export interface SportEngineV4<TInput = unknown> {
  readonly identity: V4ArtifactIdentity;
  readonly approvalState: V4ApprovalState;
  readonly maturity: V4Maturity;
  collectEvidence(gameId: string, now: Date): Promise<unknown>;
  materializeInput(evidence: unknown, now: Date): Promise<V4EvidenceEnvelope<TInput>>;
  validateInput(input: V4EvidenceEnvelope<TInput>): void;
  predict(input: V4EvidenceEnvelope<TInput>): Promise<CanonicalV4Forecast>;
  validateOutput(output: CanonicalV4Forecast, input: V4EvidenceEnvelope<TInput>): void;
}

export type V4RouteResult =
  | { disposition: "FORECAST"; forecast: CanonicalV4Forecast }
  | { disposition: "NO_FORECAST"; sport: TbmV4Sport; gameId: string; reason: string };

const MARKET_KEYS = /(?:^|_)(moneyline|spread|total|odds|implied_probability|opening_line|closing_line|clv|line_movement|sharp|consensus)(?:$|_)/i;
const OUTCOME_KEYS = /(?:^|_)(final_score|winner|result|actual_score|postgame)(?:$|_)/i;

function walkKeys(value: unknown, path = "input"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (MARKET_KEYS.test(key)) throw new Error(`MARKET_LEAKAGE:${path}.${key}`);
    if (OUTCOME_KEYS.test(key)) throw new Error(`OUTCOME_LEAKAGE:${path}.${key}`);
    walkKeys(child, `${path}.${key}`);
  }
}

function instant(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`INVALID_TIMESTAMP:${name}`);
  return parsed;
}

export function validateV4Evidence<T>(envelope: V4EvidenceEnvelope<T>): void {
  if (!envelope.sourceEvidenceTimes.length) throw new Error("MISSING_SOURCE_EVIDENCE");
  const cutoff = instant(envelope.dataCutoff, "dataCutoff");
  const prediction = instant(envelope.predictionTimestamp, "predictionTimestamp");
  const start = instant(envelope.eventStart, "eventStart");
  if (cutoff > prediction || prediction >= start
    || envelope.sourceEvidenceTimes.some((time) => instant(time, "sourceEvidenceTime") > cutoff)) {
    throw new Error("PIT_CHRONOLOGY_INVALID");
  }
  walkKeys(envelope.input);
}

export function validateCanonicalV4Forecast(
  output: CanonicalV4Forecast,
  input: V4EvidenceEnvelope<unknown>,
  identity: V4ArtifactIdentity,
): void {
  const exact = output.sport === identity.sport
    && output.modelId === identity.modelId
    && output.modelVersion === identity.modelVersion
    && output.artifactHash === identity.artifactHash
    && output.contractId === identity.contractId
    && output.contractHash === identity.contractHash
    && output.gameId === input.gameId
    && output.featureSnapshotId === input.featureSnapshotId
    && output.featureHash === input.featureHash
    && output.dataCutoff === input.dataCutoff;
  if (!exact) throw new Error("FORECAST_IDENTITY_MISMATCH");
  const probabilities = [
    output.homeWinProbability, output.drawProbability, output.awayWinProbability,
  ].filter((value): value is number => value !== undefined);
  if (probabilities.length) {
    if (probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
      || Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) > 1e-10) {
      throw new Error("FORECAST_PROBABILITY_INVALID");
    }
  }
  const scores = [output.expectedHomeScore, output.expectedAwayScore]
    .filter((value): value is number => value !== undefined);
  if (scores.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("FORECAST_SCORE_INVALID");
  }
}

export class V4EngineRegistry {
  private readonly engines = new Map<TbmV4Sport, SportEngineV4>();

  register(engine: SportEngineV4): void {
    if (!engine.identity.modelId.toLowerCase().includes("v4")) {
      throw new Error("LEGACY_MODEL_REGISTRATION_REJECTED");
    }
    if (this.engines.has(engine.identity.sport)) {
      throw new Error(`DUPLICATE_V4_ENGINE:${engine.identity.sport}`);
    }
    this.engines.set(engine.identity.sport, engine);
  }

  get(sport: TbmV4Sport): SportEngineV4 | null {
    return this.engines.get(sport) ?? null;
  }

  status(): Array<{
    sport: TbmV4Sport;
    technicallyReady: boolean;
    approvalState: V4ApprovalState;
    maturity: V4Maturity | null;
    modelId: string | null;
    artifactHash: string | null;
    publicationPermitted: boolean;
  }> {
    return TBM_V4_SPORTS.map((sport) => {
      const engine = this.get(sport);
      return {
        sport,
        technicallyReady: Boolean(engine),
        approvalState: engine?.approvalState ?? "UNVALIDATED",
        maturity: engine?.maturity ?? null,
        modelId: engine?.identity.modelId ?? null,
        artifactHash: engine?.identity.artifactHash ?? null,
        publicationPermitted: engine?.approvalState === "PRODUCTION_APPROVED",
      };
    });
  }
}

export async function routeV4Forecast(
  registry: V4EngineRegistry,
  sport: TbmV4Sport,
  gameId: string,
  now = new Date(),
): Promise<V4RouteResult> {
  const engine = registry.get(sport);
  if (!engine) return { disposition: "NO_FORECAST", sport, gameId, reason: "NO_REGISTERED_V4_ENGINE" };
  if (engine.approvalState === "SUSPENDED") {
    return { disposition: "NO_FORECAST", sport, gameId, reason: "V4_ENGINE_SUSPENDED" };
  }
  try {
    const evidence = await engine.collectEvidence(gameId, now);
    const input = await engine.materializeInput(evidence, now);
    validateV4Evidence(input);
    engine.validateInput(input);
    const first = await engine.predict(input);
    const second = await engine.predict(input);
    engine.validateOutput(first, input);
    validateCanonicalV4Forecast(first, input, engine.identity);
    if (stableHash(first) !== stableHash(second)) throw new Error("NONDETERMINISTIC_V4_OUTPUT");
    return { disposition: "FORECAST", forecast: first };
  } catch (error) {
    return {
      disposition: "NO_FORECAST",
      sport,
      gameId,
      reason: error instanceof Error ? error.message : "V4_EXECUTION_FAILED",
    };
  }
}

export function stableHash(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, normalize(child)]));
    }
    return item;
  };
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

export const canonicalV4EngineRegistry = new V4EngineRegistry();