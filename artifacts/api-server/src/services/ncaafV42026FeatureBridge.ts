import { createHash } from "node:crypto";
import { assertNoNcaafMarketShapedKeys } from "./ncaafFootballIntelligenceSnapshots";
import { replayNcaafChronologically, type NcaafCompletedAtomicGame, type NcaafReplayFeatures } from "./ncaafChronologicalReplay";
import { NCAAF_V4_DATASET_VERSION, NCAAF_V4_FEATURE_SCHEMA_VERSION, type V4Prediction } from "./ncaafV4ExpectedScore";

/** The bridge is deliberately read-only: callers receive ephemeral challenger
 * inputs and must explicitly provide an already-frozen prediction function. */
export const NCAAF_V4_2026_FEATURE_BRIDGE_VERSION = "ncaaf-v4-2026-feature-bridge-v1";
export const NCAAF_V4_2026_CORE_SCHEMA = "ncaaf-chronological-team-game-v2";
/** Immutable #222C universe proof. It is deliberately a code constant rather
 * than a runtime artifact read so a live request cannot alter domain truth. */
export const NCAAF_V4_2026_FBS_UNIVERSE_PROOF = Object.freeze({
  season: 2026 as const, cfbdFbsCount: 138, mappedFbsCount: 138, mappedNonFbsCount: 0,
  capturedAt: new Date("2026-09-03T20:42:22.413Z"),
  evidenceRef: "cfbd-teams-2026:138:2026-09-03T20:42:22.413Z",
});
/** Declared before assessment; out-of-domain games never enter this denominator. */
export const NCAAF_V4_2026_COMPATIBILITY_PASS_GATE = Object.freeze({
  modelEligibleCoverage: 1,
  ambiguousIdentitiesAccepted: 0,
  fuzzyIdentitiesAccepted: 0,
  postCutoffIdentityViolations: 0,
  pitViolations: 0,
  marketLeakageViolations: 0,
  requiresExactSchema: NCAAF_V4_2026_CORE_SCHEMA,
});

type Snapshot = {
  id: number;
  schemaVersion: string;
  targetProvider: string;
  targetEventId: string;
  season: number;
  week: number | null;
  kickoffAt: Date;
  homeProviderTeamId: string | null;
  awayProviderTeamId: string | null;
  dataCutoffAt: Date;
  evidenceMaxCapturedAt: Date | null;
  evidenceMaxModeledAt: Date | null;
  domainPayload: unknown;
};
type Evidence = {
  provider: string; providerEventId: string; season: number; kickoffAt: Date | null;
  gameStatus: string | null; homeScore: number | null; awayScore: number | null;
  homeProviderTeamId: string | null; awayProviderTeamId: string | null; neutralSite: boolean | null;
  providerObservedAt: Date | null; capturedAt: Date; modeledAsOf: Date; payload: unknown;
};
export type NcaafSafeTeamMapping = {
  season: number; canonicalProvider: string | null; canonicalTeamId: string | null;
  cfbdTeamId: string; state: string; capturedAt: Date;
  /** A mapping ledger entry is evidence, not a name-match suggestion. */
  mappingMethod?: "EXACT_PROVIDER_ID" | "EXACT_EXISTING_LEDGER" | "EXACT_CANONICAL_SCHOOL" | "EXACT_NORMALIZED_SCHOOL" | "EXPLICIT_ALIAS" | "MANUAL_VERIFIED" | string;
  evidenceRef?: string;
  evidenceObservedAt?: Date | null;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  verified?: boolean;
  payloadHash?: string;
  evidence?: unknown;
};
export type NcaafV42026BridgeInput = {
  snapshots: readonly Snapshot[];
  evidence: readonly Evidence[];
  mappings?: readonly NcaafSafeTeamMapping[];
  fbsUniverseProof?: Readonly<{
    season: 2026;
    cfbdFbsCount: number;
    mappedFbsCount: number;
    mappedNonFbsCount: number;
    capturedAt: Date;
    evidenceRef: string;
  }>;
  /** The point at which the snapshot is assessed; frozen future games only. */
  assessedAt: Date;
  predict?: (input: NcaafV42026ChallengerInput) => V4Prediction;
};
export type NcaafV42026ChallengerInput = Readonly<{
  stableGameId: string; season: 2026; week: number | null; kickoffAt: string;
  featureCutoff: string; features: Readonly<NcaafReplayFeatures>; checksum: string;
  sourceAudit: Readonly<Record<string, unknown>>;
}>;
export type NcaafV42026InternalPrediction = Readonly<{
  snapshotId: number; gameId: string; espnGameId: string | null; cfbdHomeTeamId: string; cfbdAwayTeamId: string;
  featureCutoff: string; predictionTimestamp: string;
  modelVersion: string; expectedHomePoints: number; expectedAwayPoints: number;
  expectedMargin: number; expectedTotal: number; homeWinProbability: number;
  awayWinProbability: number; marginUncertainty: number; totalUncertainty: number;
  dataQuality: V4Prediction["dataQuality"]; featureAvailability: "PASS";
  configurationHash: string; parameterHash: string; featureSchemaVersion: string; datasetVersion: string;
  homeIdentityMethod: string; awayIdentityMethod: string; homeIdentityEvidenceRef: string; awayIdentityEvidenceRef: string;
}>;
type Exclusion = { snapshotId: number; reason: string };
const valid = (d: Date | null | undefined): d is Date => d instanceof Date && Number.isFinite(d.getTime());
const key = (provider: string, event: string) => `${provider}:${event}`;
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
/** Canonical, deliberately tiny checksum contract for the immutable executable input. */
export const ncaafV42026InputChecksum = (replayRowChecksum: string, featureCutoff: string) =>
  hash({ row: replayRowChecksum, cutoff: featureCutoff });
const fbs = (payload: unknown) => {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const game = root.game && typeof root.game === "object" ? root.game as Record<string, unknown> : root;
  return typeof game.homeClassification === "string" && typeof game.awayClassification === "string"
    && game.homeClassification.toLowerCase() === "fbs" && game.awayClassification.toLowerCase() === "fbs";
};
export type NcaafTargetUniverseClassification =
  | "MODEL_ELIGIBLE_FBS_VS_FBS" | "OUT_OF_DOMAIN_FBS_VS_FCS" | "OUT_OF_DOMAIN_FCS_VS_FBS"
  | "OUT_OF_DOMAIN_OTHER" | "IDENTITY_UNRESOLVED" | "PIT_UNAVAILABLE" | "OTHER_EXCLUSION";
const classification = (payload: unknown, side: "home" | "away") => {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const game = root.game && typeof root.game === "object" ? root.game as Record<string, unknown> : root;
  const value = game[`${side}Classification`];
  return typeof value === "string" ? value.toLowerCase() : null;
};
/** Classification is deliberately independent of identity resolution. */
export function classifyNcaafV42026Target(payload: unknown): NcaafTargetUniverseClassification {
  const home = classification(payload, "home"); const away = classification(payload, "away");
  if (home === "fbs" && away === "fbs") return "MODEL_ELIGIBLE_FBS_VS_FBS";
  if (home === "fbs" && away === "fcs") return "OUT_OF_DOMAIN_FBS_VS_FCS";
  if (home === "fcs" && away === "fbs") return "OUT_OF_DOMAIN_FCS_VS_FBS";
  if (home != null || away != null) return "OUT_OF_DOMAIN_OTHER";
  return "IDENTITY_UNRESOLVED";
}
function explicitNeutralSite(payload: unknown): boolean | null {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const teams = root.home && typeof root.home === "object" ? root.home as Record<string, unknown> : {};
  const venue = teams.venue && typeof teams.venue === "object" ? teams.venue as Record<string, unknown> : {};
  const value = venue.payload && typeof venue.payload === "object"
    ? (venue.payload as Record<string, unknown>).neutralSite : undefined;
  return typeof value === "boolean" ? value : null;
}

type Identity = { cfbdTeamId: string; method: string; evidenceRef: string };
const allowedMethods = new Set(["EXACT_PROVIDER_ID", "EXACT_EXISTING_LEDGER", "EXACT_CANONICAL_SCHOOL", "EXACT_NORMALIZED_SCHOOL", "EXPLICIT_ALIAS", "MANUAL_VERIFIED"]);
function ledgerMetadata(mapping: NcaafSafeTeamMapping) {
  const evidence = mapping.evidence && typeof mapping.evidence === "object" ? mapping.evidence as Record<string, unknown> : {};
  const method = mapping.mappingMethod ?? (typeof evidence.mappingMethod === "string" ? evidence.mappingMethod : undefined);
  // An append-only ledger payload hash is a stable evidence reference when the
  // row predates the cutoff; never manufacture one from display names.
  const evidenceRef = mapping.evidenceRef ?? mapping.payloadHash;
  return { method, evidenceRef };
}
function mapped(id: string, provider: string, season: number, cutoff: Date, mappings: readonly NcaafSafeTeamMapping[], cache?: Map<string, Identity | null>): Identity | null {
  const cacheKey = `${provider}:${id}:${season}:${cutoff.getTime()}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey)!;
  // Native CFBD identities are the historical core's canonical identities.
  if (provider === "college_football_data") {
    const identity = { cfbdTeamId: id, method: "EXACT_PROVIDER_ID", evidenceRef: `college_football_data:${id}` };
    cache?.set(cacheKey, identity);
    return identity;
  }
  const candidates = mappings.filter(m => {
    const metadata = ledgerMetadata(m);
    return m.season === season && m.canonicalTeamId === id && m.canonicalProvider === provider
    && m.state === "MAPPED" && valid(m.capturedAt) && m.capturedAt < cutoff
    && allowedMethods.has(metadata.method ?? "") && typeof metadata.evidenceRef === "string" && metadata.evidenceRef.length > 0
    && (!m.evidenceObservedAt || m.evidenceObservedAt < cutoff)
    && (!m.effectiveFrom || m.effectiveFrom <= cutoff) && (!m.effectiveTo || m.effectiveTo > cutoff);
  });
  const identities = [...new Set(candidates.map(m => m.cfbdTeamId))];
  if (identities.length !== 1) { cache?.set(cacheKey, null); return null; }
  const candidate = candidates.find(m => m.cfbdTeamId === identities[0])!;
  const metadata = ledgerMetadata(candidate);
  const identity = { cfbdTeamId: candidate.cfbdTeamId, method: metadata.method!, evidenceRef: metadata.evidenceRef! };
  cache?.set(cacheKey, identity);
  return identity;
}

function completedBefore(evidence: readonly Evidence[], cutoff: Date, mappings: readonly NcaafSafeTeamMapping[], cache?: Map<string, Identity | null>) {
  const excluded = new Map<string, number>();
  const reject = (reason: string) => excluded.set(reason, (excluded.get(reason) ?? 0) + 1);
  const games: NcaafCompletedAtomicGame[] = [];
  for (const row of evidence) {
    if (!valid(row.kickoffAt) || row.kickoffAt >= cutoff || row.season < 2025 || row.season > 2026) { reject("outside_cutoff_or_season"); continue; }
    if (row.gameStatus?.toLowerCase() !== "final" || row.homeScore == null || row.awayScore == null || !fbs(row.payload)) { reject("not_completed_fbs_atomic"); continue; }
    if (!valid(row.capturedAt) || !valid(row.modeledAsOf) || row.capturedAt >= cutoff || row.modeledAsOf >= cutoff || (row.providerObservedAt && row.providerObservedAt >= cutoff)) { reject("post_cutoff_evidence"); continue; }
    if (!row.homeProviderTeamId || !row.awayProviderTeamId) { reject("missing_provider_identity"); continue; }
    const home = mapped(row.homeProviderTeamId, row.provider, row.season, cutoff, mappings, cache);
    const away = mapped(row.awayProviderTeamId, row.provider, row.season, cutoff, mappings, cache);
    if (!home || !away || home.cfbdTeamId === away.cfbdTeamId) { reject("unsafe_team_identity_mapping"); continue; }
    try { assertNoNcaafMarketShapedKeys(row.payload, "bridge.gameEvidence.payload"); } catch { reject("market_shaped_evidence"); continue; }
    games.push({ stableGameId: key(row.provider, row.providerEventId), season: row.season, kickoffAt: row.kickoffAt,
      homeTeamId: home.cfbdTeamId, awayTeamId: away.cfbdTeamId, homeScore: row.homeScore, awayScore: row.awayScore, neutralSite: row.neutralSite === true,
      completed: true, homeClassification: "FBS", awayClassification: "FBS" });
  }
  return { games, excluded: Object.fromEntries(excluded) };
}

/** Replays only completed atomic evidence before each snapshot's own strict
 * cutoff. The synthetic target has no provider result and is discarded before
 * replay state could be updated; it only exposes the shared pregame feature
 * constructor. */
export function buildNcaafV42026FeatureBridge(input: NcaafV42026BridgeInput) {
  if (!valid(input.assessedAt)) throw new Error("Bridge assessedAt must be a valid timestamp");
  const exclusions: Exclusion[] = [];
  const inputs: NcaafV42026ChallengerInput[] = [];
  const predictions: NcaafV42026InternalPrediction[] = [];
  const mappingCache = new Map<string, Identity | null>();
  // A target cannot be in completed-before-cutoff evidence (its kickoff is
  // after its own cutoff), so this immutable cutoff-keyed replay is equivalent
  // to repeatedly filtering the full ledger per target.
  const completedCache = new Map<number, ReturnType<typeof completedBefore>>();
  const latest = new Map<string, Snapshot>();
  for (const snapshot of input.snapshots) {
    if (snapshot.season !== 2026 || snapshot.kickoffAt <= input.assessedAt || snapshot.dataCutoffAt > input.assessedAt) continue;
    const id = key(snapshot.targetProvider, snapshot.targetEventId);
    const prior = latest.get(id);
    if (!prior || snapshot.dataCutoffAt > prior.dataCutoffAt || (snapshot.dataCutoffAt.getTime() === prior.dataCutoffAt.getTime() && snapshot.id > prior.id)) latest.set(id, snapshot);
  }
  const audit = { snapshotsSeen: input.snapshots.length, targetsAssessed: latest.size, eligibleSnapshots: 0,
    modelEligibleFbsVsFbsTargets: 0, outOfDomainTargets: 0, identityResolvedTargets: 0, identityUnresolvedTargets: 0,
    targetUniverse: {} as Record<NcaafTargetUniverseClassification, number>,
    ambiguousIdentitiesAccepted: 0, fuzzyIdentitiesAccepted: 0, postCutoffIdentityViolations: 0,
    sameGameLeakage: 0, futureGameLeakage: 0, futureSeasonLeakage: 0, postKickoffEvidence: 0, marketLeakage: 0, marketShapedSnapshotsRejected: 0, excludedCompletedEvidence: {} as Record<string, number> };
  for (const snapshot of [...latest.values()].sort((a, b) => a.id - b.id)) {
    const reject = (reason: string) => exclusions.push({ snapshotId: snapshot.id, reason });
    if (snapshot.season !== 2026 || !valid(snapshot.kickoffAt) || !valid(snapshot.dataCutoffAt) || snapshot.kickoffAt <= input.assessedAt) { reject("not_a_frozen_future_2026_snapshot"); continue; }
    if (snapshot.dataCutoffAt >= snapshot.kickoffAt) { reject("invalid_snapshot_cutoff"); continue; }
    if ((snapshot.evidenceMaxCapturedAt && snapshot.evidenceMaxCapturedAt >= snapshot.dataCutoffAt) || (snapshot.evidenceMaxModeledAt && snapshot.evidenceMaxModeledAt >= snapshot.dataCutoffAt)) { reject("snapshot_evidence_after_cutoff"); continue; }
    const home = snapshot.homeProviderTeamId ? mapped(snapshot.homeProviderTeamId, snapshot.targetProvider, 2026, snapshot.dataCutoffAt, input.mappings ?? [], mappingCache) : null;
    const away = snapshot.awayProviderTeamId ? mapped(snapshot.awayProviderTeamId, snapshot.targetProvider, 2026, snapshot.dataCutoffAt, input.mappings ?? [], mappingCache) : null;
    let targetClassification = classifyNcaafV42026Target(snapshot.domainPayload);
    const proof = input.fbsUniverseProof;
    if (targetClassification === "IDENTITY_UNRESOLVED" && proof && proof.season === 2026
      && proof.cfbdFbsCount > 0 && proof.mappedFbsCount === proof.cfbdFbsCount
      && proof.mappedNonFbsCount === 0 && proof.capturedAt < snapshot.dataCutoffAt) {
      targetClassification = home && away ? "MODEL_ELIGIBLE_FBS_VS_FBS"
        : home ? "OUT_OF_DOMAIN_FBS_VS_FCS"
        : away ? "OUT_OF_DOMAIN_FCS_VS_FBS"
        : "OUT_OF_DOMAIN_OTHER";
    }
    audit.targetUniverse[targetClassification] = (audit.targetUniverse[targetClassification] ?? 0) + 1;
    if (targetClassification === "IDENTITY_UNRESOLVED") {
      audit.identityUnresolvedTargets++;
      reject("identity_unresolved");
      continue;
    }
    if (targetClassification !== "MODEL_ELIGIBLE_FBS_VS_FBS") {
      audit.outOfDomainTargets++;
      reject(targetClassification.toLowerCase());
      continue;
    }
    audit.modelEligibleFbsVsFbsTargets++;
    if (!snapshot.homeProviderTeamId || !snapshot.awayProviderTeamId) { audit.identityUnresolvedTargets++; reject("missing_target_identity"); continue; }
    if (!home || !away || home.cfbdTeamId === away.cfbdTeamId) { audit.identityUnresolvedTargets++; reject("unsafe_target_team_identity_mapping"); continue; }
    audit.identityResolvedTargets++;
    try { assertNoNcaafMarketShapedKeys(snapshot.domainPayload, "suppliedDomains"); } catch { audit.marketShapedSnapshotsRejected++; reject("market_shaped_snapshot_payload"); continue; }
    const neutralSite = explicitNeutralSite(snapshot.domainPayload);
    if (neutralSite == null) { reject("missing_explicit_home_neutral_context"); continue; }
    const cutoffKey = snapshot.dataCutoffAt.getTime();
    let prior = completedCache.get(cutoffKey);
    if (!prior) {
      prior = completedBefore(input.evidence, snapshot.dataCutoffAt, input.mappings ?? [], mappingCache);
      completedCache.set(cutoffKey, prior);
    }
    for (const [reason, count] of Object.entries(prior.excluded)) audit.excludedCompletedEvidence[reason] = (audit.excludedCompletedEvidence[reason] ?? 0) + count;
    // A result-free sentinel is never exposed or retained as a target.
    const sentinel: NcaafCompletedAtomicGame = { stableGameId: key(snapshot.targetProvider, snapshot.targetEventId), season: 2026, kickoffAt: snapshot.kickoffAt, homeTeamId: home.cfbdTeamId, awayTeamId: away.cfbdTeamId, homeScore: 0, awayScore: 0, neutralSite, completed: true, homeClassification: "FBS", awayClassification: "FBS" };
    const replay = replayNcaafChronologically([...prior.games, sentinel]);
    const row = replay.rows.find(r => r.stableGameId === sentinel.stableGameId);
    if (!row) { reject("unable_to_construct_pregame_state"); continue; }
    audit.postKickoffEvidence += replay.audit.leakage.postKickoffPitExcluded + replay.audit.leakage.postKickoffAvailabilityExcluded;
    const sourceAudit = Object.freeze({
      featureFreeze: "replayNcaafChronologically_before_targets", targetResultUsed: false,
      completedGamesBeforeCutoff: prior.games.length, replayChecksum: replay.audit.checksum,
      replayRowChecksum: row.checksum, snapshotId: snapshot.id,
      targetProvider: snapshot.targetProvider, targetEventId: snapshot.targetEventId,
      snapshotKickoffAt: snapshot.kickoffAt.toISOString(), snapshotDataCutoffAt: snapshot.dataCutoffAt.toISOString(),
      evidenceMaxCapturedAt: snapshot.evidenceMaxCapturedAt?.toISOString() ?? null,
      evidenceMaxModeledAt: snapshot.evidenceMaxModeledAt?.toISOString() ?? null,
    });
    const bridgeInput = Object.freeze({ stableGameId: row.stableGameId, season: 2026 as const, week: snapshot.week, kickoffAt: row.kickoffAt, featureCutoff: snapshot.dataCutoffAt.toISOString(), features: row.features, checksum: ncaafV42026InputChecksum(row.checksum, snapshot.dataCutoffAt.toISOString()), sourceAudit });
    inputs.push(bridgeInput); audit.eligibleSnapshots++;
    if (input.predict) {
      const p = input.predict(bridgeInput);
      predictions.push(Object.freeze({ snapshotId: snapshot.id, gameId: bridgeInput.stableGameId, espnGameId: snapshot.targetProvider === "espn" ? snapshot.targetEventId : null, cfbdHomeTeamId: home.cfbdTeamId, cfbdAwayTeamId: away.cfbdTeamId,
        featureCutoff: bridgeInput.featureCutoff, predictionTimestamp: input.assessedAt.toISOString(), modelVersion: p.modelVersion, expectedHomePoints: p.expectedHomePoints, expectedAwayPoints: p.expectedAwayPoints, expectedMargin: p.expectedMargin, expectedTotal: p.expectedTotal, homeWinProbability: p.homeWinProbability, awayWinProbability: p.awayWinProbability, marginUncertainty: p.marginUncertainty, totalUncertainty: p.totalUncertainty, dataQuality: p.dataQuality, featureAvailability: "PASS",
        configurationHash: String(p.diagnostics.configurationHash), parameterHash: String(p.diagnostics.parameterHash), featureSchemaVersion: NCAAF_V4_FEATURE_SCHEMA_VERSION, datasetVersion: NCAAF_V4_DATASET_VERSION,
        homeIdentityMethod: home.method, awayIdentityMethod: away.method, homeIdentityEvidenceRef: home.evidenceRef, awayIdentityEvidenceRef: away.evidenceRef }));
    }
  }
  return Object.freeze({ version: NCAAF_V4_2026_FEATURE_BRIDGE_VERSION, inputs: Object.freeze(inputs), predictions: Object.freeze(predictions), exclusions: Object.freeze(exclusions), audit: Object.freeze(audit) });
}