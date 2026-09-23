import { createHash } from "node:crypto";

export const NCAAF_HISTORICAL_TRAINING_SCHEMA_VERSION: "ncaaf-historical-team-game-v2" = "ncaaf-historical-team-game-v2";
export const NCAAF_HISTORICAL_SEASONS = Object.freeze([2023, 2024, 2025, 2026] as const);
export type HistoricalPitClass = "A" | "B" | "C" | "D";

export interface HistoricalEvidenceLineage {
  source: string;
  sourceId: string;
  pitClass: HistoricalPitClass;
  effectiveAt: Date | null;
  capturedAt: Date;
  /** Exact canonical team linkage only; no player-name or display-name bridge. */
  canonicalTeamId?: string | null;
  values: Record<string, unknown>;
}

export interface HistoricalQbEvidence {
  cfbdPlayerId: string;
  cfbdTeamId: string;
  canonicalTeamId: string;
  position: string | null;
  effectiveAt: Date | null;
  capturedAt: Date;
  stats: Record<string, number | null>;
}

export interface HistoricalGameInput {
  canonicalProvider: string;
  canonicalEventId: string;
  season: number;
  week?: number | null;
  kickoffAt: Date;
  /** Provider-confirmed completion time. When absent, kickoff + six hours is used conservatively. */
  completionAvailableAt?: Date | null;
  homeCanonicalTeamId: string | null;
  awayCanonicalTeamId: string | null;
  homeClassification: string | null;
  awayClassification: string | null;
  /** Provider must explicitly mark the game complete; scores alone are not enough. */
  completed: boolean;
  homeScore: number | null;
  awayScore: number | null;
  neutralSite?: boolean | null;
  evidence?: readonly HistoricalEvidenceLineage[];
  qbEvidence?: readonly HistoricalQbEvidence[];
}

export interface HistoricalTrainingRow {
  schemaVersion: typeof NCAAF_HISTORICAL_TRAINING_SCHEMA_VERSION;
  canonicalProvider: string;
  canonicalEventId: string;
  season: number;
  week: number | null;
  kickoffAt: string;
  pregameCutoffAt: string;
  homeCanonicalTeamId: string;
  awayCanonicalTeamId: string;
  targets: { homeWin: 0 | 1; homeMargin: number; totalPoints: number };
  features: {
    neutralSite: boolean | null;
    rolling: { home: HistoricalRollingTeamFeatures; away: HistoricalRollingTeamFeatures };
    qb: { home: HistoricalQbEvidence | null; away: HistoricalQbEvidence | null };
  };
  pitLineage: HistoricalEvidenceLineage[];
  quality: { fbsEligible: true; eligibleEvidence: number; excludedEvidence: Record<string, number>; qbEvidence: Record<string, string> };
  checksum: string;
}

export interface HistoricalRollingTeamFeatures {
  priorGameCount: number;
  averagePointsFor: number | null;
  averagePointsAgainst: number | null;
  averageMargin: number | null;
  recentForm: number[];
  enoughHistory: boolean;
}

export interface HistoricalDatasetQualityReport {
  schemaVersion: typeof NCAAF_HISTORICAL_TRAINING_SCHEMA_VERSION;
  requestedSeasons: number[];
  inputGames: number;
  includedRows: number;
  excluded: Record<string, number>;
  pitClassesIncluded: Record<HistoricalPitClass, number>;
  pitClassesExcluded: Record<HistoricalPitClass, number>;
  qbEvidenceRows: number;
  checksum: string;
}

function validDate(value: Date | null): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
  return value;
}
function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function bump(target: Record<string, number>, key: string) { target[key] = (target[key] ?? 0) + 1; }
function isFbs(value: string | null) { return value?.trim().toUpperCase() === "FBS"; }
function pregameCutoff(kickoffAt: Date): Date { return new Date(kickoffAt.getTime() - 1); }
const COMPLETION_GRACE_MS = 6 * 60 * 60 * 1000;
const RECENT_FORM_WINDOW = 5;
type CompletedTeamGame = { availableAt: Date; pointsFor: number; pointsAgainst: number };

function completionAvailableAt(game: HistoricalGameInput): Date {
  return validDate(game.completionAvailableAt ?? null)
    ? game.completionAvailableAt!
    : new Date(game.kickoffAt.getTime() + COMPLETION_GRACE_MS);
}
function rollingFeatures(history: readonly CompletedTeamGame[], cutoff: Date): HistoricalRollingTeamFeatures {
  const available = history.filter((item) => item.availableAt < cutoff);
  if (!available.length) return { priorGameCount: 0, averagePointsFor: null, averagePointsAgainst: null, averageMargin: null, recentForm: [], enoughHistory: false };
  const pointsFor = available.reduce((sum, item) => sum + item.pointsFor, 0);
  const pointsAgainst = available.reduce((sum, item) => sum + item.pointsAgainst, 0);
  return {
    priorGameCount: available.length,
    averagePointsFor: pointsFor / available.length,
    averagePointsAgainst: pointsAgainst / available.length,
    averageMargin: (pointsFor - pointsAgainst) / available.length,
    recentForm: available.slice(-RECENT_FORM_WINDOW).map((item) => item.pointsFor - item.pointsAgainst),
    enoughHistory: available.length >= 1,
  };
}

/** Only A/B evidence with a provider effective time strictly before kickoff can
 * enter the artifact. C/D material is retained as exclusion lineage, never
 * promoted merely because it was later captured. */
function eligibleLineage(game: HistoricalGameInput, cutoff: Date, report: HistoricalDatasetQualityReport) {
  const excluded: Record<string, number> = {};
  const included = (game.evidence ?? []).filter((item) => {
    const reason = item.pitClass !== "A" && item.pitClass !== "B" ? `pit_${item.pitClass}`
      : !validDate(item.effectiveAt) ? "missing_effective_at"
        : !validDate(item.capturedAt) ? "missing_captured_at"
          : item.effectiveAt >= cutoff || item.capturedAt >= cutoff ? "not_pregame" : null;
    if (reason) { bump(excluded, reason); bump(report.pitClassesExcluded, item.pitClass); return false; }
    bump(report.pitClassesIncluded, item.pitClass);
    return true;
  }).sort((a, b) => a.source.localeCompare(b.source) || a.sourceId.localeCompare(b.sourceId));
  return { included, excluded };
}

function qbForTeam(items: readonly HistoricalQbEvidence[], teamId: string, cutoff: Date): HistoricalQbEvidence | null {
  // CFBD stable player/team IDs plus explicit QB position and dated statistics
  // are required. This reports historical participation evidence, never a
  // starter prediction.
  const candidates = items.filter((item) => item.canonicalTeamId === teamId && item.cfbdTeamId.trim()
    && item.cfbdPlayerId.trim() && item.position?.trim().toUpperCase() === "QB"
    && validDate(item.effectiveAt) && validDate(item.capturedAt)
    && item.effectiveAt < cutoff && item.capturedAt < cutoff)
    .sort((a, b) => b.effectiveAt!.getTime() - a.effectiveAt!.getTime() || a.cfbdPlayerId.localeCompare(b.cfbdPlayerId));
  return candidates[0] ?? null;
}

export function buildNcaafHistoricalTrainingDataset(games: readonly HistoricalGameInput[]) {
  const report: HistoricalDatasetQualityReport = {
    schemaVersion: NCAAF_HISTORICAL_TRAINING_SCHEMA_VERSION, requestedSeasons: [...NCAAF_HISTORICAL_SEASONS],
    inputGames: games.length, includedRows: 0, excluded: {}, pitClassesIncluded: { A: 0, B: 0, C: 0, D: 0 },
    pitClassesExcluded: { A: 0, B: 0, C: 0, D: 0 }, qbEvidenceRows: 0, checksum: "",
  };
  const seen = new Set<string>(); const rows: HistoricalTrainingRow[] = [];
  const history = new Map<string, CompletedTeamGame[]>();
  for (const game of [...games].sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime() || a.canonicalEventId.localeCompare(b.canonicalEventId))) {
    const reject = (reason: string) => bump(report.excluded, reason);
    if (!NCAAF_HISTORICAL_SEASONS.includes(game.season as typeof NCAAF_HISTORICAL_SEASONS[number])) { reject("season_out_of_bounds"); continue; }
    if (!game.canonicalProvider.trim() || !game.canonicalEventId.trim() || !game.homeCanonicalTeamId?.trim() || !game.awayCanonicalTeamId?.trim()) { reject("noncanonical_identity"); continue; }
    if (!validDate(game.kickoffAt) || !game.completed || game.homeScore == null || game.awayScore == null) { reject("incomplete_result"); continue; }
    if (!isFbs(game.homeClassification) || !isFbs(game.awayClassification)) { reject("non_fbs_matchup"); continue; }
    const identity = `${game.canonicalProvider}:${game.canonicalEventId}`;
    if (seen.has(identity)) { reject("duplicate_canonical_game"); continue; }
    seen.add(identity);
    const cutoff = pregameCutoff(game.kickoffAt);
    const lineage = eligibleLineage(game, cutoff, report);
    const homeHistory = rollingFeatures(history.get(game.homeCanonicalTeamId) ?? [], cutoff);
    const awayHistory = rollingFeatures(history.get(game.awayCanonicalTeamId) ?? [], cutoff);
    const recordCompletedOutcome = () => {
      if (!game.homeCanonicalTeamId || !game.awayCanonicalTeamId || game.homeScore == null || game.awayScore == null) return;
      const availableAt = completionAvailableAt(game);
      for (const [teamId, pointsFor, pointsAgainst] of [[game.homeCanonicalTeamId, game.homeScore, game.awayScore], [game.awayCanonicalTeamId, game.awayScore, game.homeScore]] as const) {
        const teamHistory = history.get(teamId) ?? [];
        teamHistory.push({ availableAt, pointsFor, pointsAgainst });
        history.set(teamId, teamHistory);
      }
    };
    // Rolling completed outcomes are independently valid PIT features. Keep the
    // first game without either historical lineage or prior outcomes out.
    if (lineage.included.length === 0 && !homeHistory.enoughHistory && !awayHistory.enoughHistory) {
      reject("no_eligible_pregame_lineage");
      recordCompletedOutcome();
      continue;
    }
    const homeQb = qbForTeam(game.qbEvidence ?? [], game.homeCanonicalTeamId, cutoff);
    const awayQb = qbForTeam(game.qbEvidence ?? [], game.awayCanonicalTeamId, cutoff);
    if (homeQb) report.qbEvidenceRows++; if (awayQb) report.qbEvidenceRows++;
    const base = {
      schemaVersion: NCAAF_HISTORICAL_TRAINING_SCHEMA_VERSION, canonicalProvider: game.canonicalProvider, canonicalEventId: game.canonicalEventId,
      season: game.season, week: game.week ?? null, kickoffAt: game.kickoffAt.toISOString(), pregameCutoffAt: cutoff.toISOString(),
      homeCanonicalTeamId: game.homeCanonicalTeamId, awayCanonicalTeamId: game.awayCanonicalTeamId,
      targets: { homeWin: (game.homeScore > game.awayScore ? 1 : 0) as 0 | 1, homeMargin: game.homeScore - game.awayScore, totalPoints: game.homeScore + game.awayScore },
      features: { neutralSite: game.neutralSite ?? null, rolling: { home: homeHistory, away: awayHistory }, qb: { home: homeQb, away: awayQb } },
      pitLineage: lineage.included,
      quality: { fbsEligible: true as const, eligibleEvidence: lineage.included.length, excludedEvidence: lineage.excluded,
        qbEvidence: { home: homeQb ? "CFBD_ID_DATED_QB_STATS" : "unavailable_no_eligible_cfbd_qb_id_stats", away: awayQb ? "CFBD_ID_DATED_QB_STATS" : "unavailable_no_eligible_cfbd_qb_id_stats" } },
    };
    rows.push({ ...base, checksum: digest(base) });
    recordCompletedOutcome();
  }
  report.includedRows = rows.length;
  report.checksum = digest(rows.map(({ checksum }) => checksum));
  return { rows, report };
}