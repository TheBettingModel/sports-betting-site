import { createHash } from "node:crypto";
import type { FetchedGame } from "./espn";

export type NcaafCompetitionClassification = "FBS" | "FCS" | "OTHER" | "UNKNOWN";
export type NcaafTeamLocation = "home" | "away" | "neutral" | "unknown";
export type EvidenceAvailability = "supported" | "unsupported";

/**
 * Availability is deliberately a contract, rather than an inferred statistic:
 * the ESPN scoreboard supplies scores and limited game context, not play,
 * drive, personnel, or coaching evidence.
 */
export const NCAAF_SCOREBOARD_AVAILABILITY = Object.freeze({
  points: { availability: "supported" as const, source: "ESPN scoreboard", detail: "Final and partial team scores when supplied." },
  context: { availability: "supported" as const, source: "ESPN scoreboard", detail: "Kickoff, week, home/away, neutral-site, venue, and conference IDs when supplied." },
  epaPerPlay: { availability: "unsupported" as const, reason: "The ESPN scoreboard response has no play-level EPA." },
  successRate: { availability: "unsupported" as const, reason: "The ESPN scoreboard response has no down-and-distance play outcomes." },
  explosiveness: { availability: "unsupported" as const, reason: "The ESPN scoreboard response has no play-level gain distribution." },
  havoc: { availability: "unsupported" as const, reason: "The ESPN scoreboard response has no tackles-for-loss, forced-fumble, or disruption feed." },
  driveEvidence: { availability: "unsupported" as const, reason: "The ESPN scoreboard response has no drive summaries." },
  quarterback: { availability: "unsupported" as const, reason: "The ESPN scoreboard response has no verified quarterback participation or availability." },
  roster: { availability: "unsupported" as const, reason: "The ESPN scoreboard response has no roster snapshot." },
  injuries: { availability: "unsupported" as const, reason: "The ESPN scoreboard response has no injury report." },
  coaching: { availability: "unsupported" as const, reason: "The ESPN scoreboard response has no coaching or coordinator evidence." },
  specialTeams: { availability: "unsupported" as const, reason: "The ESPN scoreboard response has no special-teams play evidence." },
} satisfies Record<string, { availability: EvidenceAvailability; source?: string; detail?: string; reason?: string }>);

export interface NcaafTeamGamePerformanceEvidence {
  provider: "espn";
  providerEventId: string;
  providerTeamId: string | null;
  providerOpponentTeamId: string | null;
  season: number;
  week: number | null;
  kickoffAt: Date | null;
  teamLocation: NcaafTeamLocation;
  competitionClassification: NcaafCompetitionClassification;
  pointsFor: number | null;
  pointsAgainst: number | null;
  halftimePointsFor: number | null;
  halftimePointsAgainst: number | null;
  overtimePeriods: number | null;
  /** All non-score raw fields are unsupported by this source and remain null. */
  possessions: null;
  offensivePlays: null;
  yardsFor: null;
  yardsAgainst: null;
  turnoversCommitted: null;
  turnoversForced: null;
  penalties: null;
  penaltyYards: null;
  timeOfPossessionSeconds: null;
  fieldGoalAttempts: null;
  fieldGoalsMade: null;
  derivedMetrics: null;
  quality: number | null;
  reliability: number | null;
  missingFields: string[];
  missingReasons: Record<string, string>;
  payloadHash: string;
  provenance: {
    source: "espn_scoreboard";
    capturedAt: string;
    scoreStatus: FetchedGame["status"];
    availability: typeof NCAAF_SCOREBOARD_AVAILABILITY;
  };
}

const unsupportedRawFields = [
  "possessions", "offensivePlays", "yardsFor", "yardsAgainst",
  "turnoversCommitted", "turnoversForced", "penalties", "penaltyYards",
  "timeOfPossessionSeconds", "fieldGoalAttempts", "fieldGoalsMade",
] as const;

function nullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) ? value : null;
}

function nullableKickoff(value: string): Date | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function seasonForKickoff(kickoff: Date | null, gameDate: string): number {
  const date = kickoff ?? new Date(`${gameDate}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) throw new Error("ESPN scoreboard game has no valid date for NCAAF season");
  return date.getUTCMonth() >= 7 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function scoreboardMissing(game: FetchedGame, side: "home" | "away", kickoff: Date | null): {
  fields: string[];
  reasons: Record<string, string>;
} {
  const fields = [...unsupportedRawFields, "derivedMetrics", "epaPerPlay", "successRate", "explosiveness", "havoc",
    "driveEvidence", "quarterback", "roster", "injuries", "coaching", "specialTeams"];
  const reasons = Object.fromEntries(fields.map((field) => [field, "Unsupported by the ESPN scoreboard evidence source"]));
  const add = (field: string, reason: string) => { fields.push(field); reasons[field] = reason; };
  const score = side === "home" ? game.homeScore : game.awayScore;
  const opponentScore = side === "home" ? game.awayScore : game.homeScore;
  const half = side === "home" ? game.homeHalftimeScore : game.awayHalftimeScore;
  const opponentHalf = side === "home" ? game.awayHalftimeScore : game.homeHalftimeScore;
  const id = side === "home" ? game.homeTeamId : game.awayTeamId;
  const opponentId = side === "home" ? game.awayTeamId : game.homeTeamId;
  if (nullableInteger(score) == null) add("pointsFor", "ESPN scoreboard omitted or supplied an invalid team score");
  if (nullableInteger(opponentScore) == null) add("pointsAgainst", "ESPN scoreboard omitted or supplied an invalid opponent score");
  if (nullableInteger(half) == null) add("halftimePointsFor", "ESPN scoreboard omitted halftime scoring");
  if (nullableInteger(opponentHalf) == null) add("halftimePointsAgainst", "ESPN scoreboard omitted opponent halftime scoring");
  if (!id) add("providerTeamId", "ESPN scoreboard omitted the team identifier");
  if (!opponentId) add("providerOpponentTeamId", "ESPN scoreboard omitted the opponent identifier");
  if (!kickoff) add("kickoffAt", "ESPN scoreboard omitted or supplied an invalid kickoff");
  return { fields, reasons };
}

/**
 * Normalizes only scoreboard-visible NCAAF evidence. Division classification is
 * UNKNOWN because this endpoint's FetchedGame contract does not establish FBS or
 * FCS membership; callers may enrich it only with separately evidenced data.
 */
export function normalizeEspnScoreboardPerformance(
  game: FetchedGame,
  capturedAt = new Date(),
): NcaafTeamGamePerformanceEvidence[] {
  const kickoffAt = nullableKickoff(game.commenceTimeISO);
  const season = seasonForKickoff(kickoffAt, game.gameDate);
  const payloadHash = hashPayload(game);
  const build = (side: "home" | "away"): NcaafTeamGamePerformanceEvidence => {
    const isHome = side === "home";
    const missing = scoreboardMissing(game, side, kickoffAt);
    const teamLocation: NcaafTeamLocation = game.neutralSite === true ? "neutral" : side;
    return {
      provider: "espn",
      providerEventId: game.espnId,
      providerTeamId: isHome ? game.homeTeamId ?? null : game.awayTeamId ?? null,
      providerOpponentTeamId: isHome ? game.awayTeamId ?? null : game.homeTeamId ?? null,
      season, week: nullableInteger(game.week), kickoffAt, teamLocation,
      competitionClassification: "UNKNOWN",
      pointsFor: nullableInteger(isHome ? game.homeScore : game.awayScore),
      pointsAgainst: nullableInteger(isHome ? game.awayScore : game.homeScore),
      halftimePointsFor: nullableInteger(isHome ? game.homeHalftimeScore : game.awayHalftimeScore),
      halftimePointsAgainst: nullableInteger(isHome ? game.awayHalftimeScore : game.homeHalftimeScore),
      overtimePeriods: null,
      possessions: null, offensivePlays: null, yardsFor: null, yardsAgainst: null,
      turnoversCommitted: null, turnoversForced: null, penalties: null, penaltyYards: null,
      timeOfPossessionSeconds: null, fieldGoalAttempts: null, fieldGoalsMade: null,
      derivedMetrics: null,
      quality: game.status === "final" && nullableInteger(isHome ? game.homeScore : game.awayScore) != null
        && nullableInteger(isHome ? game.awayScore : game.homeScore) != null ? 1 : null,
      reliability: game.status === "final" ? 1 : null,
      missingFields: missing.fields,
      missingReasons: missing.reasons,
      payloadHash,
      provenance: { source: "espn_scoreboard", capturedAt: capturedAt.toISOString(), scoreStatus: game.status, availability: NCAAF_SCOREBOARD_AVAILABILITY },
    };
  };
  return [build("home"), build("away")];
}

export interface ChronologicalPerformanceRow {
  provider: string;
  providerEventId: string;
  providerTeamId: string;
  providerOpponentTeamId: string;
  season: number;
  kickoffAt: Date | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  competitionClassification: NcaafCompetitionClassification;
}

export interface NcaafFootballIntelligence {
  availability: typeof NCAAF_SCOREBOARD_AVAILABILITY;
  chronologicalOpponentStrength: Array<{
    providerEventId: string;
    kickoffAt: string;
    opponentTeamId: string;
    opponentPriorGames: number;
    opponentPriorAverageMargin: number | null;
    missingReason: string | null;
  }>;
  sampleMetadata: {
    currentSeason: { season: number; games: number; scoredGames: number };
    priorSeason: { season: number; games: number; scoredGames: number };
    cutoff: string;
  };
}

/** Builds descriptive, leakage-safe metadata only; it makes no forecast. */
export function buildNcaafFootballIntelligence(
  teamId: string,
  season: number,
  rows: readonly ChronologicalPerformanceRow[],
  cutoff: Date,
): NcaafFootballIntelligence {
  const usable = rows.filter((row) => row.kickoffAt != null && row.kickoffAt < cutoff);
  const teamRows = usable.filter((row) => row.providerTeamId === teamId)
    .sort((a, b) => a.kickoffAt!.getTime() - b.kickoffAt!.getTime() || a.providerEventId.localeCompare(b.providerEventId));
  const sample = (sampleSeason: number) => {
    const games = teamRows.filter((row) => row.season === sampleSeason);
    return { season: sampleSeason, games: games.length, scoredGames: games.filter((row) => row.pointsFor != null && row.pointsAgainst != null).length };
  };
  return {
    availability: NCAAF_SCOREBOARD_AVAILABILITY,
    chronologicalOpponentStrength: teamRows.filter((row) => row.season === season).map((row) => {
      const opponentHistory = usable.filter((candidate) =>
        candidate.providerTeamId === row.providerOpponentTeamId
        && candidate.kickoffAt! < row.kickoffAt!
        && candidate.pointsFor != null && candidate.pointsAgainst != null);
      const margins = opponentHistory.map((candidate) => candidate.pointsFor! - candidate.pointsAgainst!);
      return {
        providerEventId: row.providerEventId,
        kickoffAt: row.kickoffAt!.toISOString(),
        opponentTeamId: row.providerOpponentTeamId,
        opponentPriorGames: margins.length,
        opponentPriorAverageMargin: margins.length
          ? Math.round((margins.reduce((sum, margin) => sum + margin, 0) / margins.length) * 1000) / 1000
          : null,
        missingReason: margins.length ? null : "No chronologically prior scored opponent games are available",
      };
    }),
    sampleMetadata: { currentSeason: sample(season), priorSeason: sample(season - 1), cutoff: cutoff.toISOString() },
  };
}