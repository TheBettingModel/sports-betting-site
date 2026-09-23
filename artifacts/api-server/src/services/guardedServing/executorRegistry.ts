import { createHash } from "node:crypto";
import type { ExactArtifactIdentity } from "./types";

export type CandidateMarketSupport =
  | "EXECUTOR_SUPPORTED"
  | "DERIVABLE_BUT_NOT_APPROVED"
  | "NOT_SUPPORTED"
  | "LEGACY_ONLY";

export interface CandidateExecutorIdentity extends Omit<ExactArtifactIdentity, "market"> {
  readonly supportedMarkets: Readonly<Record<string, CandidateMarketSupport>>;
}

export interface CandidateInputEvidence {
  readonly snapshotId: string;
  readonly inputHash: string;
  readonly featureCutoff: string;
  readonly materializedAt: string;
  readonly pitSafe: boolean;
  readonly leakageSafe: boolean;
  readonly fresh: boolean;
  readonly complete: boolean;
  readonly reasons: readonly string[];
}

export interface CandidateExecutorHealth {
  readonly status: "HEALTHY" | "UNHEALTHY";
  readonly reproducibilityReady: boolean;
  readonly reason: string;
  readonly checkedAt: string;
}

export interface CandidateReproducibility {
  readonly deterministic: true;
  readonly comparison: "EXACT_CANONICAL_OUTPUT_HASH";
  readonly tolerance: 0;
  readonly runtime: string;
}

export interface CandidateExecutionEnvelope<TOutput> {
  readonly output: TOutput;
  readonly outputHash: string;
  readonly executedAt: string;
  readonly evidence: CandidateInputEvidence;
}

export interface CandidateExecutor<TInput = unknown, TOutput = unknown> {
  readonly identity: Readonly<CandidateExecutorIdentity>;
  readonly reproducibility: Readonly<CandidateReproducibility>;
  health(): Promise<CandidateExecutorHealth>;
  validateInput(input: unknown, now?: Date): CandidateInputEvidence;
  execute(input: TInput, now?: Date): Promise<CandidateExecutionEnvelope<TOutput>>;
  validateOutput(output: unknown): asserts output is TOutput;
}

const identityKey = (identity: CandidateExecutorIdentity) =>
  [identity.sport, identity.modelFamily, identity.modelId, identity.modelVersion,
    identity.artifactId, identity.artifactHash, identity.inputContractVersion,
    identity.configurationHash ?? "", identity.parameterHash ?? ""].join("\u001f");

function assertIdentity(identity: CandidateExecutorIdentity): void {
  for (const [key, value] of Object.entries(identity)) {
    if (key === "supportedMarkets") continue;
    if (value == null || typeof value !== "string" || value.length === 0) {
      throw new Error(`Candidate executor identity field ${key} is missing`);
    }
  }
  if (!Object.keys(identity.supportedMarkets).length) {
    throw new Error("Candidate executor supportedMarkets must not be empty");
  }
}

export class CandidateExecutorRegistry {
  readonly #executors = new Map<string, CandidateExecutor>();

  register(executor: CandidateExecutor): void {
    assertIdentity(executor.identity);
    const key = identityKey(executor.identity);
    if (this.#executors.has(key)) throw new Error(`Duplicate exact candidate executor: ${executor.identity.modelId}`);
    this.#executors.set(key, executor);
  }

  resolve(identity: ExactArtifactIdentity): CandidateExecutor | null {
    const exact = [...this.#executors.values()].filter(executor =>
      executor.identity.sport === identity.sport
      && executor.identity.modelFamily === identity.modelFamily
      && executor.identity.modelId === identity.modelId
      && executor.identity.modelVersion === identity.modelVersion
      && executor.identity.artifactId === identity.artifactId
      && executor.identity.artifactHash === identity.artifactHash
      && executor.identity.inputContractVersion === identity.inputContractVersion
      && (executor.identity.configurationHash ?? null) === (identity.configurationHash ?? null)
      && (executor.identity.parameterHash ?? null) === (identity.parameterHash ?? null)
      && executor.identity.supportedMarkets[identity.market] === "EXECUTOR_SUPPORTED");
    if (exact.length !== 1) return null;
    return exact[0]!;
  }

  list(): readonly CandidateExecutor[] {
    return Object.freeze([...this.#executors.values()]);
  }
}

export function canonicalExecutionHash(value: unknown): string {
  const canonical = (input: unknown): unknown => Array.isArray(input) ? input.map(canonical)
    : input && typeof input === "object"
      ? Object.fromEntries(Object.entries(input as Record<string, unknown>)
        .filter(([, child]) => typeof child !== "function")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]))
      : input;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export const candidateExecutorRegistry = new CandidateExecutorRegistry();