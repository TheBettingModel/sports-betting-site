import { createHash } from "node:crypto";
import { and, eq, inArray, lt, lte, ne } from "drizzle-orm";
import {
  db,
  NCAAF_FEATURE_SCHEMA_VERSION,
  ncaafEntityObservationsTable,
  ncaafFeatureSnapshotsTable,
  ncaafGameEvidenceTable,
} from "@workspace/db";

export { NCAAF_FEATURE_SCHEMA_VERSION };

/** Every numeric choice affecting an NCAAF feature is versioned in one object. */
export const NCAAF_FEATURE_CONFIG = Object.freeze({
  modelVersion: "ncaaf-market-free-v1",
  priorEquivalentGames: 4,
  recentHalfLifeDays: 28,
  previousSeasonHalfLifeDays: 365,
  minimumCurrentGames: 2,
  minimumPreviousSeasonGames: 3,
  homeEdgePoints: 2.5,
  probabilityScalePoints: 13.5,
  priorEffectiveSampleExponent: 2,
} as const);

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export const NCAAF_FEATURE_CONFIG_HASH = hash(NCAAF_FEATURE_CONFIG);

export interface NcaafFeatureTarget {
  provider: string;
  eventId: string;
  season: number;
  kickoffAt: Date;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  neutralSite?: boolean | null;
}

export interface NcaafEvidenceGame {
  id: number;
  payloadHash: string;
  provider: string;
  providerEventId: string;
  modeledAsOf: Date;
  capturedAt: Date;
  season: number;
  kickoffAt: Date | null;
  gameStatus: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeProviderTeamId: string | null;
  awayProviderTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  neutralSite: boolean | null;
}

export interface NcaafEntityEvidence {
  id: number;
  payloadHash: string;
  provider: string;
  providerEntityId: string;
  entityType: string;
  observationType: string;
  modeledAsOf: Date;
  capturedAt: Date;
  missingFields: unknown;
  missingReasons: unknown;
}

export interface EvidenceReference {
  id: number;
  payloadHash: string;
  provider?: string;
  capturedAt: string;
  modeledAsOf: string;
}

export interface NullableFeature {
  value: null;
  provenance: "ncaaf_entity_observations";
  provider: string | null;
  capturedAt: string | null;
  modeledAsOf: string | null;
  evidence: { id: number; payloadHash: string } | null;
  missingReason: string;
}

export interface TeamFeatureBlock {
  teamId: string | null;
  teamName: string;
  currentGames: number;
  priorGames: number;
  previousSeasonDecay: number;
  effectiveSampleSize: number;
  priorWeight: number;
  currentWeight: number;
  overall: number | null;
  offense: number | null;
  defense: number | null;
  recentForm: number | null;
  locationSplit: { home: number | null; away: number | null };
  previousSeasonPrior: {
    overall: number | null;
    offense: number | null;
    defense: number | null;
    recentForm: number | null;
  };
  uncertainty: number;
  unsupported: Record<string, NullableFeature>;
}

export interface NcaafFeatureSnapshotValue {
  schemaVersion: typeof NCAAF_FEATURE_SCHEMA_VERSION;
  modelVersion: typeof NCAAF_FEATURE_CONFIG.modelVersion;
  configHash: string;
  cutoff: string;
  methodology: {
    opponentAdjustment: string;
    priorBlend: string;
    decay: string;
    uncertainty: string;
  };
  teams: { home: TeamFeatureBlock; away: TeamFeatureBlock };
  quality: {
    sufficientIndependentEvidence: boolean;
    blockedReasons: string[];
    gameEvidence: EvidenceReference[];
    entityEvidence: EvidenceReference[];
    evidenceCount: number;
    latestModeledAsOf: string | null;
  };
  forecast: {
    status: "ready" | "blocked";
    homeWinProbability: number | null;
    projectedMargin: number | null;
    projectedTotal: null;
    projectedTotalMissingReason: string;
    uncertainty: number;
    provenance: "market_free_ncaaf_features_v1";
    blockedReasons: string[];
  };
}

function latestCompletedGames(
  target: NcaafFeatureTarget,
  rows: NcaafEvidenceGame[],
  cutoff: Date,
): NcaafEvidenceGame[] {
  const latest = new Map<string, NcaafEvidenceGame>();
  for (const row of rows) {
    if (row.provider !== target.provider) continue;
    if (row.provider === target.provider && row.providerEventId === target.eventId) continue;
    if (row.modeledAsOf > cutoff || row.capturedAt > cutoff || !row.kickoffAt || row.kickoffAt >= cutoff) continue;
    if (!row.homeProviderTeamId || !row.awayProviderTeamId) continue;
    if (row.homeScore == null || row.awayScore == null) continue;
    if (!["final", "post", "completed"].includes((row.gameStatus ?? "").toLowerCase())) continue;
    const key = `${row.provider}:${row.providerEventId}`;
    const existing = latest.get(key);
    if (!existing || existing.capturedAt < row.capturedAt
      || (existing.capturedAt.getTime() === row.capturedAt.getTime() && existing.id < row.id)) {
      latest.set(key, row);
    }
  }
  return [...latest.values()].sort((a, b) =>
    a.kickoffAt!.getTime() - b.kickoffAt!.getTime() || a.providerEventId.localeCompare(b.providerEventId));
}

function latestEntityRows(
  target: NcaafFeatureTarget,
  rows: NcaafEntityEvidence[],
  cutoff: Date,
): NcaafEntityEvidence[] {
  const teamIds = new Set([target.homeTeamId, target.awayTeamId].filter((id): id is string => Boolean(id)));
  const latest = new Map<string, NcaafEntityEvidence>();
  for (const row of rows) {
    if (row.provider !== target.provider || !teamIds.has(row.providerEntityId)
      || row.modeledAsOf > cutoff || row.capturedAt > cutoff) continue;
    const key = `${row.provider}:${row.providerEntityId}:${row.entityType}:${row.observationType}`;
    const existing = latest.get(key);
    if (!existing || existing.modeledAsOf < row.modeledAsOf
      || (existing.modeledAsOf.getTime() === row.modeledAsOf.getTime() && existing.id < row.id)) {
      latest.set(key, row);
    }
  }
  return [...latest.values()].sort((a, b) => a.id - b.id);
}

type TeamAccumulator = {
  games: Array<{ margin: number; scored: number; allowed: number; opponent: string; atHome: boolean; ageDays: number }>;
  latestKickoff: Date;
};

function seasonRatings(games: NcaafEvidenceGame[], season: number, cutoff: Date): Map<string, TeamAccumulator> {
  const map = new Map<string, TeamAccumulator>();
  const add = (key: string, kickoff: Date, item: TeamAccumulator["games"][number]) => {
    const entry = map.get(key) ?? { games: [], latestKickoff: kickoff };
    entry.games.push(item);
    if (entry.latestKickoff < kickoff) entry.latestKickoff = kickoff;
    map.set(key, entry);
  };
  for (const game of games.filter((g) => g.season === season)) {
    const home = game.homeProviderTeamId!;
    const away = game.awayProviderTeamId!;
    const ageDays = Math.max(0, (cutoff.getTime() - game.kickoffAt!.getTime()) / 86_400_000);
    add(home, game.kickoffAt!, { margin: game.homeScore! - game.awayScore!, scored: game.homeScore!, allowed: game.awayScore!, opponent: away, atHome: true, ageDays });
    add(away, game.kickoffAt!, { margin: game.awayScore! - game.homeScore!, scored: game.awayScore!, allowed: game.homeScore!, opponent: home, atHome: false, ageDays });
  }
  return map;
}

const average = (values: number[]): number | null =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value: number): number => Math.round(value * 1000) / 1000;

function adjusted(map: Map<string, TeamAccumulator>, key: string) {
  const entry = map.get(key);
  if (!entry?.games.length) return null;
  const allMargins = [...map.values()].flatMap((team) => team.games.map((g) => g.margin));
  const allScored = [...map.values()].flatMap((team) => team.games.map((g) => g.scored));
  const leagueMargin = average(allMargins) ?? 0;
  const leaguePoints = average(allScored) ?? 0;
  const opponentMargins = entry.games.map((g) => average(map.get(g.opponent)?.games.map((x) => x.margin) ?? []) ?? leagueMargin);
  const opponentAllowed = entry.games.map((g) => average(map.get(g.opponent)?.games.map((x) => x.allowed) ?? []) ?? leaguePoints);
  const opponentScored = entry.games.map((g) => average(map.get(g.opponent)?.games.map((x) => x.scored) ?? []) ?? leaguePoints);
  const overall = (average(entry.games.map((g) => g.margin)) ?? 0) - (average(opponentMargins) ?? leagueMargin);
  const offense = (average(entry.games.map((g) => g.scored)) ?? leaguePoints) - (average(opponentAllowed) ?? leaguePoints);
  const defense = (average(opponentScored) ?? leaguePoints) - (average(entry.games.map((g) => g.allowed)) ?? leaguePoints);
  const weights = entry.games.map((g) => 2 ** (-g.ageDays / NCAAF_FEATURE_CONFIG.recentHalfLifeDays));
  const recentForm = entry.games.reduce((sum, g, i) => sum + g.margin * weights[i]!, 0)
    / weights.reduce((sum, value) => sum + value, 0);
  return {
    games: entry.games.length, overall, offense, defense, recentForm, latestKickoff: entry.latestKickoff,
    home: average(entry.games.filter((g) => g.atHome).map((g) => g.margin)),
    away: average(entry.games.filter((g) => !g.atHome).map((g) => g.margin)),
  };
}

const FEATURE_OBSERVATION_TYPE: Record<string, string> = {
  quarterback: "player",
  playerAvailability: "player",
  roster: "roster",
  recruiting: "roster",
  transfers: "roster",
  returningProduction: "roster",
  coaching: "team_season",
  continuity: "roster",
};

const UNSUPPORTED_REASONS: Record<string, string> = {
  pace: "No pre-cutoff pace observation is available from the configured evidence providers",
  explosiveness: "No pre-cutoff explosiveness observation is available from the configured evidence providers",
  gameState: "No pre-cutoff game-state observation is available from the configured evidence providers",
  specialTeams: "No pre-cutoff special-teams observation is available from the configured evidence providers",
  quarterback: "No verified pre-cutoff quarterback identity or availability observation is available",
  playerAvailability: "No historical player availability provider is configured",
  replacementValue: "No verified player identity and replacement model is available",
  positionGroups: "No verified position-group observation is available",
  roster: "No historical roster provider is configured",
  recruiting: "No recruiting evidence provider is configured",
  transfers: "No transfer evidence provider is configured",
  returningProduction: "No returning-production evidence provider is configured",
  coaching: "No verified coaching observation is available",
  scheme: "No verified scheme observation is available",
  continuity: "No verified roster/coaching continuity observation is available",
};

function reasonFromRow(row: NcaafEntityEvidence | undefined, feature: string): string {
  const reasons = row?.missingReasons && typeof row.missingReasons === "object"
    ? row.missingReasons as Record<string, unknown> : {};
  const aliases: Record<string, string[]> = {
    quarterback: ["quarterback", "starter_probability", "players"],
    playerAvailability: ["injuries", "players"],
    roster: ["roster"],
  };
  for (const key of aliases[feature] ?? [feature]) {
    if (typeof reasons[key] === "string") return reasons[key] as string;
  }
  return UNSUPPORTED_REASONS[feature]!;
}

function unsupportedForTeam(teamId: string | null, entities: NcaafEntityEvidence[]): Record<string, NullableFeature> {
  return Object.fromEntries(Object.keys(UNSUPPORTED_REASONS).map((feature) => {
    const wanted = FEATURE_OBSERVATION_TYPE[feature];
    const row = teamId && wanted
      ? entities.find((item) => item.providerEntityId === teamId
        && (item.entityType === wanted || item.observationType === wanted))
      : undefined;
    return [feature, {
      value: null,
      provenance: "ncaaf_entity_observations" as const,
      provider: row?.provider ?? null,
      capturedAt: row?.capturedAt.toISOString() ?? null,
      modeledAsOf: row?.modeledAsOf.toISOString() ?? null,
      evidence: row ? { id: row.id, payloadHash: row.payloadHash } : null,
      missingReason: reasonFromRow(row, feature),
    }];
  }));
}

function buildTeam(
  targetId: string | null,
  targetName: string,
  current: Map<string, TeamAccumulator>,
  prior: Map<string, TeamAccumulator>,
  entities: NcaafEntityEvidence[],
  cutoff: Date,
): TeamFeatureBlock {
  const now = targetId ? adjusted(current, targetId) : null;
  const previous = targetId ? adjusted(prior, targetId) : null;
  const currentGames = now?.games ?? 0;
  const priorGames = previous?.games ?? 0;
  const priorAgeDays = previous
    ? Math.max(0, (cutoff.getTime() - previous.latestKickoff.getTime()) / 86_400_000)
    : 0;
  const previousSeasonDecay = previous
    ? 2 ** (-priorAgeDays / NCAAF_FEATURE_CONFIG.previousSeasonHalfLifeDays)
    : 0;
  const priorStrength = previous
    ? NCAAF_FEATURE_CONFIG.priorEquivalentGames * previousSeasonDecay
    : 0;
  const denominator = currentGames + priorStrength;
  const currentWeight = round(denominator ? currentGames / denominator : 0);
  const priorWeight = round(denominator ? priorStrength / denominator : 0);
  const blend = (field: "overall" | "offense" | "defense" | "recentForm") => {
    if (now && previous) return now[field] * currentWeight + previous[field] * priorWeight;
    if (now) return now[field];
    if (previous) return previous[field];
    return null;
  };
  const effectiveSampleSize = currentGames + priorGames
    * previousSeasonDecay ** NCAAF_FEATURE_CONFIG.priorEffectiveSampleExponent;
  const nullableRound = (value: number | null) => value == null ? null : round(value);
  return {
    teamId: targetId,
    teamName: targetName,
    currentGames,
    priorGames,
    previousSeasonDecay: round(previousSeasonDecay),
    effectiveSampleSize: round(effectiveSampleSize),
    priorWeight,
    currentWeight,
    overall: nullableRound(blend("overall")),
    offense: nullableRound(blend("offense")),
    defense: nullableRound(blend("defense")),
    recentForm: nullableRound(blend("recentForm")),
    locationSplit: {
      home: now?.home == null ? null : round(now.home),
      away: now?.away == null ? null : round(now.away),
    },
    previousSeasonPrior: {
      overall: previous == null ? null : round(previous.overall),
      offense: previous == null ? null : round(previous.offense),
      defense: previous == null ? null : round(previous.defense),
      recentForm: previous == null ? null : round(previous.recentForm),
    },
    uncertainty: round(Math.min(1, 1 / Math.sqrt(Math.max(1, effectiveSampleSize)))),
    unsupported: unsupportedForTeam(targetId, entities),
  };
}

function selectedEvidence(
  target: NcaafFeatureTarget,
  gameRows: NcaafEvidenceGame[],
  entityRows: NcaafEntityEvidence[],
  cutoff: Date,
) {
  return {
    games: latestCompletedGames(target, gameRows, cutoff),
    entities: latestEntityRows(target, entityRows, cutoff),
  };
}

export function ncaafFeatureInputHash(
  target: NcaafFeatureTarget,
  gameRows: NcaafEvidenceGame[],
  entityRows: NcaafEntityEvidence[],
  cutoff: Date,
): string {
  const selected = selectedEvidence(target, gameRows, entityRows, cutoff);
  return hash({
    configHash: NCAAF_FEATURE_CONFIG_HASH,
    modelVersion: NCAAF_FEATURE_CONFIG.modelVersion,
    target,
    cutoff,
    gameEvidence: selected.games.map((row) => ({ id: row.id, payloadHash: row.payloadHash })),
    entityEvidence: selected.entities.map((row) => ({ id: row.id, payloadHash: row.payloadHash })),
  });
}

export function computeNcaafFeatures(
  target: NcaafFeatureTarget,
  gameRows: NcaafEvidenceGame[],
  entityRows: NcaafEntityEvidence[],
  cutoff = target.kickoffAt,
): NcaafFeatureSnapshotValue {
  const { games, entities } = selectedEvidence(target, gameRows, entityRows, cutoff);
  const current = seasonRatings(games, target.season, cutoff);
  const prior = seasonRatings(games, target.season - 1, cutoff);
  const home = buildTeam(target.homeTeamId, target.homeTeamName, current, prior, entities, cutoff);
  const away = buildTeam(target.awayTeamId, target.awayTeamName, current, prior, entities, cutoff);
  const blockedReasons: string[] = [];
  if (!target.homeTeamId || !target.awayTeamId) blockedReasons.push("missing_verified_team_identity");
  const sufficient = (team: TeamFeatureBlock) =>
    team.currentGames >= NCAAF_FEATURE_CONFIG.minimumCurrentGames
    || (team.currentGames === 0 && team.priorGames >= NCAAF_FEATURE_CONFIG.minimumPreviousSeasonGames);
  if (!sufficient(home)) blockedReasons.push("insufficient_home_independent_evidence");
  if (!sufficient(away)) blockedReasons.push("insufficient_away_independent_evidence");
  const ready = blockedReasons.length === 0;
  const margin = ready
    ? round((home.overall! - away.overall!) + (target.neutralSite ? 0 : NCAAF_FEATURE_CONFIG.homeEdgePoints))
    : null;
  const probability = margin == null
    ? null
    : round(1 / (1 + Math.exp(-margin / NCAAF_FEATURE_CONFIG.probabilityScalePoints)));
  const gameEvidence = games.map((row) => ({
    id: row.id,
    payloadHash: row.payloadHash,
    provider: row.provider,
    capturedAt: row.capturedAt.toISOString(),
    modeledAsOf: row.modeledAsOf.toISOString(),
  }));
  const entityEvidence = entities.map((row) => ({
    id: row.id,
    payloadHash: row.payloadHash,
    provider: row.provider,
    capturedAt: row.capturedAt.toISOString(),
    modeledAsOf: row.modeledAsOf.toISOString(),
  }));
  const modeledDates = [...games, ...entities].map((row) => row.modeledAsOf);
  const latest = modeledDates.reduce<Date | null>((value, date) => !value || date > value ? date : value, null);
  const uncertainty = round(Math.min(1, Math.sqrt((home.uncertainty ** 2 + away.uncertainty ** 2) / 2)));
  return {
    schemaVersion: NCAAF_FEATURE_SCHEMA_VERSION,
    modelVersion: NCAAF_FEATURE_CONFIG.modelVersion,
    configHash: NCAAF_FEATURE_CONFIG_HASH,
    cutoff: cutoff.toISOString(),
    methodology: {
      opponentAdjustment: "Scoring margins and points for/allowed are adjusted by each opponent's observed season baseline; positive defense is points prevented.",
      priorBlend: "Current raw rating and previous-season raw rating are weighted once; the prior pseudo-count decays during the offseason.",
      decay: `Recent form half-life=${NCAAF_FEATURE_CONFIG.recentHalfLifeDays} days; previous-season half-life=${NCAAF_FEATURE_CONFIG.previousSeasonHalfLifeDays} days.`,
      uncertainty: "1/sqrt(effective sample), where prior games contribute squared time-decay weight.",
    },
    teams: { home, away },
    quality: {
      sufficientIndependentEvidence: ready,
      blockedReasons,
      gameEvidence,
      entityEvidence,
      evidenceCount: gameEvidence.length + entityEvidence.length,
      latestModeledAsOf: latest?.toISOString() ?? null,
    },
    forecast: {
      status: ready ? "ready" : "blocked",
      homeWinProbability: probability,
      projectedMargin: margin,
      projectedTotal: null,
      projectedTotalMissingReason: "No supported pre-cutoff drive, pace, or play-level evidence is available for a total forecast",
      uncertainty,
      provenance: "market_free_ncaaf_features_v1",
      blockedReasons,
    },
  };
}

export function assertNcaafFeatureCutoff(cutoff: Date, kickoffAt: Date): void {
  if (cutoff >= kickoffAt) throw new Error("NCAAF feature cutoff must be strictly before kickoff");
}

export async function createNcaafFeatureSnapshot(
  target: NcaafFeatureTarget,
  cutoff = new Date(),
): Promise<{ id: number; snapshot: NcaafFeatureSnapshotValue; inputHash: string }> {
  assertNcaafFeatureCutoff(cutoff, target.kickoffAt);
  const seasons = [target.season, target.season - 1];
  // Deliberately no joins to games, odds_snapshots, or ncaaf_market_observations.
  const [games, entities] = await Promise.all([
    db.select({
      id: ncaafGameEvidenceTable.id,
      payloadHash: ncaafGameEvidenceTable.payloadHash,
      provider: ncaafGameEvidenceTable.provider,
      providerEventId: ncaafGameEvidenceTable.providerEventId,
      modeledAsOf: ncaafGameEvidenceTable.modeledAsOf,
      capturedAt: ncaafGameEvidenceTable.capturedAt,
      season: ncaafGameEvidenceTable.season,
      kickoffAt: ncaafGameEvidenceTable.kickoffAt,
      gameStatus: ncaafGameEvidenceTable.gameStatus,
      homeScore: ncaafGameEvidenceTable.homeScore,
      awayScore: ncaafGameEvidenceTable.awayScore,
      homeProviderTeamId: ncaafGameEvidenceTable.homeProviderTeamId,
      awayProviderTeamId: ncaafGameEvidenceTable.awayProviderTeamId,
      homeTeamName: ncaafGameEvidenceTable.homeTeamName,
      awayTeamName: ncaafGameEvidenceTable.awayTeamName,
      neutralSite: ncaafGameEvidenceTable.neutralSite,
    }).from(ncaafGameEvidenceTable).where(and(
      inArray(ncaafGameEvidenceTable.season, seasons),
      eq(ncaafGameEvidenceTable.provider, target.provider),
      ne(ncaafGameEvidenceTable.providerEventId, target.eventId),
      lte(ncaafGameEvidenceTable.modeledAsOf, cutoff),
      lte(ncaafGameEvidenceTable.capturedAt, cutoff),
      lt(ncaafGameEvidenceTable.kickoffAt, target.kickoffAt),
    )),
    db.select({
      id: ncaafEntityObservationsTable.id,
      payloadHash: ncaafEntityObservationsTable.payloadHash,
      provider: ncaafEntityObservationsTable.provider,
      providerEntityId: ncaafEntityObservationsTable.providerEntityId,
      entityType: ncaafEntityObservationsTable.entityType,
      observationType: ncaafEntityObservationsTable.observationType,
      modeledAsOf: ncaafEntityObservationsTable.modeledAsOf,
      capturedAt: ncaafEntityObservationsTable.capturedAt,
      missingFields: ncaafEntityObservationsTable.missingFields,
      missingReasons: ncaafEntityObservationsTable.missingReasons,
    }).from(ncaafEntityObservationsTable).where(and(
      inArray(ncaafEntityObservationsTable.season, seasons),
      eq(ncaafEntityObservationsTable.provider, target.provider),
      inArray(ncaafEntityObservationsTable.providerEntityId,
        [target.homeTeamId, target.awayTeamId].filter((id): id is string => Boolean(id))),
      lte(ncaafEntityObservationsTable.modeledAsOf, cutoff),
      lte(ncaafEntityObservationsTable.capturedAt, cutoff),
    )),
  ]);
  const snapshot = computeNcaafFeatures(target, games, entities, cutoff);
  const inputHash = ncaafFeatureInputHash(target, games, entities, cutoff);
  const [inserted] = await db.insert(ncaafFeatureSnapshotsTable).values({
    modelVersion: NCAAF_FEATURE_CONFIG.modelVersion,
    configHash: NCAAF_FEATURE_CONFIG_HASH,
    targetProvider: target.provider,
    targetEventId: target.eventId,
    season: target.season,
    homeProviderTeamId: target.homeTeamId,
    awayProviderTeamId: target.awayTeamId,
    dataCutoffAt: cutoff,
    evidenceMaxModeledAsOf: snapshot.quality.latestModeledAsOf
      ? new Date(snapshot.quality.latestModeledAsOf) : null,
    inputHash,
    features: { methodology: snapshot.methodology, teams: snapshot.teams },
    quality: snapshot.quality,
    forecast: snapshot.forecast,
  }).onConflictDoNothing().returning({ id: ncaafFeatureSnapshotsTable.id });
  const id = inserted?.id ?? (await db.select({ id: ncaafFeatureSnapshotsTable.id })
    .from(ncaafFeatureSnapshotsTable).where(and(
      eq(ncaafFeatureSnapshotsTable.schemaVersion, NCAAF_FEATURE_SCHEMA_VERSION),
      eq(ncaafFeatureSnapshotsTable.modelVersion, NCAAF_FEATURE_CONFIG.modelVersion),
      eq(ncaafFeatureSnapshotsTable.configHash, NCAAF_FEATURE_CONFIG_HASH),
      eq(ncaafFeatureSnapshotsTable.targetProvider, target.provider),
      eq(ncaafFeatureSnapshotsTable.targetEventId, target.eventId),
      eq(ncaafFeatureSnapshotsTable.dataCutoffAt, cutoff),
      eq(ncaafFeatureSnapshotsTable.inputHash, inputHash),
    )).limit(1))[0]?.id;
  if (id == null) throw new Error("Unable to persist NCAAF feature snapshot");
  return { id, snapshot, inputHash };
}