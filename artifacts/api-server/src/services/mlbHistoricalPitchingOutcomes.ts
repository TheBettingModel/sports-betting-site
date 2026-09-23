import { historicalPayloadHash } from "./mlbHistoricalSource";

export const MLB_HISTORICAL_PITCHING_OUTCOME_VERSION = "mlb-statsapi-boxscore-pitching-v1";

export interface MlbPitcherAppearanceOutcome {
  gameId: string;
  canonicalPitcherId: string;
  providerPitcherId: string;
  pitcherName: string;
  teamId: string;
  opponentId: string;
  season: number;
  appearanceOrder: number;
  starterFlagActual: boolean;
  inningsPitched: number | null;
  battersFaced: number | null;
  runsAllowed: number | null;
  earnedRuns: number | null;
  hitsAllowed: number | null;
  walks: number | null;
  hitBatters: number | null;
  strikeouts: number | null;
  homeRunsAllowed: number | null;
  pitchCount: number | null;
  strikes: number | null;
  throws: "L" | "R" | null;
  appearanceCompletionTime: string;
  source: typeof MLB_HISTORICAL_PITCHING_OUTCOME_VERSION;
  sourceHash: string;
}

export interface MlbTeamBullpenOutcome {
  gameId: string;
  teamId: string;
  opponentId: string;
  season: number;
  bullpenInnings: number | null;
  bullpenBattersFaced: number | null;
  bullpenRuns: number | null;
  bullpenEarnedRuns: number | null;
  bullpenHits: number | null;
  bullpenWalks: number | null;
  bullpenHitBatters: number | null;
  bullpenStrikeouts: number | null;
  bullpenHomeRuns: number | null;
  bullpenPitchCount: number | null;
  bullpenStrikes: number | null;
  relieversUsed: number;
  appearanceCompletionTime: string;
  sourceHash: string;
}

export interface ParsedMlbPitchingOutcomes {
  appearances: MlbPitcherAppearanceOutcome[];
  bullpens: MlbTeamBullpenOutcome[];
  sourceHash: string;
}

type Row = Record<string, unknown>;
const row = (value: unknown): Row =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const finite = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value
    : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const integer = (value: unknown): number | null => {
  const parsed = finite(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};

/** Converts baseball innings notation (for example 6.2) to true decimal innings. */
export function mlbInningsToDecimal(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  const match = /^(\d+)(?:\.([012]))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) + Number(match[2] ?? 0) / 3;
}

function sumNullable(
  appearances: readonly MlbPitcherAppearanceOutcome[],
  field: keyof MlbPitcherAppearanceOutcome,
): number | null {
  if (appearances.some((appearance) => appearance[field] === null)) return null;
  return appearances.reduce((sum, appearance) => sum + Number(appearance[field]), 0);
}

/**
 * Pure parser for the MLB StatsAPI /api/v1/game/{gamePk}/boxscore shape.
 * The official team.pitchers array is the appearance order. Its first entry is
 * the actual first pitcher, but is not evidence that he was known pregame.
 */
export function parseMlbStatsApiPitchingOutcomes(
  payload: unknown,
  input: {
    gameId: string;
    season: number;
    completionTime: string;
    homeTeamId: string;
    awayTeamId: string;
  },
): ParsedMlbPitchingOutcomes {
  if (!Number.isFinite(new Date(input.completionTime).getTime())) {
    throw new Error("Pitching outcomes require a valid sealed completion time");
  }
  const sourceHash = historicalPayloadHash(payload);
  const teams = row(row(payload).teams);
  const appearances: MlbPitcherAppearanceOutcome[] = [];
  const bullpens: MlbTeamBullpenOutcome[] = [];

  for (const side of ["away", "home"] as const) {
    const team = row(teams[side]);
    const players = row(team.players);
    const pitcherIds = Array.isArray(team.pitchers) ? team.pitchers : [];
    const teamId = side === "home" ? input.homeTeamId : input.awayTeamId;
    const opponentId = side === "home" ? input.awayTeamId : input.homeTeamId;
    const sideAppearances: MlbPitcherAppearanceOutcome[] = [];
    for (const rawId of pitcherIds) {
      const id = integer(rawId);
      if (id === null) continue;
      const player = row(players[`ID${id}`]);
      const person = row(player.person);
      const pitching = row(row(player.stats).pitching);
      // StatsAPI can leave a listed, unused pitcher without a game pitching line.
      if (Object.keys(pitching).length === 0) continue;
      const hand = row(person.pitchHand).code ?? row(player.pitchHand).code;
      const appearance: MlbPitcherAppearanceOutcome = {
        gameId: input.gameId,
        canonicalPitcherId: `mlb:${id}`,
        providerPitcherId: String(id),
        pitcherName: typeof person.fullName === "string" ? person.fullName : `MLB ${id}`,
        teamId,
        opponentId,
        season: input.season,
        appearanceOrder: sideAppearances.length + 1,
        starterFlagActual: sideAppearances.length === 0,
        inningsPitched: mlbInningsToDecimal(pitching.inningsPitched),
        battersFaced: integer(pitching.battersFaced),
        runsAllowed: integer(pitching.runs),
        earnedRuns: integer(pitching.earnedRuns),
        hitsAllowed: integer(pitching.hits),
        walks: integer(pitching.baseOnBalls),
        hitBatters: integer(pitching.hitBatsmen),
        strikeouts: integer(pitching.strikeOuts),
        homeRunsAllowed: integer(pitching.homeRuns),
        pitchCount: integer(pitching.numberOfPitches),
        strikes: integer(pitching.strikes),
        throws: hand === "L" || hand === "R" ? hand : null,
        appearanceCompletionTime: input.completionTime,
        source: MLB_HISTORICAL_PITCHING_OUTCOME_VERSION,
        sourceHash,
      };
      appearances.push(appearance);
      sideAppearances.push(appearance);
    }
    const relief = sideAppearances.filter((appearance) => !appearance.starterFlagActual);
    bullpens.push({
      gameId: input.gameId,
      teamId,
      opponentId,
      season: input.season,
      bullpenInnings: sumNullable(relief, "inningsPitched"),
      bullpenBattersFaced: sumNullable(relief, "battersFaced"),
      bullpenRuns: sumNullable(relief, "runsAllowed"),
      bullpenEarnedRuns: sumNullable(relief, "earnedRuns"),
      bullpenHits: sumNullable(relief, "hitsAllowed"),
      bullpenWalks: sumNullable(relief, "walks"),
      bullpenHitBatters: sumNullable(relief, "hitBatters"),
      bullpenStrikeouts: sumNullable(relief, "strikeouts"),
      bullpenHomeRuns: sumNullable(relief, "homeRunsAllowed"),
      bullpenPitchCount: sumNullable(relief, "pitchCount"),
      bullpenStrikes: sumNullable(relief, "strikes"),
      relieversUsed: relief.length,
      appearanceCompletionTime: input.completionTime,
      sourceHash,
    });
  }
  return { appearances, bullpens, sourceHash };
}