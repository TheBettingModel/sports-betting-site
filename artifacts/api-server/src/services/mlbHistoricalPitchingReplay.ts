import { createHash } from "node:crypto";
import { stableHistoricalJson, type HistoricalStarterState } from "./mlbHistoricalSource";
import type {
  MlbPitcherAppearanceOutcome,
  MlbTeamBullpenOutcome,
  ParsedMlbPitchingOutcomes,
} from "./mlbHistoricalPitchingOutcomes";

export const MLB_PITCHING_PIT_REPLAY_VERSION = "mlb-pitcher-bullpen-pit-replay-v3";
/** Fixed descriptive FIP constant. It is deliberately not fit or tuned to outcomes. */
export const MLB_PIT_FIP_CONSTANT = 3.10;
export const MLB_PIT_FIP_FORMULA = "(13*HR + 3*(BB+HBP) - 2*K)/IP + 3.10";
/** Fixed workload-description thresholds; these are not model parameters or trained cutoffs. */
export const MLB_BULLPEN_FATIGUE_PITCH_THRESHOLDS = Object.freeze({
  WORKED_MIN: 40,
  TIRED_MIN: 80,
  VERY_TIRED_MIN: 120,
});

export interface MlbPitchingReplayGame {
  gameId: string;
  season: number;
  baseballDate: string;
  homeTeamId: string;
  awayTeamId: string;
  featureCutoff: string | null;
  canonicalCompletionTime: string | null;
  finalStatus: boolean;
  quarantineReason: string | null;
}

export interface PregameStarterEvidence {
  gameId: string;
  teamId: string;
  pitcherId: string;
  state: "CONFIRMED_PREGAME" | "PROJECTED_PREGAME";
  observedAt: string;
}

export interface MlbPitchingRateState {
  appearances: number;
  starts: number;
  innings: number | null;
  hitBatters: number | null;
  era: number | null;
  whip: number | null;
  kPct: number | null;
  bbPct: number | null;
  kMinusBbPct: number | null;
  hrRate: number | null;
  fip: number | null;
}

export interface MlbPitchingPitSnapshot {
  schemaVersion: typeof MLB_PITCHING_PIT_REPLAY_VERSION;
  gameId: string;
  teamId: string;
  opponentId: string;
  season: number;
  featureCutoff: string | null;
  starterIdentityState: HistoricalStarterState;
  pregameStarterId: string | null;
  pitcher: {
    career: MlbPitchingRateState;
    season: MlbPitchingRateState;
    recent3: MlbPitchingRateState;
    recent5: MlbPitchingRateState;
    recent10: MlbPitchingRateState;
    daysSinceLastAppearance: number | null;
    daysSinceLastStart: number | null;
    lastAppearancePitchCount: number | null;
    lastStartPitchCount: number | null;
    lastStartInnings: number | null;
    priorType: "CURRENT_SEASON_SAMPLE" | "PRIOR_SEASON_HISTORY" | "LEAGUE_PRIOR_REQUIRED" | "UNAVAILABLE";
    statThroughTime: string | null;
  };
  bullpen: {
    season: MlbPitchingRateState;
    last3: MlbPitchingRateState;
    last5: MlbPitchingRateState;
    last10: MlbPitchingRateState;
    pitchesLast1d: number | null;
    pitchesLast2d: number | null;
    pitchesLast3d: number | null;
    inningsLast1d: number | null;
    inningsLast2d: number | null;
    inningsLast3d: number | null;
    relieversUsedLast1d: number | null;
    relieversUsedLast2d: number | null;
    backToBackRelievers: number | null;
    threeDayRelievers: number | null;
    fatigueState: "AVAILABLE" | "NORMAL" | "WORKED" | "TIRED" | "VERY_TIRED" | "UNKNOWN";
    statThroughTime: string | null;
  };
  sourceGameIds: string[];
  missingness: {
    starterUnknown: boolean;
    starterActualOnly: boolean;
    starterSmallSample: boolean;
    pitchCountMissing: boolean;
    bullpenIdentityIncomplete: true;
    bullpenWorkloadIncomplete: boolean;
    pitcherFipUnavailable: boolean;
    bullpenFipUnavailable: boolean;
    advancedMetricsUnavailable: true;
    marketDataExcluded: true;
  };
  checksum: string;
}

const hash = (value: unknown) =>
  createHash("sha256").update(stableHistoricalJson(value)).digest("hex");
const MARKET_KEYS = new Set([
  "moneyline", "runline", "total", "odds", "impliedprobability", "market",
  "marketconsensus", "sportsbook", "pinnacle", "openingprice", "closingprice",
  "linemovement", "clv", "marketedge",
]);

function assertMarketFirewall(value: unknown, path = "input"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertMarketFirewall(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (MARKET_KEYS.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase())) {
      throw new Error(`Market field prohibited from MLB PIT replay: ${path}.${key}`);
    }
    assertMarketFirewall(child, `${path}.${key}`);
  }
}

function rate(rows: readonly MlbPitcherAppearanceOutcome[]): MlbPitchingRateState {
  if (rows.length === 0) {
    return {
      appearances: 0,
      starts: 0,
      innings: null,
      hitBatters: null,
      era: null,
      whip: null,
      kPct: null,
      bbPct: null,
      kMinusBbPct: null,
      hrRate: null,
      fip: null,
    };
  }
  const sum = (field: keyof MlbPitcherAppearanceOutcome): number | null =>
    rows.some((entry) => entry[field] === null)
      ? null
      : rows.reduce((total, entry) => total + Number(entry[field]), 0);
  const ip = sum("inningsPitched");
  const er = sum("earnedRuns");
  const hits = sum("hitsAllowed");
  const walks = sum("walks");
  const hitBatters = sum("hitBatters");
  const strikeouts = sum("strikeouts");
  const homeRuns = sum("homeRunsAllowed");
  const bf = sum("battersFaced");
  return {
    appearances: rows.length,
    starts: rows.filter((entry) => entry.starterFlagActual).length,
    innings: ip,
    hitBatters,
    era: ip && er !== null ? 9 * er / ip : null,
    whip: ip && hits !== null && walks !== null ? (hits + walks) / ip : null,
    kPct: bf && strikeouts !== null ? strikeouts / bf : null,
    bbPct: bf && walks !== null ? walks / bf : null,
    kMinusBbPct: bf && strikeouts !== null && walks !== null ? (strikeouts - walks) / bf : null,
    hrRate: bf && homeRuns !== null ? homeRuns / bf : null,
    fip: ip && homeRuns !== null && walks !== null && hitBatters !== null && strikeouts !== null
      ? (13 * homeRuns + 3 * (walks + hitBatters) - 2 * strikeouts) / ip + MLB_PIT_FIP_CONSTANT
      : null,
  };
}

function bullpenRate(rows: readonly MlbTeamBullpenOutcome[]): MlbPitchingRateState {
  return rate(rows.map((entry) => ({
    gameId: entry.gameId, canonicalPitcherId: "", providerPitcherId: "", pitcherName: "",
    teamId: entry.teamId, opponentId: entry.opponentId, season: entry.season,
    appearanceOrder: 0, starterFlagActual: false, throws: null,
    inningsPitched: entry.bullpenInnings, battersFaced: entry.bullpenBattersFaced,
    runsAllowed: entry.bullpenRuns, earnedRuns: entry.bullpenEarnedRuns,
    hitsAllowed: entry.bullpenHits, walks: entry.bullpenWalks, hitBatters: entry.bullpenHitBatters,
    strikeouts: entry.bullpenStrikeouts, homeRunsAllowed: entry.bullpenHomeRuns,
    pitchCount: entry.bullpenPitchCount, strikes: entry.bullpenStrikes,
    appearanceCompletionTime: entry.appearanceCompletionTime,
    source: "mlb-statsapi-boxscore-pitching-v1", sourceHash: entry.sourceHash,
  })));
}

const elapsedDays = (cutoff: string, completion: string) =>
  (new Date(cutoff).getTime() - new Date(completion).getTime()) / 86_400_000;

function previousBaseballDates(baseballDate: string, days: number): Set<string> {
  const start = new Date(`${baseballDate}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) throw new Error(`Invalid baseball date: ${baseballDate}`);
  return new Set(Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() - index - 1);
    return date.toISOString().slice(0, 10);
  }));
}

export function replayMlbPitchingPit(
  gamesInput: readonly MlbPitchingReplayGame[],
  parsedInput: readonly ParsedMlbPitchingOutcomes[],
  pregameEvidence: readonly PregameStarterEvidence[] = [],
): { snapshots: MlbPitchingPitSnapshot[]; checksum: string } {
  assertMarketFirewall(gamesInput);
  assertMarketFirewall(parsedInput);
  assertMarketFirewall(pregameEvidence);
  const games = [...gamesInput].sort((a, b) =>
    (a.featureCutoff ?? "").localeCompare(b.featureCutoff ?? "") || a.gameId.localeCompare(b.gameId));
  const appearances = parsedInput.flatMap((entry) => entry.appearances);
  const bullpens = parsedInput.flatMap((entry) => entry.bullpens);
  const gameById = new Map(games.map((game) => [game.gameId, game]));
  const compareAppearances = (a: MlbPitcherAppearanceOutcome, b: MlbPitcherAppearanceOutcome) =>
    a.appearanceCompletionTime.localeCompare(b.appearanceCompletionTime)
    || a.gameId.localeCompare(b.gameId) || a.appearanceOrder - b.appearanceOrder;
  const compareBullpens = (a: MlbTeamBullpenOutcome, b: MlbTeamBullpenOutcome) =>
    a.appearanceCompletionTime.localeCompare(b.appearanceCompletionTime) || a.gameId.localeCompare(b.gameId);
  const byPitcher = new Map<string, MlbPitcherAppearanceOutcome[]>();
  const bullpenByTeam = new Map<string, MlbTeamBullpenOutcome[]>();
  const reliefByTeam = new Map<string, MlbPitcherAppearanceOutcome[]>();
  const actualStarterByGameTeam = new Map<string, MlbPitcherAppearanceOutcome>();
  for (const appearance of appearances) {
    const pitcherRows = byPitcher.get(appearance.canonicalPitcherId) ?? [];
    pitcherRows.push(appearance);
    byPitcher.set(appearance.canonicalPitcherId, pitcherRows);
    if (!appearance.starterFlagActual) {
      const reliefRows = reliefByTeam.get(appearance.teamId) ?? [];
      reliefRows.push(appearance);
      reliefByTeam.set(appearance.teamId, reliefRows);
    } else {
      actualStarterByGameTeam.set(`${appearance.gameId}\u0000${appearance.teamId}`, appearance);
    }
  }
  for (const bullpen of bullpens) {
    const teamRows = bullpenByTeam.get(bullpen.teamId) ?? [];
    teamRows.push(bullpen);
    bullpenByTeam.set(bullpen.teamId, teamRows);
  }
  for (const rows of byPitcher.values()) rows.sort(compareAppearances);
  for (const rows of reliefByTeam.values()) rows.sort(compareAppearances);
  for (const rows of bullpenByTeam.values()) rows.sort(compareBullpens);
  const eligible = (gameId: string, cutoff: string) => {
    const game = gameById.get(gameId);
    return Boolean(game?.finalStatus && !game.quarantineReason && game.canonicalCompletionTime
      && new Date(game.canonicalCompletionTime).getTime() < new Date(cutoff).getTime());
  };
  const snapshots: MlbPitchingPitSnapshot[] = [];

  for (const game of games) for (const teamId of [game.awayTeamId, game.homeTeamId]) {
    const opponentId = teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
    const cutoff = game.featureCutoff;
    const actual = actualStarterByGameTeam.get(`${game.gameId}\u0000${teamId}`);
    const evidence = pregameEvidence.find((entry) =>
      entry.gameId === game.gameId && entry.teamId === teamId && cutoff !== null
      && new Date(entry.observedAt).getTime() <= new Date(cutoff).getTime());
    const starterIdentityState: HistoricalStarterState = evidence?.state
      ?? (actual ? "ACTUAL_ONLY" : "UNKNOWN");
    const pitcherId = evidence?.pitcherId ?? null;
    const priorAppearances = cutoff && pitcherId ? (byPitcher.get(pitcherId) ?? [])
      .filter((entry) => eligible(entry.gameId, cutoff)) : [];
    const seasonPitcher = priorAppearances.filter((entry) => entry.season === game.season);
    const priorBullpens = cutoff ? (bullpenByTeam.get(teamId) ?? [])
      .filter((entry) => eligible(entry.gameId, cutoff)) : [];
    const seasonBullpen = priorBullpens.filter((entry) => entry.season === game.season);
    const window = (days: number) => priorBullpens.filter((entry) =>
      cutoff !== null && elapsedDays(cutoff, entry.appearanceCompletionTime) <= days);
    const sumKnown = (rows: readonly MlbTeamBullpenOutcome[], field: keyof MlbTeamBullpenOutcome) =>
      rows.some((entry) => entry[field] === null) ? null
        : rows.reduce((sum, entry) => sum + Number(entry[field]), 0);
    const p1 = window(1), p2 = window(2), p3 = window(3);
    const consecutiveRelievers = (days: number) => {
      const requiredDates = previousBaseballDates(game.baseballDate, days);
      const datesByPitcher = new Map<string, Set<string>>();
      for (const entry of reliefByTeam.get(teamId) ?? []) {
        const sourceBaseballDate = gameById.get(entry.gameId)?.baseballDate;
        if (cutoff === null || !eligible(entry.gameId, cutoff)
          || !sourceBaseballDate || !requiredDates.has(sourceBaseballDate)) continue;
        const dates = datesByPitcher.get(entry.canonicalPitcherId) ?? new Set<string>();
        dates.add(sourceBaseballDate);
        datesByPitcher.set(entry.canonicalPitcherId, dates);
      }
      return [...datesByPitcher.values()].filter((dates) =>
        [...requiredDates].every((date) => dates.has(date))).length;
    };
    const pitches3 = sumKnown(p3, "bullpenPitchCount");
    const fatigueState: MlbPitchingPitSnapshot["bullpen"]["fatigueState"] = pitches3 === null ? "UNKNOWN"
      : pitches3 >= MLB_BULLPEN_FATIGUE_PITCH_THRESHOLDS.VERY_TIRED_MIN ? "VERY_TIRED"
        : pitches3 >= MLB_BULLPEN_FATIGUE_PITCH_THRESHOLDS.TIRED_MIN ? "TIRED"
          : pitches3 >= MLB_BULLPEN_FATIGUE_PITCH_THRESHOLDS.WORKED_MIN ? "WORKED"
            : p3.length ? "NORMAL" : "AVAILABLE";
    const last = priorAppearances.at(-1);
    const starts = priorAppearances.filter((entry) => entry.starterFlagActual);
    const lastStart = starts.at(-1);
    const pitcherCareer = rate(priorAppearances);
    const pitcherSeason = rate(seasonPitcher);
    const bullpenSeason = bullpenRate(seasonBullpen);
    const base = {
      schemaVersion: MLB_PITCHING_PIT_REPLAY_VERSION as typeof MLB_PITCHING_PIT_REPLAY_VERSION,
      gameId: game.gameId, teamId, opponentId, season: game.season, featureCutoff: cutoff,
      starterIdentityState, pregameStarterId: pitcherId,
      pitcher: {
        career: pitcherCareer, season: pitcherSeason,
        recent3: rate(priorAppearances.slice(-3)), recent5: rate(priorAppearances.slice(-5)),
        recent10: rate(priorAppearances.slice(-10)),
        daysSinceLastAppearance: cutoff && last ? elapsedDays(cutoff, last.appearanceCompletionTime) : null,
        daysSinceLastStart: cutoff && lastStart ? elapsedDays(cutoff, lastStart.appearanceCompletionTime) : null,
        lastAppearancePitchCount: last?.pitchCount ?? null,
        lastStartPitchCount: lastStart?.pitchCount ?? null,
        lastStartInnings: lastStart?.inningsPitched ?? null,
        priorType: (seasonPitcher.length ? "CURRENT_SEASON_SAMPLE"
          : priorAppearances.length ? "PRIOR_SEASON_HISTORY"
            : pitcherId ? "LEAGUE_PRIOR_REQUIRED" : "UNAVAILABLE") as MlbPitchingPitSnapshot["pitcher"]["priorType"],
        statThroughTime: last?.appearanceCompletionTime ?? null,
      },
      bullpen: {
        season: bullpenSeason, last3: bullpenRate(priorBullpens.slice(-3)),
        last5: bullpenRate(priorBullpens.slice(-5)), last10: bullpenRate(priorBullpens.slice(-10)),
        pitchesLast1d: sumKnown(p1, "bullpenPitchCount"), pitchesLast2d: sumKnown(p2, "bullpenPitchCount"),
        pitchesLast3d: pitches3, inningsLast1d: sumKnown(p1, "bullpenInnings"),
        inningsLast2d: sumKnown(p2, "bullpenInnings"), inningsLast3d: sumKnown(p3, "bullpenInnings"),
        relieversUsedLast1d: sumKnown(p1, "relieversUsed"), relieversUsedLast2d: sumKnown(p2, "relieversUsed"),
        backToBackRelievers: consecutiveRelievers(2), threeDayRelievers: consecutiveRelievers(3),
        fatigueState,
        statThroughTime: priorBullpens.at(-1)?.appearanceCompletionTime ?? null,
      },
      sourceGameIds: [...new Set([...priorAppearances, ...priorBullpens].map((entry) => entry.gameId))].sort(),
      missingness: {
        starterUnknown: starterIdentityState === "UNKNOWN",
        starterActualOnly: starterIdentityState === "ACTUAL_ONLY",
        starterSmallSample: seasonPitcher.length < 3,
        pitchCountMissing: priorAppearances.some((entry) => entry.pitchCount === null)
          || priorBullpens.some((entry) => entry.bullpenPitchCount === null),
        bullpenIdentityIncomplete: true as const,
        bullpenWorkloadIncomplete: priorBullpens.some((entry) => entry.bullpenPitchCount === null),
        pitcherFipUnavailable: pitcherSeason.fip === null,
        bullpenFipUnavailable: bullpenSeason.fip === null,
        advancedMetricsUnavailable: true as const,
        marketDataExcluded: true as const,
      },
    };
    snapshots.push({ ...base, checksum: hash(base) });
  }
  return { snapshots, checksum: hash(snapshots.map((entry) => entry.checksum)) };
}