import { deterministicChecksum, type OfficialMlbScheduleGame, buildStarterEvidence } from "./mlbStarterEvidence224C";

/** Task 239 is append-only: v4 rows remain historical and are never reclassified. */
export const MLB_V4_LEGACY_INPUT_SCHEMA = "mlb-v4-model-input-v4";
export const MLB_V4_INPUT_SCHEMA = "mlb-v4-model-input-v5";
export const MLB_V4_OUTPUT_SCHEMA = "mlb-v4-model-output-v1";
export const MLB_V4_LIVE_VERSION = "mlb-v4-live-foundation-v1";
export const MLB_V4_COLLECTOR_VERSION = "mlb-v4-live-collector-v2";
export const MLB_V4_STARTER_STATE_VERSION = "mlb-v4-starter-pit-v5";
export const MLB_V4_TEAM_STATE_VERSION = "mlb-v4-team-pit-v5";
export const MLB_V4_CONTEXT_VERSION = "mlb-v4-context-v5";
export const MLB_V4_OLD_OOS_STATUS = "HISTORICAL_BENCHMARK_ONLY";
export const MLB_V4_CURRENT_CHAMPION = "tbm-mlb-moneyline-v1";
export const MLB_V4_CADENCE = {
  timezone: "America/New_York",
  discovery: "08:10 daily",
  gameRelativeWindowsMinutes: [720, 360, 180, 60, 30],
  schedulerTickMinutes: 30,
  maximumAttemptsPerLogicalRun: 3,
  retryDelaysSeconds: [30, 120],
  maximumDatesPerRun: 2,
  estimatedRequestsPerGameDay: "up to 48 schedule requests plus bounded retries and at most one final feed per newly final game",
} as const;

export type StarterRole = "TRADITIONAL_STARTER" | "OPENER" | "BULK" | "BULLPEN_GAME" | "EMERGENCY_STARTER" | "UNKNOWN";
export type EvidenceTier = "INELIGIBLE" | "BASELINE_CORE" | "STARTER_CORE" | "ENHANCED";
export type ApprovalStatus = "UNVALIDATED" | "SHADOW" | "PROVISIONAL" | "PRODUCTION_APPROVED" | "SUSPENDED";
export type MaturityStatus = "EXPERIMENTAL" | "DEVELOPING" | "VALIDATED" | "MATURE";

export interface MlbV4ModelInput {
  schemaVersion: typeof MLB_V4_INPUT_SCHEMA;
  gameId: string;
  featureSnapshotId: string;
  featureHash: string;
  featureCutoff: string;
  home: { offense: unknown; starter: unknown; opponentBullpen: unknown };
  away: { offense: unknown; starter: unknown; opponentBullpen: unknown };
  leagueContext: unknown;
  homeContext: unknown;
  parkContext: unknown | null;
  sampleSizes: Record<string, unknown>;
  missingness: Record<string, boolean>;
}

/** Sports opinion only. Sportsbook/market/edge/units fields are structurally absent. */
export interface MlbV4ModelOutput {
  schemaVersion: typeof MLB_V4_OUTPUT_SCHEMA;
  modelId: string; modelVersion: string; gameId: string; forecastGeneratedAt: string;
  featureSnapshotId: string; homeExpectedRunsExact: number; awayExpectedRunsExact: number;
  projectedTotalExact: number; projectedMarginExact: number;
  homeWinProbability: number; awayWinProbability: number;
  fairHomeMoneyline: number; fairAwayMoneyline: number;
  distributionVersion: string; calibrationVersion: string; modelHash: string;
  featureHash: string; forecastHash: string; approvalStatus: ApprovalStatus;
  maturityStatus: MaturityStatus; publicationStatus: "NOT_PUBLISHABLE" | "PUBLISHABLE";
}

const MARKET_KEYS = new Set(["odds", "moneyline", "sportsbook", "market", "price", "line", "edge", "ev", "clv", "units", "impliedprobability"]);
const OUTCOME_KEYS = new Set(["actualstarter", "homeruns", "awayruns", "finalscore", "result", "winner", "runsallowed", "earnedruns"]);
const normalized = (key: string) => key.replace(/[^a-z0-9]/gi, "").toLowerCase();
function forbiddenPaths(value: unknown, forbidden: ReadonlySet<string>, path = "$"): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((v, i) => forbiddenPaths(v, forbidden, `${path}[${i}]`));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    ...(forbidden.has(normalized(key)) ? [`${path}.${key}`] : []),
    ...forbiddenPaths(child, forbidden, `${path}.${key}`),
  ]);
}
export const marketLeakagePathsV4 = (value: unknown) => forbiddenPaths(value, MARKET_KEYS);
export const targetLeakagePathsV4 = (value: unknown) => forbiddenPaths(value, OUTCOME_KEYS);
export function assertSportsForecastFirewall(value: unknown): void {
  const market = marketLeakagePathsV4(value);
  const target = targetLeakagePathsV4(value);
  if (market.length) throw new Error(`MLB V4 MARKET_FIREWALL violation: ${market.join(",")}`);
  if (target.length) throw new Error(`MLB V4 TARGET_LEAKAGE violation: ${target.join(",")}`);
}

export interface Discovery {
  discoveryId: string; runId: string; gameId: string; gameDate: string;
  scheduledFirstPitch: Date; homeTeamId: string; awayTeamId: string; gameStatus: string;
  discoveredAt: Date; source: "MLB_STATS_API"; sourceRecordId: string; rawPayloadHash: string;
  eligibleForPregameCapture: boolean; reasonNotEligible: string | null; artifactHash: string;
}

export function buildDiscovery(runId: string, game: OfficialMlbScheduleGame & { status?: { abstractGameState?: string } }, discoveredAt: Date): Discovery | null {
  if (game.gamePk == null || !game.gameDate || game.teams?.home?.team?.id == null || game.teams.away?.team?.id == null) return null;
  const pitch = new Date(game.gameDate);
  if (Number.isNaN(pitch.getTime())) return null;
  const status = game.status?.abstractGameState ?? "Preview";
  const eligible = discoveredAt < pitch && !["Final", "Cancelled", "Postponed"].includes(status);
  const base = {
    runId, gameId: String(game.gamePk), gameDate: game.gameDate.slice(0, 10), scheduledFirstPitch: pitch,
    homeTeamId: String(game.teams.home.team.id), awayTeamId: String(game.teams.away.team.id),
    gameStatus: status, discoveredAt, source: "MLB_STATS_API" as const, sourceRecordId: String(game.gamePk),
    rawPayloadHash: deterministicChecksum(game), eligibleForPregameCapture: eligible,
    reasonNotEligible: eligible ? null : discoveredAt >= pitch ? "AT_OR_AFTER_FIRST_PITCH" : `GAME_STATUS_${status.toUpperCase()}`,
  };
  const artifactHash = deterministicChecksum(base);
  return { discoveryId: deterministicChecksum({ runId, gameId: base.gameId }), ...base, artifactHash };
}

export interface PriorPitcherAppearance {
  canonicalGameId?: string; completedAt: Date; recordedAt?: Date; gameDate: string; starter: boolean; innings: number | null; battersFaced: number | null;
  pitchCount: number | null; earnedRuns: number | null; hits: number | null; walks: number | null;
  strikeouts: number | null; homeRuns: number | null;
}
const sum = (values: Array<number | null>) => values.reduce<number>((n, v) => n + (v ?? 0), 0);
const strictSum = (values: Array<number | null>): number | null =>
  values.some((value) => value == null) ? null : values.reduce<number>((total, value) => total + value!, 0);
const rate = (n: number, d: number) => d > 0 ? n / d : null;
export type NormalizedTeamSide = "HOME" | "AWAY";
export function normalizeMlbTeamSide(value: unknown): NormalizedTeamSide | null {
  if (typeof value !== "string") return null;
  const normalizedSide = value.trim().toUpperCase();
  return normalizedSide === "HOME" || normalizedSide === "AWAY" ? normalizedSide : null;
}

export type BullpenPitVersion<T = unknown> = {
  canonicalGameId: string;
  canonicalTeamId: string;
  completedAt: Date;
  recordedAt: Date;
  sourceHash: string;
  value: T;
};

/**
 * Chooses exactly one latest version for each canonical game/team. A tie with
 * disagreeing source hashes is not resolvable PIT evidence and is excluded.
 */
export function selectLatestBullpenPitVersions<T>(
  cutoff: Date,
  versions: BullpenPitVersion<T>[],
): { rows: BullpenPitVersion<T>[]; conflicts: string[] } {
  const groups = new Map<string, BullpenPitVersion<T>[]>();
  for (const row of versions) {
    if (!(row.completedAt < cutoff) || !(row.recordedAt < cutoff)) continue;
    const key = `${row.canonicalGameId}:${row.canonicalTeamId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const rows: BullpenPitVersion<T>[] = [];
  const conflicts: string[] = [];
  for (const [key, candidates] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    candidates.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
      || a.sourceHash.localeCompare(b.sourceHash));
    const latestTime = candidates.at(-1)!.recordedAt.getTime();
    const latest = candidates.filter((candidate) => candidate.recordedAt.getTime() === latestTime);
    if (new Set(latest.map((candidate) => candidate.sourceHash)).size !== 1) {
      conflicts.push(key);
      continue;
    }
    rows.push(latest.at(-1)!);
  }
  rows.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime()
    || a.canonicalGameId.localeCompare(b.canonicalGameId)
    || a.canonicalTeamId.localeCompare(b.canonicalTeamId));
  return { rows, conflicts };
}

export function materializeTeamOffensePitState(input: { cutoff: Date; rows: Array<{ completedAt: Date; recordedAt?: Date; runs: number; home: boolean }> }) {
  const rows = input.rows.filter((r) => r.completedAt < input.cutoff && (!r.recordedAt || r.recordedAt < input.cutoff))
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  const aggregate = (values: typeof rows) => ({ games: values.length, runs: sum(values.map((r) => r.runs)), runsPerGame: rate(sum(values.map((r) => r.runs)), values.length) });
  const currentYear = input.cutoff.getUTCFullYear();
  const current = rows.filter((r) => r.completedAt.getUTCFullYear() === currentYear);
  const prior = rows.filter((r) => r.completedAt.getUTCFullYear() === currentYear - 1);
  return { features: { rolling: Object.fromEntries([5, 10, 20, 30].map((n) => [`games${n}`, aggregate(current.slice(-n))])),
    currentSeason: aggregate(current), priorSeason: aggregate(prior),
    currentSeasonHome: aggregate(current.filter((r) => r.home)), currentSeasonAway: aggregate(current.filter((r) => !r.home)) },
    sampleSizes: { eligibleCompletedGames: rows.length, currentSeasonGames: current.length, priorSeasonGames: prior.length },
    missingness: { noEligibleCompletedGames: rows.length === 0, noCurrentSeasonGames: current.length === 0, noPriorSeasonGames: prior.length === 0 },
    sourceCutoff: rows.at(-1)?.completedAt ?? null };
}

export function materializeLeagueEnvironmentPitState(input: {
  cutoff: Date;
  rows: Array<{
    canonicalGameId: string;
    completedAt: Date;
    recordedAt?: Date;
    homeRuns: number;
    awayRuns: number;
  }>;
}) {
  const season = input.cutoff.getUTCFullYear();
  const ordered = input.rows
    .filter((row) => row.completedAt < input.cutoff
      && (!row.recordedAt || row.recordedAt < input.cutoff)
      && row.completedAt.getUTCFullYear() === season)
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime()
      || (a.recordedAt?.getTime() ?? 0) - (b.recordedAt?.getTime() ?? 0)
      || a.canonicalGameId.localeCompare(b.canonicalGameId));
  const rows = [...new Map(ordered.map((row) => [row.canonicalGameId, row])).values()];
  const rateFor = (values: typeof rows): number | null =>
    values.length
      ? values.reduce((total, row) => total + row.homeRuns + row.awayRuns, 0) / (2 * values.length)
      : null;
  const inDays = (days: number) => rows.filter((row) =>
    input.cutoff.getTime() - row.completedAt.getTime() <= days * 86_400_000);
  return {
    features: {
      priorGames: rows.length,
      runsPerTeamGame7d: rateFor(inDays(7)),
      runsPerTeamGame14d: rateFor(inDays(14)),
      runsPerTeamGame30d: rateFor(inDays(30)),
      seasonRunsPerTeamGame: rateFor(rows),
    },
    sampleSizes: {
      seasonGames: rows.length,
      games7d: inDays(7).length,
      games14d: inDays(14).length,
      games30d: inDays(30).length,
    },
    missingness: {
      noSeasonGames: rows.length === 0,
      noGames7d: inDays(7).length === 0,
      noGames14d: inDays(14).length === 0,
      noGames30d: inDays(30).length === 0,
    },
    sourceCutoff: rows.at(-1)?.completedAt ?? null,
  };
}
export function materializeBullpenPitState(input: { cutoff: Date; rows: Array<{ completedAt: Date; recordedAt?: Date; innings: number | null; pitches: number | null; relievers: number | null; earnedRuns: number | null }> }) {
  const rows = input.rows.filter((r) => r.completedAt < input.cutoff && (!r.recordedAt || r.recordedAt < input.cutoff))
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  const days = (n: number) => rows.filter((r) => input.cutoff.getTime() - r.completedAt.getTime() <= n * 86_400_000);
  const aggregate = (values: typeof rows) => {
    const innings = strictSum(values.map((r) => r.innings));
    const earnedRuns = strictSum(values.map((r) => r.earnedRuns));
    return {
      games: values.length,
      innings,
      pitches: strictSum(values.map((r) => r.pitches)),
      relievers: strictSum(values.map((r) => r.relievers)),
      era: innings == null || earnedRuns == null ? null : rate(9 * earnedRuns, innings),
    };
  };
  return { features: { workload: { days1: aggregate(days(1)), days3: aggregate(days(3)), days7: aggregate(days(7)) }, rolling: Object.fromEntries([5, 10, 20, 30].map((n) => [`games${n}`, aggregate(rows.slice(-n))])), restDays: rows.length ? Math.floor((input.cutoff.getTime() - rows.at(-1)!.completedAt.getTime()) / 86_400_000) : null },
    sampleSizes: { eligibleBullpenGames: rows.length }, missingness: { noEligibleBullpenGames: rows.length === 0 }, sourceCutoff: rows.at(-1)?.completedAt ?? null };
}
export function materializeStarterPitState(input: {
  starterSnapshotId: number; gameId: string; teamId: string; pitcherId: string; featureCutoff: Date;
  appearances: PriorPitcherAppearance[]; priorSeasonAvailable?: boolean; roleEvidence?: StarterRole;
}) {
  const eligibleAppearances = input.appearances.filter((a) => a.completedAt < input.featureCutoff
      && (!a.recordedAt || a.recordedAt < input.featureCutoff))
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime()
      || (a.recordedAt?.getTime() ?? 0) - (b.recordedAt?.getTime() ?? 0));
  const appearancesByGame = new Map<string, PriorPitcherAppearance>();
  eligibleAppearances.forEach((appearance, index) => {
    appearancesByGame.set(appearance.canonicalGameId ?? `unkeyed:${index}`, appearance);
  });
  const appearances = [...appearancesByGame.values()]
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  const starts = appearances.filter((a) => a.starter);
  const season = starts.filter((a) => a.gameDate.slice(0, 4) === input.featureCutoff.getUTCFullYear().toString());
  const last = starts.at(-1) ?? null;
  const rolling = (n: number) => starts.slice(-n);
  const innings = sum(season.map((a) => a.innings));
  const earnedRuns = sum(season.map((a) => a.earnedRuns));
  const walks = sum(season.map((a) => a.walks));
  const strikeouts = sum(season.map((a) => a.strikeouts));
  const battersFaced = sum(season.map((a) => a.battersFaced));
  const features = {
    seasonAppearances: appearances.filter((a) => a.gameDate.slice(0, 4) === input.featureCutoff.getUTCFullYear().toString()).length,
    seasonStarts: season.length, seasonInnings: innings, careerAppearances: appearances.length,
    careerStarts: starts.length, careerInnings: sum(appearances.map((a) => a.innings)),
    daysSinceLastAppearance: appearances.length ? Math.floor((input.featureCutoff.getTime() - appearances.at(-1)!.completedAt.getTime()) / 86_400_000) : null,
    daysSinceLastStart: last ? Math.floor((input.featureCutoff.getTime() - last.completedAt.getTime()) / 86_400_000) : null,
    lastStartInnings: last?.innings ?? null, lastStartPitchCount: last?.pitchCount ?? null,
    rolling3StartInnings: sum(rolling(3).map((a) => a.innings)),
    rolling5StartInnings: sum(rolling(5).map((a) => a.innings)),
    rolling3StartEra: rate(9 * sum(rolling(3).map((a) => a.earnedRuns)), sum(rolling(3).map((a) => a.innings))),
    rolling5StartEra: rate(9 * sum(rolling(5).map((a) => a.earnedRuns)), sum(rolling(5).map((a) => a.innings))),
    seasonEra: rate(9 * earnedRuns, innings), seasonWhip: rate(walks + sum(season.map((a) => a.hits)), innings),
    seasonStrikeoutRate: rate(strikeouts, battersFaced), seasonWalkRate: rate(walks, battersFaced),
    seasonStrikeoutMinusWalkRate: rate(strikeouts - walks, battersFaced),
    seasonHomeRunRate: rate(sum(season.map((a) => a.homeRuns)), battersFaced),
    recentInningsPerStart: rate(sum(rolling(5).map((a) => a.innings)), rolling(5).length),
    recentPitchesPerStart: rate(sum(rolling(5).map((a) => a.pitchCount)), rolling(5).length),
    recentBattersFacedPerStart: rate(sum(rolling(5).map((a) => a.battersFaced)), rolling(5).length),
  };
  const sourceCutoff = appearances.at(-1)?.completedAt ?? null;
  const rookie = appearances.length === 0;
  const base = {
    starterSnapshotId: input.starterSnapshotId, gameId: input.gameId, teamId: input.teamId,
    pitcherId: input.pitcherId, featureCutoff: input.featureCutoff,
    stateSchemaVersion: MLB_V4_STARTER_STATE_VERSION, sourceFoundation: "mlb-historical-2023-2026-pitcher-bullpen-pit-v5",
    sourceCutoff, role: input.roleEvidence ?? "UNKNOWN" as StarterRole, features,
    sampleSizes: { appearances: appearances.length, starts: starts.length, seasonStarts: season.length },
    missingness: { priorSeason: !input.priorSeasonAvailable, noMlbAppearances: rookie, pitchCount: starts.some((a) => a.pitchCount == null) },
    rookie,
  };
  const artifactHash = deterministicChecksum(base);
  return { stateId: deterministicChecksum({ snapshot: input.starterSnapshotId, artifactHash }), ...base, artifactHash };
}

export interface ComponentState { id: string; hash: string; features: unknown; sampleSizes: unknown; missingness: unknown; sourceCutoff: Date | null }
export function freezePregameFeatureSnapshot(input: {
  gameId: string; scheduledFirstPitch: Date; featureCutoff: Date;
  homeOffense?: ComponentState; awayOffense?: ComponentState; homeStarter?: ComponentState; awayStarter?: ComponentState;
  homeBullpen?: ComponentState; awayBullpen?: ComponentState; league?: ComponentState; homeContext?: ComponentState;
  park?: ComponentState; enhanced?: boolean;
}) {
  if (!(input.featureCutoff < input.scheduledFirstPitch)) throw new Error("Feature cutoff must be strictly pregame");
  const components = [input.homeOffense, input.awayOffense, input.homeStarter, input.awayStarter,
    input.homeBullpen, input.awayBullpen, input.league, input.homeContext, input.park].filter(Boolean) as ComponentState[];
  if (components.some((c) => c.sourceCutoff && !(c.sourceCutoff < input.featureCutoff))) throw new Error("PIT chronology violation");
  const baseline = Boolean(input.homeOffense && input.awayOffense && input.homeBullpen && input.awayBullpen && input.league && input.homeContext);
  const starter = baseline && Boolean(input.homeStarter && input.awayStarter);
  const enhanced = starter && Boolean(input.enhanced && input.park);
  const tier: EvidenceTier = enhanced ? "ENHANCED" : starter ? "STARTER_CORE" : baseline ? "BASELINE_CORE" : "INELIGIBLE";
  // Opponent mapping is explicit: HOME offense receives AWAY bullpen and vice versa.
  const features = {
    home: { offense: input.homeOffense?.features ?? null, starter: input.homeStarter?.features ?? null, opponentBullpen: input.awayBullpen?.features ?? null },
    away: { offense: input.awayOffense?.features ?? null, starter: input.awayStarter?.features ?? null, opponentBullpen: input.homeBullpen?.features ?? null },
    leagueContext: input.league?.features ?? null, homeContext: input.homeContext?.features ?? null, parkContext: input.park?.features ?? null,
  };
  assertSportsForecastFirewall(features);
  const base = {
    gameId: input.gameId, scheduledFirstPitch: input.scheduledFirstPitch, featureCutoff: input.featureCutoff,
    schemaVersion: MLB_V4_INPUT_SCHEMA, evidenceTier: tier,
    componentIds: components.map((c) => c.id), componentHashes: components.map((c) => c.hash),
    features, sampleSizes: Object.fromEntries(components.map((c) => [c.id, c.sampleSizes])),
    missingness: Object.fromEntries(components.map((c) => [c.id, c.missingness])),
    pitSafe: true, baselineCoreEligible: baseline, starterCoreEligible: starter, enhancedEligible: enhanced,
  };
  const artifactHash = deterministicChecksum(base);
  return { snapshotId: deterministicChecksum({ gameId: input.gameId, cutoff: input.featureCutoff, artifactHash }), ...base, artifactHash };
}

export function buildGameOutcome(input: { gameId: string; finalStatus: string; homeRuns: number; awayRuns: number; completedAt: Date; source: string; rawPayload: unknown }) {
  if (!["Final", "Game Over", "Completed Early"].includes(input.finalStatus)) throw new Error("Outcome is not legitimately final");
  const base = { gameId: input.gameId, finalStatus: input.finalStatus, homeRuns: input.homeRuns, awayRuns: input.awayRuns,
    totalRuns: input.homeRuns + input.awayRuns, margin: input.homeRuns - input.awayRuns,
    winner: input.homeRuns > input.awayRuns ? "HOME" : input.awayRuns > input.homeRuns ? "AWAY" : "TIE",
    completedAt: input.completedAt, outcomeSource: input.source, rawPayloadHash: deterministicChecksum(input.rawPayload),
    outcomeSchemaVersion: "mlb-v4-game-outcome-v1" };
  const artifactHash = deterministicChecksum(base);
  return { outcomeId: deterministicChecksum({ gameId: input.gameId, hash: artifactHash }), ...base, artifactHash };
}

export function classifyStarterAgreement(latestSafePitcherId: string | null, actualPitcherId: string | null, changedAfterCutoff = false):
  "MATCHED" | "CHANGED" | "LATE_SCRATCH" | "UNKNOWN" | "AMBIGUOUS" {
  if (!latestSafePitcherId || !actualPitcherId) return "UNKNOWN";
  if (latestSafePitcherId === actualPitcherId) return "MATCHED";
  return changedAfterCutoff ? "LATE_SCRATCH" : "CHANGED";
}

export function pairFeatureOutcome(input: {
  feature: ReturnType<typeof freezePregameFeatureSnapshot>; outcome: ReturnType<typeof buildGameOutcome>;
  starterOutcomeIds?: string[]; bullpenOutcomeIds?: string[]; starterAgreement?: Record<string, string>;
}) {
  if (input.feature.gameId !== input.outcome.gameId) throw new Error("Cannot pair different games");
  const reasons: string[] = [];
  if (!input.feature.pitSafe) reasons.push("FEATURE_NOT_PIT_SAFE");
  if (!input.feature.baselineCoreEligible) reasons.push("BASELINE_COMPONENT_MISSING");
  if (!input.feature.starterCoreEligible) reasons.push("STARTER_COMPONENT_MISSING");
  const starterComplete = (input.starterOutcomeIds?.length ?? 0) === 2;
  const bullpenComplete = (input.bullpenOutcomeIds?.length ?? 0) === 2;
  const agreementResolved = Object.values(input.starterAgreement ?? {}).length === 2
    && Object.values(input.starterAgreement ?? {}).every((v) => ["MATCHED", "CHANGED", "LATE_SCRATCH", "AMBIGUOUS"].includes(v));
  const outcomeComplete = Number.isInteger(input.outcome.homeRuns) && Number.isInteger(input.outcome.awayRuns)
    && starterComplete && bullpenComplete && agreementResolved;
  if (!outcomeComplete) reasons.push("OUTCOME_INCOMPLETE");
  const base = { gameId: input.feature.gameId, featureSnapshotId: input.feature.snapshotId, gameOutcomeId: input.outcome.outcomeId,
    starterOutcomeIds: input.starterOutcomeIds ?? [], bullpenOutcomeIds: input.bullpenOutcomeIds ?? [],
    starterAgreement: input.starterAgreement ?? {}, evidenceTier: input.feature.evidenceTier, pitSafe: input.feature.pitSafe,
    starterSafe: input.feature.starterCoreEligible, outcomeComplete, baselineCoreEligible: input.feature.baselineCoreEligible,
    starterCoreEligible: input.feature.starterCoreEligible, enhancedEligible: input.feature.enhancedEligible,
    ineligibilityReasons: reasons, qualityStatus: reasons.length ? "PARTIAL" : "COMPLETE" };
  const artifactHash = deterministicChecksum(base);
  return { pairId: deterministicChecksum({ feature: input.feature.snapshotId, outcome: input.outcome.outcomeId }), ...base, artifactHash };
}

export function pureForecastMetrics(rows: Array<{ homeExpected: number; awayExpected: number; homeWinProbability: number; homeRuns: number; awayRuns: number }>) {
  if (!rows.length) return null;
  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const sq = (n: number) => n * n;
  const totalErrors = rows.map((r) => r.homeExpected + r.awayExpected - r.homeRuns - r.awayRuns);
  const marginErrors = rows.map((r) => r.homeExpected - r.awayExpected - (r.homeRuns - r.awayRuns));
  const outcomes = rows.map((r) => r.homeRuns > r.awayRuns ? 1 : 0);
  return {
    homeRunMae: avg(rows.map((r) => Math.abs(r.homeExpected - r.homeRuns))),
    awayRunMae: avg(rows.map((r) => Math.abs(r.awayExpected - r.awayRuns))),
    totalMae: avg(totalErrors.map(Math.abs)), totalRmse: Math.sqrt(avg(totalErrors.map(sq))), totalBias: avg(totalErrors),
    marginMae: avg(marginErrors.map(Math.abs)), marginRmse: Math.sqrt(avg(marginErrors.map(sq))),
    winnerAccuracy: avg(rows.map((r, i) => (r.homeWinProbability >= .5) === (outcomes[i] === 1) ? 1 : 0)),
    brier: avg(rows.map((r, i) => sq(r.homeWinProbability - outcomes[i]!))),
    logLoss: avg(rows.map((r, i) => -(outcomes[i]! * Math.log(Math.max(1e-15, r.homeWinProbability)) + (1 - outcomes[i]!) * Math.log(Math.max(1e-15, 1 - r.homeWinProbability))))),
    predictedAverageTotal: avg(rows.map((r) => r.homeExpected + r.awayExpected)),
    actualAverageTotal: avg(rows.map((r) => r.homeRuns + r.awayRuns)),
  };
}

export function shouldCollectAt(now: Date, firstPitch: Date, priorWindowMinutes: readonly number[]): number | null {
  const minutes = (firstPitch.getTime() - now.getTime()) / 60_000;
  return MLB_V4_CADENCE.gameRelativeWindowsMinutes.find((window) => minutes <= window && minutes > window - MLB_V4_CADENCE.schedulerTickMinutes
    && !priorWindowMinutes.includes(window)) ?? null;
}

export interface CollectionRunResult {
  runId: string; logicalRunId: string; retryOfRunId: string | null; startedAt: Date; completedAt: Date;
  executionDate: string; requestCount: number; discoveries: Discovery[]; starterRows: ReturnType<typeof buildStarterEvidence>;
  counters: { expected: number; observed: number; inserted: number; unchanged: number; rejected: number; notDue: number; sourceErrors: number; timeouts: number; rateLimits: number };
  status: "SUCCEEDED" | "PARTIAL" | "FAILED"; errorSummary: string | null; artifactHash: string;
}
export interface LiveCollectionRepository {
  appendRunEvent(event: CollectionRunEvent): Promise<void>;
  appendRun(result: CollectionRunResult): Promise<void>;
  appendDiscoveries(rows: Discovery[], startedEventId: string): Promise<number>;
  appendStarterRows(runId: string, rows: ReturnType<typeof buildStarterEvidence>): Promise<{ inserted: number; unchanged: number }>;
}
export type CollectionRunEvent = {
  eventId: string; runId: string; logicalRunId: string; retryOfRunId: string | null;
  eventType: "STARTED" | "COMPLETED" | "PARTIAL" | "FAILED" | "DOWNSTREAM_COMPLETED" | "DOWNSTREAM_FAILED"; occurredAt: Date; detail: Record<string, unknown>; artifactHash: string;
};
export interface LiveScheduleClient { get(date: string): Promise<{ games: Array<OfficialMlbScheduleGame & { status?: { abstractGameState?: string } }> }> }

/** One bounded attempt. Retry lineage is explicit; no loops, sleeps, or cross-sport calls. */
export async function runMlbV4CollectionAttempt(input: {
  date: string; attempt: number; logicalRunId: string; retryOfRunId?: string; now: () => Date;
  client: LiveScheduleClient; repository: LiveCollectionRepository; captureWindowOnly?: boolean;
}): Promise<CollectionRunResult> {
  if (input.attempt < 1 || input.attempt > MLB_V4_CADENCE.maximumAttemptsPerLogicalRun) throw new Error("Retry bound exceeded");
  const startedAt = input.now();
  // Stable per logical due window/attempt: a process restart cannot create a
  // second semantic capture identity for the same 30-minute window.
  const runId = deterministicChecksum({ logicalRunId: input.logicalRunId, attempt: input.attempt });
  const startedEvent: CollectionRunEvent = {
    eventId: deterministicChecksum({ runId, type: "STARTED" }), runId, logicalRunId: input.logicalRunId,
    retryOfRunId: input.retryOfRunId ?? null, eventType: "STARTED", occurredAt: startedAt,
    detail: { executionDate: input.date, attempt: input.attempt }, artifactHash: deterministicChecksum({ runId, type: "STARTED", startedAt }),
  };
  await input.repository.appendRunEvent(startedEvent);
  let requestCount = 0;
  let discoveries: Discovery[] = [];
  let starterRows: ReturnType<typeof buildStarterEvidence> = [];
  let expected = 0; let notDue = 0;
  let inserted = 0; let unchanged = 0; let sourceErrors = 0; let timeouts = 0; let rateLimits = 0; let errorSummary: string | null = null;
  try {
    requestCount++;
    const schedule = await input.client.get(input.date);
    const observedAt = input.now();
    discoveries = schedule.games.map((g) => buildDiscovery(runId, g, observedAt)).filter((d): d is Discovery => d !== null);
    await input.repository.appendDiscoveries(discoveries, startedEvent.eventId);
    const eligibleGameIds = new Set(discoveries.filter((d) => d.eligibleForPregameCapture).map((d) => d.gameId));
    const dueGames = schedule.games.filter((g) => {
      const gameId = String(g.gamePk ?? "");
      if (!eligibleGameIds.has(gameId)) return false;
      return !input.captureWindowOnly
        || (g.gameDate != null && shouldCollectAt(observedAt, new Date(g.gameDate), []) !== null);
    });
    expected = dueGames.length * 2;
    notDue = Math.max(0, eligibleGameIds.size * 2 - expected);
    starterRows = dueGames.flatMap((g) => buildStarterEvidence(g, observedAt));
    const result = await input.repository.appendStarterRows(runId, starterRows);
    inserted = result.inserted; unchanged = result.unchanged;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errorSummary = message.slice(0, 1000); sourceErrors = 1;
    if (/timeout/i.test(message)) timeouts = 1;
    if (/429|rate.?limit/i.test(message)) rateLimits = 1;
  }
  const completedAt = input.now();
  const counters = { expected,
    observed: starterRows.length, inserted, unchanged,
    rejected: discoveries.filter((d) => !d.eligibleForPregameCapture).length * 2,
    notDue, sourceErrors, timeouts, rateLimits };
  const status = sourceErrors ? "FAILED" as const : counters.observed < counters.expected ? "PARTIAL" as const : "SUCCEEDED" as const;
  const base = { runId, logicalRunId: input.logicalRunId, retryOfRunId: input.retryOfRunId ?? null,
    startedAt, completedAt, executionDate: input.date, requestCount, discoveries, starterRows, counters, status, errorSummary };
  const result = { ...base, artifactHash: deterministicChecksum(base) };
  await input.repository.appendRun(result);
  await input.repository.appendRunEvent({
    eventId: deterministicChecksum({ runId, type: result.status }), runId, logicalRunId: input.logicalRunId,
    retryOfRunId: input.retryOfRunId ?? null, eventType: result.status === "SUCCEEDED" ? "COMPLETED" : result.status,
    occurredAt: completedAt, detail: { requestCount, counters, errorSummary }, artifactHash: deterministicChecksum({ runId, status: result.status, completedAt, counters }),
  });
  return result;
}

/** Bounded retry driver. It is deliberately finite and records every attempt. */
export async function runBoundedMlbV4Collection(input: Omit<Parameters<typeof runMlbV4CollectionAttempt>[0], "attempt" | "retryOfRunId"> & { wait?: (milliseconds: number) => Promise<void> }): Promise<CollectionRunResult> {
  let priorRunId: string | undefined;
  let last: CollectionRunResult | undefined;
  for (let attempt = 1; attempt <= MLB_V4_CADENCE.maximumAttemptsPerLogicalRun; attempt++) {
    if (attempt > 1) {
      const milliseconds = MLB_V4_CADENCE.retryDelaysSeconds[attempt - 2]! * 1_000;
      await (input.wait ?? ((delay) => new Promise<void>((resolve) => setTimeout(resolve, delay))))(milliseconds);
    }
    last = await runMlbV4CollectionAttempt({ ...input, attempt, retryOfRunId: priorRunId });
    if (last.status !== "FAILED") return last;
    priorRunId = last.runId;
  }
  return last!;
}

export type ReadinessCounts = {
  collectionRuns: number; scheduledGames: number; capturedGames: number; bothStarterGames: number;
  starterStates: number; featureSnapshots: number; baselineSnapshots: number; starterCoreSnapshots: number; completedPairs: number;
  starterCorePairs: number; teamsRepresented: number; uniqueStarters: number; repeatStarters: number;
  pitViolations: number; marketLeakage: number; targetLeakage: number; actualStarterLeakage: number;
  sourceFailures: number; successfulLifecycleCycles: number; lastAttempt: string | null; lastSuccessfulRun: string | null; latestArtifactHash: string | null;
};
export function buildReadiness(counts: ReadinessCounts, now: Date) {
  const integrity = counts.pitViolations + counts.marketLeakage + counts.targetLeakage + counts.actualStarterLeakage === 0;
  const pipelineReady = integrity && counts.successfulLifecycleCycles > 0 && counts.starterStates > 0 && counts.featureSnapshots > 0;
  const evidenceReady = pipelineReady && counts.completedPairs > 0 && counts.starterCorePairs > 0
    && counts.teamsRepresented === 30 && counts.repeatStarters > 0 && counts.starterStates > 0;
  return {
    schemaVersion: MLB_V4_LIVE_VERSION, foundationStatus: pipelineReady ? "PIPELINE_READY" : "FOUNDATION_PARTIAL",
    collectorStatus: counts.sourceFailures ? "DEGRADED" : counts.collectionRuns ? "HEALTHY" : "NO_RUNS",
    starterCaptureStatus: counts.bothStarterGames ? "ACCUMULATING" : "EMPTY",
    starterStateStatus: counts.starterStates ? "ACCUMULATING" : "EMPTY",
    featureSnapshotStatus: counts.featureSnapshots
      ? counts.baselineSnapshots ? "ACCUMULATING" : "ACCUMULATING_INELIGIBLE"
      : "EMPTY",
    outcomePairingStatus: counts.completedPairs ? "ACCUMULATING" : "EMPTY",
    prospectiveEvidenceStatus: evidenceReady ? "MODEL_EVIDENCE_READY" : "EVIDENCE_ACCUMULATING",
    modelTrainingStatus: "NOT_RUN", shadowValidationStatus: "NOT_STARTED", promotionStatus: "NOT_PROMOTED",
    productionStatus: "MLB_V1_UNCHANGED", pipelineReady, modelEvidenceReady: evidenceReady, modelReady: false, productionReady: false,
    integrity: { ...counts, crossSportContamination: 0 }, criticalBlockers: integrity ? [] : ["INTEGRITY_AUDIT_FAILED"],
    highBlockers: evidenceReady ? [] : ["PROSPECTIVE_EVIDENCE_NOT_YET_SUFFICIENT"],
    warnings: counts.sourceFailures ? ["SOURCE_FAILURES_RECORDED"] : [], lastUpdated: now.toISOString(),
  };
}