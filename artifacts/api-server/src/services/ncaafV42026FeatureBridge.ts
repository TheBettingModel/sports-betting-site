import { createHash } from "node:crypto";
import { assertNoNcaafMarketShapedKeys } from "./ncaafFootballIntelligenceSnapshots";
import { replayNcaafChronologically, type NcaafCompletedAtomicGame, type NcaafReplayFeatures } from "./ncaafChronologicalReplay";
import type { V4Prediction } from "./ncaafV4ExpectedScore";

/** The bridge is deliberately read-only: callers receive ephemeral challenger
 * inputs and must explicitly provide an already-frozen prediction function. */
export const NCAAF_V4_2026_FEATURE_BRIDGE_VERSION = "ncaaf-v4-2026-feature-bridge-v1";
export const NCAAF_V4_2026_CORE_SCHEMA = "ncaaf-chronological-team-game-v2";

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
};
export type NcaafV42026BridgeInput = {
  snapshots: readonly Snapshot[];
  evidence: readonly Evidence[];
  mappings?: readonly NcaafSafeTeamMapping[];
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
  snapshotId: number; gameId: string; featureCutoff: string; predictionTimestamp: string;
  modelVersion: string; expectedHomePoints: number; expectedAwayPoints: number;
  expectedMargin: number; expectedTotal: number; homeWinProbability: number;
  awayWinProbability: number; marginUncertainty: number; totalUncertainty: number;
  dataQuality: V4Prediction["dataQuality"]; featureAvailability: "PASS";
}>;
type Exclusion = { snapshotId: number; reason: string };
const valid = (d: Date | null | undefined): d is Date => d instanceof Date && Number.isFinite(d.getTime());
const key = (provider: string, event: string) => `${provider}:${event}`;
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const fbs = (payload: unknown) => {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const game = root.game && typeof root.game === "object" ? root.game as Record<string, unknown> : root;
  return game.homeClassification === "fbs" && game.awayClassification === "fbs";
};
function explicitNeutralSite(payload: unknown): boolean | null {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const teams = root.home && typeof root.home === "object" ? root.home as Record<string, unknown> : {};
  const venue = teams.venue && typeof teams.venue === "object" ? teams.venue as Record<string, unknown> : {};
  const value = venue.payload && typeof venue.payload === "object"
    ? (venue.payload as Record<string, unknown>).neutralSite : undefined;
  return typeof value === "boolean" ? value : null;
}

function mapped(id: string, provider: string, season: number, cutoff: Date, mappings: readonly NcaafSafeTeamMapping[]): string | null {
  // Native CFBD identities are the historical core's canonical identities.
  if (provider === "college_football_data") return id;
  const candidates = mappings.filter(m => m.season === season && m.canonicalTeamId === id && m.canonicalProvider === provider
    && m.state === "MAPPED" && valid(m.capturedAt) && m.capturedAt < cutoff);
  const identities = [...new Set(candidates.map(m => m.cfbdTeamId))];
  return identities.length === 1 ? identities[0]! : null;
}

function completedBefore(evidence: readonly Evidence[], cutoff: Date, mappings: readonly NcaafSafeTeamMapping[]) {
  const excluded = new Map<string, number>();
  const reject = (reason: string) => excluded.set(reason, (excluded.get(reason) ?? 0) + 1);
  const games: NcaafCompletedAtomicGame[] = [];
  for (const row of evidence) {
    if (!valid(row.kickoffAt) || row.kickoffAt >= cutoff || row.season < 2025 || row.season > 2026) { reject("outside_cutoff_or_season"); continue; }
    if (row.gameStatus?.toLowerCase() !== "final" || row.homeScore == null || row.awayScore == null || !fbs(row.payload)) { reject("not_completed_fbs_atomic"); continue; }
    if (!valid(row.capturedAt) || !valid(row.modeledAsOf) || row.capturedAt >= cutoff || row.modeledAsOf >= cutoff || (row.providerObservedAt && row.providerObservedAt >= cutoff)) { reject("post_cutoff_evidence"); continue; }
    if (!row.homeProviderTeamId || !row.awayProviderTeamId) { reject("missing_provider_identity"); continue; }
    const home = mapped(row.homeProviderTeamId, row.provider, row.season, cutoff, mappings);
    const away = mapped(row.awayProviderTeamId, row.provider, row.season, cutoff, mappings);
    if (!home || !away || home === away) { reject("unsafe_team_identity_mapping"); continue; }
    try { assertNoNcaafMarketShapedKeys(row.payload, "bridge.gameEvidence.payload"); } catch { reject("market_shaped_evidence"); continue; }
    games.push({ stableGameId: key(row.provider, row.providerEventId), season: row.season, kickoffAt: row.kickoffAt,
      homeTeamId: home, awayTeamId: away, homeScore: row.homeScore, awayScore: row.awayScore, neutralSite: row.neutralSite === true,
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
  const latest = new Map<string, Snapshot>();
  for (const snapshot of input.snapshots) {
    if (snapshot.season !== 2026 || snapshot.kickoffAt <= input.assessedAt || snapshot.dataCutoffAt > input.assessedAt) continue;
    const id = key(snapshot.targetProvider, snapshot.targetEventId);
    const prior = latest.get(id);
    if (!prior || snapshot.dataCutoffAt > prior.dataCutoffAt || (snapshot.dataCutoffAt.getTime() === prior.dataCutoffAt.getTime() && snapshot.id > prior.id)) latest.set(id, snapshot);
  }
  const audit = { snapshotsSeen: input.snapshots.length, targetsAssessed: latest.size, eligibleSnapshots: 0, sameGameLeakage: 0, futureGameLeakage: 0, futureSeasonLeakage: 0, postKickoffEvidence: 0, marketLeakage: 0, marketShapedSnapshotsRejected: 0, excludedCompletedEvidence: {} as Record<string, number> };
  for (const snapshot of [...latest.values()].sort((a, b) => a.id - b.id)) {
    const reject = (reason: string) => exclusions.push({ snapshotId: snapshot.id, reason });
    if (snapshot.season !== 2026 || !valid(snapshot.kickoffAt) || !valid(snapshot.dataCutoffAt) || snapshot.kickoffAt <= input.assessedAt) { reject("not_a_frozen_future_2026_snapshot"); continue; }
    if (snapshot.dataCutoffAt >= snapshot.kickoffAt) { reject("invalid_snapshot_cutoff"); continue; }
    if ((snapshot.evidenceMaxCapturedAt && snapshot.evidenceMaxCapturedAt >= snapshot.dataCutoffAt) || (snapshot.evidenceMaxModeledAt && snapshot.evidenceMaxModeledAt >= snapshot.dataCutoffAt)) { reject("snapshot_evidence_after_cutoff"); continue; }
    if (!snapshot.homeProviderTeamId || !snapshot.awayProviderTeamId) { reject("missing_target_identity"); continue; }
    const home = mapped(snapshot.homeProviderTeamId, snapshot.targetProvider, 2026, snapshot.dataCutoffAt, input.mappings ?? []);
    const away = mapped(snapshot.awayProviderTeamId, snapshot.targetProvider, 2026, snapshot.dataCutoffAt, input.mappings ?? []);
    if (!home || !away || home === away) { reject("unsafe_target_team_identity_mapping"); continue; }
    try { assertNoNcaafMarketShapedKeys(snapshot.domainPayload, "suppliedDomains"); } catch { audit.marketShapedSnapshotsRejected++; reject("market_shaped_snapshot_payload"); continue; }
    const neutralSite = explicitNeutralSite(snapshot.domainPayload);
    if (neutralSite == null) { reject("missing_explicit_home_neutral_context"); continue; }
    const prior = completedBefore(input.evidence.filter(e => key(e.provider, e.providerEventId) !== key(snapshot.targetProvider, snapshot.targetEventId)), snapshot.dataCutoffAt, input.mappings ?? []);
    for (const [reason, count] of Object.entries(prior.excluded)) audit.excludedCompletedEvidence[reason] = (audit.excludedCompletedEvidence[reason] ?? 0) + count;
    // A result-free sentinel is never exposed or retained as a target.
    const sentinel: NcaafCompletedAtomicGame = { stableGameId: key(snapshot.targetProvider, snapshot.targetEventId), season: 2026, kickoffAt: snapshot.kickoffAt, homeTeamId: home, awayTeamId: away, homeScore: 0, awayScore: 0, neutralSite, completed: true, homeClassification: "FBS", awayClassification: "FBS" };
    const replay = replayNcaafChronologically([...prior.games, sentinel]);
    const row = replay.rows.find(r => r.stableGameId === sentinel.stableGameId);
    if (!row) { reject("unable_to_construct_pregame_state"); continue; }
    audit.postKickoffEvidence += replay.audit.leakage.postKickoffPitExcluded + replay.audit.leakage.postKickoffAvailabilityExcluded;
    const sourceAudit = Object.freeze({ featureFreeze: "replayNcaafChronologically_before_targets", targetResultUsed: false, completedGamesBeforeCutoff: prior.games.length, replayChecksum: replay.audit.checksum });
    const bridgeInput = Object.freeze({ stableGameId: row.stableGameId, season: 2026 as const, week: snapshot.week, kickoffAt: row.kickoffAt, featureCutoff: snapshot.dataCutoffAt.toISOString(), features: row.features, checksum: hash({ row: row.checksum, cutoff: snapshot.dataCutoffAt.toISOString() }), sourceAudit });
    inputs.push(bridgeInput); audit.eligibleSnapshots++;
    if (input.predict) {
      const p = input.predict(bridgeInput);
      predictions.push(Object.freeze({ snapshotId: snapshot.id, gameId: bridgeInput.stableGameId, featureCutoff: bridgeInput.featureCutoff, predictionTimestamp: input.assessedAt.toISOString(), modelVersion: p.modelVersion, expectedHomePoints: p.expectedHomePoints, expectedAwayPoints: p.expectedAwayPoints, expectedMargin: p.expectedMargin, expectedTotal: p.expectedTotal, homeWinProbability: p.homeWinProbability, awayWinProbability: p.awayWinProbability, marginUncertainty: p.marginUncertainty, totalUncertainty: p.totalUncertainty, dataQuality: p.dataQuality, featureAvailability: "PASS" }));
    }
  }
  return Object.freeze({ version: NCAAF_V4_2026_FEATURE_BRIDGE_VERSION, inputs: Object.freeze(inputs), predictions: Object.freeze(predictions), exclusions: Object.freeze(exclusions), audit: Object.freeze(audit) });
}