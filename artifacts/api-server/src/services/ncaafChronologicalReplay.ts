import { createHash } from "node:crypto";

/** A read-only, point-in-time-safe replay for completed FBS team games. */
export const NCAAF_REPLAY_SEASONS = Object.freeze([2023, 2024, 2025, 2026] as const);
export type NcaafPitClass = "A" | "B" | "C" | "D";

export interface NcaafReplayLineage {
  source: string;
  sourceId: string;
  pitClass: NcaafPitClass;
  effectiveAt: Date;
  capturedAt: Date;
  values?: Readonly<Record<string, unknown>>;
}

export interface NcaafAvailabilityEvidence extends NcaafReplayLineage {
  status: "available" | "limited" | "out" | "unknown";
  impact?: number | null;
}

/** Atomic means one final game result, rather than an aggregate or a market. */
export interface NcaafCompletedAtomicGame {
  stableGameId: string;
  season: number;
  kickoffAt: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  neutralSite: boolean;
  completed: true;
  homeClassification: "FBS";
  awayClassification: "FBS";
  pitLineage?: readonly NcaafReplayLineage[];
  availability?: { home?: NcaafAvailabilityEvidence; away?: NcaafAvailabilityEvidence };
}

export interface NcaafTeamSummary {
  games: number;
  offensePointsPerGame: number | null;
  defensePointsAllowedPerGame: number | null;
}

export interface NcaafReplayFeatures {
  context: { homeField: boolean; neutralSite: boolean };
  elo: { home: number; away: number; difference: number };
  home: { seasonToDate: NcaafTeamSummary; last3: NcaafTeamSummary; last5: NcaafTeamSummary; priorSeason: NcaafTeamSummary; opponentAdjusted: NcaafTeamSummary };
  away: { seasonToDate: NcaafTeamSummary; last3: NcaafTeamSummary; last5: NcaafTeamSummary; priorSeason: NcaafTeamSummary; opponentAdjusted: NcaafTeamSummary };
  availability: {
    home: Readonly<{ status: NcaafAvailabilityEvidence["status"]; impact: number | null; lineage: NcaafAvailabilityEvidence }> | null;
    away: Readonly<{ status: NcaafAvailabilityEvidence["status"]; impact: number | null; lineage: NcaafAvailabilityEvidence }> | null;
  };
  pitLineage: readonly NcaafReplayLineage[];
}

export interface NcaafChronologicalReplayRow {
  stableGameId: string;
  season: number;
  kickoffAt: string;
  features: Readonly<NcaafReplayFeatures>;
  targets: Readonly<{ homeWin: 0 | 1; homeMargin: number; totalPoints: number }>;
  checksum: string;
}

export interface NcaafReplayAudit {
  inputGames: number;
  includedGames: number;
  excluded: Record<string, number>;
  leakage: {
    featuresFrozenBeforeTargets: number;
    stateUpdatedAfterTargets: number;
    postKickoffPitExcluded: number;
    postKickoffAvailabilityExcluded: number;
    invalidPitExcluded: number;
  };
  checksum: string;
}

export interface NcaafChronologicalReplayOptions {
  /**
   * Replay and checksum every eligible game, but retain output rows only for
   * these IDs. State evolution and the canonical audit checksum stay identical
   * to an unfiltered replay.
   */
  retainGameIds?: ReadonlySet<string>;
}

type Result = { scored: number; allowed: number; opponentDefenseAtKickoff: number | null; opponentOffenseAtKickoff: number | null };
type TeamState = { results: Result[]; adjustedScored: number[]; adjustedAllowed: number[]; elo: number };

const EMPTY: NcaafTeamSummary = Object.freeze({ games: 0, offensePointsPerGame: null, defensePointsAllowedPerGame: null });
const isDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime());
const bump = (counts: Record<string, number>, key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
const average = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value: number | null) => value == null ? null : Number(value.toFixed(8));
const canonical = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
  return value;
};
const checksum = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
function summary(results: readonly Result[], take?: number): NcaafTeamSummary {
  const selected = take == null ? results : results.slice(-take);
  if (!selected.length) return EMPTY;
  return deepFreeze({ games: selected.length, offensePointsPerGame: round(average(selected.map((result) => result.scored))),
    defensePointsAllowedPerGame: round(average(selected.map((result) => result.allowed))) });
}
function adjustedSummary(state: TeamState): NcaafTeamSummary {
  if (!state.results.length) return EMPTY;
  return deepFreeze({ games: state.results.length, offensePointsPerGame: round(average(state.adjustedScored)),
    defensePointsAllowedPerGame: round(average(state.adjustedAllowed)) });
}
function stateFor(states: Map<string, TeamState>, team: string): TeamState {
  const existing = states.get(team);
  if (existing) return existing;
  const created: TeamState = { results: [], adjustedScored: [], adjustedAllowed: [], elo: 1500 };
  states.set(team, created);
  return created;
}
function eligible<T extends NcaafReplayLineage>(item: T, kickoff: Date, audit: NcaafReplayAudit, availability = false): boolean {
  if ((item.pitClass !== "A" && item.pitClass !== "B") || !isDate(item.effectiveAt) || !isDate(item.capturedAt)) {
    audit.leakage.invalidPitExcluded++;
    return false;
  }
  if (item.effectiveAt >= kickoff || item.capturedAt >= kickoff) {
    if (availability) audit.leakage.postKickoffAvailabilityExcluded++;
    else audit.leakage.postKickoffPitExcluded++;
    return false;
  }
  return true;
}
function availabilityFor(item: NcaafAvailabilityEvidence | undefined, kickoff: Date, audit: NcaafReplayAudit) {
  if (!item || !eligible(item, kickoff, audit, true)) return null;
  return deepFreeze({ status: item.status, impact: item.impact ?? null, lineage: { ...item, values: item.values ? { ...item.values } : undefined } });
}

export function replayNcaafChronologically(
  input: readonly NcaafCompletedAtomicGame[],
  options: NcaafChronologicalReplayOptions = {},
) {
  const audit: NcaafReplayAudit = { inputGames: input.length, includedGames: 0, excluded: {}, leakage: {
    featuresFrozenBeforeTargets: 0, stateUpdatedAfterTargets: 0, postKickoffPitExcluded: 0, postKickoffAvailabilityExcluded: 0, invalidPitExcluded: 0,
  }, checksum: "" };
  const states = new Map<string, TeamState>();
  const priorSeason = new Map<string, NcaafTeamSummary>();
  const rows: NcaafChronologicalReplayRow[] = [];
  const rowChecksums: string[] = [];
  const seen = new Set<string>();
  const games = [...input].sort((a, b) => (isDate(a.kickoffAt) ? a.kickoffAt.getTime() : Number.MAX_SAFE_INTEGER) - (isDate(b.kickoffAt) ? b.kickoffAt.getTime() : Number.MAX_SAFE_INTEGER)
    || a.stableGameId.localeCompare(b.stableGameId));
  let activeSeason: number | null = null;

  for (const game of games) {
    const reject = (reason: string) => bump(audit.excluded, reason);
    if (!NCAAF_REPLAY_SEASONS.includes(game.season as typeof NCAAF_REPLAY_SEASONS[number])) { reject("season_out_of_bounds"); continue; }
    if (!game.stableGameId?.trim() || !game.homeTeamId?.trim() || !game.awayTeamId?.trim() || game.homeTeamId === game.awayTeamId) { reject("invalid_identity"); continue; }
    if (!isDate(game.kickoffAt) || !game.completed || !Number.isFinite(game.homeScore) || !Number.isFinite(game.awayScore)
      || game.homeClassification !== "FBS" || game.awayClassification !== "FBS") { reject("invalid_atomic_completed_game"); continue; }
    if (seen.has(game.stableGameId)) { reject("duplicate_stable_game_id"); continue; }
    seen.add(game.stableGameId);
    if (activeSeason !== game.season) {
      if (activeSeason != null) for (const [team, state] of states) priorSeason.set(team, summary(state.results));
      states.clear();
      activeSeason = game.season;
    }
    const home = stateFor(states, game.homeTeamId);
    const away = stateFor(states, game.awayTeamId);
    const lineage = (game.pitLineage ?? []).filter((item) => eligible(item, game.kickoffAt, audit))
      .map((item) => ({ ...item, values: item.values ? { ...item.values } : undefined }))
      .sort((a, b) => a.source.localeCompare(b.source) || a.sourceId.localeCompare(b.sourceId));
    const features = deepFreeze({
      context: { homeField: !game.neutralSite, neutralSite: game.neutralSite },
      elo: { home: round(home.elo)!, away: round(away.elo)!, difference: round(home.elo - away.elo)! },
      home: { seasonToDate: summary(home.results), last3: summary(home.results, 3), last5: summary(home.results, 5), priorSeason: priorSeason.get(game.homeTeamId) ?? EMPTY, opponentAdjusted: adjustedSummary(home) },
      away: { seasonToDate: summary(away.results), last3: summary(away.results, 3), last5: summary(away.results, 5), priorSeason: priorSeason.get(game.awayTeamId) ?? EMPTY, opponentAdjusted: adjustedSummary(away) },
      availability: { home: availabilityFor(game.availability?.home, game.kickoffAt, audit), away: availabilityFor(game.availability?.away, game.kickoffAt, audit) },
      pitLineage: lineage,
    });
    audit.leakage.featuresFrozenBeforeTargets++;
    const targets = deepFreeze({ homeWin: (game.homeScore > game.awayScore ? 1 : 0) as 0 | 1, homeMargin: game.homeScore - game.awayScore, totalPoints: game.homeScore + game.awayScore });
    const base = { stableGameId: game.stableGameId, season: game.season, kickoffAt: game.kickoffAt.toISOString(), features, targets };
    const row = deepFreeze({ ...base, checksum: checksum(base) });
    rowChecksums.push(row.checksum);
    if (!options.retainGameIds || options.retainGameIds.has(row.stableGameId)) rows.push(row);
    audit.includedGames++;
    const expectedHome = 1 / (1 + 10 ** ((away.elo - home.elo) / 400));
    const actualHome = game.homeScore === game.awayScore ? .5 : game.homeScore > game.awayScore ? 1 : 0;
    const homeDefense = summary(home.results).defensePointsAllowedPerGame;
    const awayDefense = summary(away.results).defensePointsAllowedPerGame;
    const homeOffense = summary(home.results).offensePointsPerGame;
    const awayOffense = summary(away.results).offensePointsPerGame;
    home.results.push({ scored: game.homeScore, allowed: game.awayScore, opponentDefenseAtKickoff: awayDefense, opponentOffenseAtKickoff: awayOffense });
    away.results.push({ scored: game.awayScore, allowed: game.homeScore, opponentDefenseAtKickoff: homeDefense, opponentOffenseAtKickoff: homeOffense });
    home.adjustedScored.push(game.homeScore - (awayDefense ?? 0)); home.adjustedAllowed.push(game.awayScore - (awayOffense ?? 0));
    away.adjustedScored.push(game.awayScore - (homeDefense ?? 0)); away.adjustedAllowed.push(game.homeScore - (homeOffense ?? 0));
    home.elo = round(home.elo + 20 * (actualHome - expectedHome))!;
    away.elo = round(away.elo - 20 * (actualHome - expectedHome))!;
    audit.leakage.stateUpdatedAfterTargets++;
  }
  audit.checksum = checksum(rowChecksums);
  return deepFreeze({ rows, audit });
}