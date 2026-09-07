/**
 * #214 MLB advanced-data research boundary.
 *
 * This module is intentionally provider-agnostic and is not imported by V3,
 * V4, V4.1, publication, grading, or learning code.  It captures only
 * evidence that is demonstrably available at a supplied pregame cutoff.
 */
import { db, mlbAdvancedFeatureSnapshotsTable, mlbAdvancedResearchEvidenceTable, mlbFeatureSnapshotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { evidenceHash, stableJson } from "./mlbPointInTime";

export const MLB_ADVANCED_SCHEMA_VERSION = "mlb-advanced-research-v1";
export const ADVANCED_MODEL_USAGE = "CAPTURED_RESEARCH_ONLY" as const;
export const ADVANCED_FEATURE_STATUSES = [
  "ACTIVE", "AVAILABLE_NOT_USED", "CAPTURED_RESEARCH_ONLY", "NOT_SUPPORTED", "PLANNED", "DEPRECATED",
] as const;
export type AdvancedFeatureStatus = typeof ADVANCED_FEATURE_STATUSES[number];
export type HistoricalAvailability = "FULL_HISTORICAL_PIT" | "PARTIAL_HISTORICAL_PIT" | "LIVE_FORWARD_ONLY" | "NO_RELIABLE_HISTORY" | "NOT_SUPPORTED";
export type SampleReliability = "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW" | "UNKNOWN";
export type AdvancedDomain =
  | "pitcher_conventional" | "pitch_repertoire" | "starter_availability"
  | "hitter_conventional" | "hitter_platoon" | "hitter_pitch_type"
  | "lineup" | "bullpen_quality" | "bullpen_availability" | "defense"
  | "baserunning" | "park" | "weather" | "schedule_context" | "league_environment" | "umpire";

export interface CanonicalPlayerIdentity {
  canonicalPlayerId: number;
  provider: string;
  providerPlayerId: string;
  name?: string;
  teamId?: number | null;
  position?: string | null;
  bats?: "L" | "R" | "S" | null;
  throws?: "L" | "R" | null;
  activeState?: "ACTIVE" | "INACTIVE" | "IL" | "OPTIONED" | "UNKNOWN";
}

/** Name is descriptive only: a mapping must have both stable IDs. */
export function assertStablePlayerIdentity(value: CanonicalPlayerIdentity): void {
  if (!Number.isInteger(value.canonicalPlayerId) || value.canonicalPlayerId <= 0) throw new Error("canonical player identity is required");
  if (!value.provider.trim() || !value.providerPlayerId.trim()) throw new Error("provider player ID mapping is required; name-only identity is forbidden");
}

export function sampleReliability(sample: number | null | undefined, high = 300, medium = 150, low = 50): SampleReliability {
  if (sample == null || !Number.isFinite(sample) || sample < 0) return "UNKNOWN";
  if (sample >= high) return "HIGH";
  if (sample >= medium) return "MEDIUM";
  if (sample >= low) return "LOW";
  return "VERY_LOW";
}

export interface AdvancedEvidenceInput {
  domain: AdvancedDomain;
  provider: string;
  providerRecordId?: string | null;
  providerEventId?: string | null;
  gameId?: string | null;
  player?: CanonicalPlayerIdentity | null;
  retrievedAt: Date;
  effectiveAt?: Date | null;
  statThroughAt?: Date | null;
  cutoff: Date;
  gameStart: Date;
  qualityState: string;
  sampleSize?: number | null;
  historicalAvailability: HistoricalAvailability;
  /** Provider evidence must explicitly identify game exclusion when aggregate stats are used. */
  includedGameIds?: readonly string[] | null;
  targetGameProviderId?: string | null;
  values: Record<string, unknown>;
  rawPayload: unknown;
}

export function assertAdvancedPitEvidence(input: AdvancedEvidenceInput): void {
  const valid = (date: Date | null | undefined) => date == null || (Number.isFinite(date.getTime()) && date <= input.cutoff);
  if (!(input.retrievedAt <= input.cutoff && input.cutoff < input.gameStart)) throw new Error("advanced evidence must be retrieved by cutoff before first pitch");
  if (!valid(input.effectiveAt) || !valid(input.statThroughAt)) throw new Error("advanced evidence effective/stat-through timestamp is after cutoff");
  if (input.targetGameProviderId && input.includedGameIds?.includes(input.targetGameProviderId)) {
    throw new Error("target game must be excluded from pregame aggregate evidence");
  }
  if (input.player) assertStablePlayerIdentity(input.player);
  if (!input.provider.trim()) throw new Error("advanced evidence provider is required");
}

/** Preserve supplied values only; no provider-specific inference or zero fill. */
export function supportedMetricValues(
  payload: Record<string, unknown>,
  supportedFields: readonly string[],
): { values: Record<string, number | string | boolean | null>; missingFields: string[] } {
  const values: Record<string, number | string | boolean | null> = {};
  const missingFields: string[] = [];
  for (const field of supportedFields) {
    const value = payload[field];
    if (value === undefined || value === null || value === "") {
      values[field] = null;
      missingFields.push(field);
    } else if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
      values[field] = value;
    } else {
      values[field] = null;
      missingFields.push(field);
    }
  }
  return { values, missingFields };
}

export interface WeightedLineupPlayer {
  player: CanonicalPlayerIdentity;
  battingOrder: number | null;
  metrics: Record<string, number | null | undefined>;
}
export interface LineupAggregate {
  values: Record<string, number | null>;
  coverage: Record<string, { knownPlayers: number; totalPlayers: number }>;
}
/** Weights are expected plate-appearance proxies, not a new forecast model. */
export function aggregateLineupResearch(players: readonly WeightedLineupPlayer[], metricNames: readonly string[]): LineupAggregate {
  const values: Record<string, number | null> = {};
  const coverage: LineupAggregate["coverage"] = {};
  for (const metric of metricNames) {
    let numerator = 0; let denominator = 0; let known = 0;
    for (const player of players) {
      assertStablePlayerIdentity(player.player);
      const value = player.metrics[metric];
      if (value == null || !Number.isFinite(value)) continue;
      // Order 1 gets more expected PA than 9; unknown order is intentionally excluded.
      if (player.battingOrder == null || player.battingOrder < 1 || player.battingOrder > 9) continue;
      const weight = 10 - player.battingOrder;
      numerator += value * weight; denominator += weight; known++;
    }
    values[metric] = denominator ? numerator / denominator : null;
    coverage[metric] = { knownPlayers: known, totalPlayers: players.length };
  }
  return { values, coverage };
}

export interface RelieverUsage {
  player: CanonicalPlayerIdentity;
  appearanceAt: Date;
  pitches: number | null;
}
export function bullpenAvailabilityResearch(usages: readonly RelieverUsage[], cutoff: Date): Array<{
  player: CanonicalPlayerIdentity; pitchesYesterday: number | null; pitchesTwoDaysAgo: number | null;
  pitchesThreeDaysAgo: number | null; appearancesLast3Days: number; backToBack: boolean; threeInFour: boolean;
  availabilityState: "AVAILABLE" | "LIMITED" | "UNAVAILABLE" | "UNKNOWN";
}> {
  const day = 86_400_000;
  const grouped = new Map<number, RelieverUsage[]>();
  for (const usage of usages) {
    assertStablePlayerIdentity(usage.player);
    if (usage.appearanceAt >= cutoff) throw new Error("future bullpen workload cannot enter pregame evidence");
    const list = grouped.get(usage.player.canonicalPlayerId) ?? []; list.push(usage); grouped.set(usage.player.canonicalPlayerId, list);
  }
  return [...grouped.values()].map((rows) => {
    const player = rows[0]!.player;
    const pitches = (daysAgo: number) => {
      const selected = rows.filter((r) => r.appearanceAt >= new Date(cutoff.getTime() - (daysAgo + 1) * day) && r.appearanceAt < new Date(cutoff.getTime() - daysAgo * day));
      return selected.length && selected.every((r) => r.pitches != null && Number.isFinite(r.pitches)) ? selected.reduce((n, r) => n + r.pitches!, 0) : null;
    };
    const p1 = pitches(0), p2 = pitches(1), p3 = pitches(2);
    const appearancesLast3Days = rows.filter((r) => r.appearanceAt >= new Date(cutoff.getTime() - 3 * day)).length;
    const backToBack = p1 != null && p2 != null;
    const threeInFour = rows.filter((r) => r.appearanceAt >= new Date(cutoff.getTime() - 4 * day)).length >= 3;
    const availabilityState = p1 == null && p2 == null && p3 == null ? "UNKNOWN"
      : (threeInFour || (p1 ?? 0) >= 30) ? "UNAVAILABLE" : (backToBack || (p1 ?? 0) >= 20) ? "LIMITED" : "AVAILABLE";
    return { player, pitchesYesterday: p1, pitchesTwoDaysAgo: p2, pitchesThreeDaysAgo: p3, appearancesLast3Days, backToBack, threeInFour, availabilityState };
  });
}

export async function captureAdvancedResearchEvidence(input: AdvancedEvidenceInput): Promise<string> {
  assertAdvancedPitEvidence(input);
  const payloadHash = evidenceHash(input.rawPayload);
  await db.insert(mlbAdvancedResearchEvidenceTable).values({
    schemaVersion: MLB_ADVANCED_SCHEMA_VERSION, domain: input.domain, provider: input.provider,
    providerRecordId: input.providerRecordId ?? null, providerEventId: input.providerEventId ?? null, gameId: input.gameId ?? null,
    canonicalPlayerId: input.player?.canonicalPlayerId ?? null, providerPlayerId: input.player?.providerPlayerId ?? null,
    retrievedAt: input.retrievedAt, effectiveAt: input.effectiveAt ?? null, statThroughAt: input.statThroughAt ?? null,
    pointInTimeCutoff: input.cutoff, payloadHash, qualityState: input.qualityState,
    sampleReliability: sampleReliability(input.sampleSize), historicalAvailability: input.historicalAvailability,
    modelUsageStatus: ADVANCED_MODEL_USAGE, values: input.values,
    leakageMetadata: { targetGameExcluded: input.targetGameProviderId ? !input.includedGameIds?.includes(input.targetGameProviderId) : null, includedGameIdsKnown: input.includedGameIds != null },
  }).onConflictDoNothing();
  return payloadHash;
}

export async function captureAdvancedFeatureSnapshot(input: {
  gameId: string; canonicalFeatureSnapshotId?: number | null; revisionState: "EARLY" | "UPDATED" | "FINAL_PREGAME";
  cutoff: Date; gameStart: Date; evidenceHashes: Record<string, string>; features: Record<string, unknown>;
  quality: Record<string, unknown>; sampleReliability: Record<string, SampleReliability>; leakageMetadata: Record<string, unknown>;
}): Promise<number | null> {
  if (!(input.cutoff < input.gameStart)) throw new Error("advanced snapshot cutoff must precede first pitch");
  if (input.revisionState === "FINAL_PREGAME" && input.cutoff >= input.gameStart) throw new Error("postgame data cannot enter FINAL_PREGAME");
  const inputHash = evidenceHash({ ...input, cutoff: input.cutoff.toISOString(), gameStart: input.gameStart.toISOString() });
  const [row] = await db.insert(mlbAdvancedFeatureSnapshotsTable).values({
    schemaVersion: MLB_ADVANCED_SCHEMA_VERSION, gameId: input.gameId, canonicalFeatureSnapshotId: input.canonicalFeatureSnapshotId ?? null,
    revisionState: input.revisionState, pointInTimeCutoff: input.cutoff, gameStartTime: input.gameStart,
    evidenceHashes: input.evidenceHashes, features: input.features, quality: input.quality,
    sampleReliability: input.sampleReliability, leakageMetadata: { ...input.leakageMetadata, modelUsageStatus: ADVANCED_MODEL_USAGE },
    modelUsageStatus: ADVANCED_MODEL_USAGE, inputHash,
  }).onConflictDoNothing().returning({ id: mlbAdvancedFeatureSnapshotsTable.id });
  return row?.id ?? null;
}

/**
 * Bounded collector for an already immutable #213 snapshot.  It makes no
 * provider request and deliberately copies no opaque source values: adapters
 * must separately validate/capture fields before they become advanced
 * evidence.  This is safe to invoke repeatedly because the snapshot writer is
 * hash-idempotent.  FINAL_PREGAME can only use the exact #213 final revision.
 */
export async function collectAdvancedFromCanonicalSnapshot(canonicalFeatureSnapshotId: number): Promise<number | null> {
  const [source] = await db.select({
    id: mlbFeatureSnapshotsTable.id, gameId: mlbFeatureSnapshotsTable.gameId, revisionState: mlbFeatureSnapshotsTable.revisionState,
    cutoff: mlbFeatureSnapshotsTable.pointInTimeCutoff, gameStart: mlbFeatureSnapshotsTable.gameStartTime,
    quality: mlbFeatureSnapshotsTable.quality, sourceFeatures: mlbFeatureSnapshotsTable.features,
  }).from(mlbFeatureSnapshotsTable).where(eq(mlbFeatureSnapshotsTable.id, canonicalFeatureSnapshotId)).limit(1);
  if (!source) throw new Error("canonical #213 feature snapshot not found");
  if (!(source.cutoff < source.gameStart)) throw new Error("canonical snapshot is not pregame PIT-safe");
  const state = source.revisionState;
  if (state !== "EARLY" && state !== "UPDATED" && state !== "FINAL_PREGAME") throw new Error("unsupported canonical revision state");
  const keys = source.sourceFeatures && typeof source.sourceFeatures === "object" && !Array.isArray(source.sourceFeatures)
    ? Object.keys(source.sourceFeatures as Record<string, unknown>).sort() : [];
  return captureAdvancedFeatureSnapshot({
    gameId: source.gameId, canonicalFeatureSnapshotId: source.id, revisionState: state, cutoff: source.cutoff, gameStart: source.gameStart,
    evidenceHashes: {}, features: { canonicalSnapshotReference: source.id, availableCanonicalFeatureKeys: keys },
    quality: { canonicalQuality: source.quality, collection: "REFERENCE_ONLY_NO_PROVIDER_CALL" },
    sampleReliability: {}, leakageMetadata: { exactCanonicalSnapshotId: source.id, exactFinalPregameReference: state === "FINAL_PREGAME", laterEvidenceExcluded: true },
  });
}

/** Registry boundary: metrics below need a supported, PIT-auditable adapter first. */
export const UNSUPPORTED_ADVANCED_BOUNDARIES = Object.freeze([
  "statcast_xera", "statcast_xwoba", "statcast_pitch_characteristics", "oaa", "drs",
  "baserunning_runs", "umpire_effects", "pitch_type_matchup_metrics",
] as const);

// Keeps a stable serialization contract readily testable without exposing vendor payloads.
export const advancedEvidenceIdentity = (input: Pick<AdvancedEvidenceInput, "provider" | "domain" | "providerRecordId" | "retrievedAt">) =>
  evidenceHash(stableJson({ ...input, retrievedAt: input.retrievedAt.toISOString() }));