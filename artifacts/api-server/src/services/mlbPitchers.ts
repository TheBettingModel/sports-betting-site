/**
 * MLB Starting Pitcher Service
 *
 * Fetches today's probable starters from the MLB Stats API (free, no key).
 * For each pitcher computes:
 *   - FIP (Fielding Independent Pitching) — strips out defense + BABIP luck
 *   - K%, BB%, K-BB% — strikeout/walk profile; more predictive than ERA
 *   - Season ERA and WHIP (retained for blending)
 *   - Recent ERA over last 3 starts (hot/cold form signal)
 *   - Recent innings pitched avg — workload proxy for starter-depth / bullpen-game flag
 *
 * Complete schedule data is cached for four hours. Games with an incomplete
 * probable-starter pair are retried quickly before first pitch because MLB can
 * publish or replace a starter throughout the day.
 *
 * Advantage computation blends FIP (primary), recent ERA (form), and K-BB%
 * (dominance signal) with a workload scaling factor that reduces starter
 * impact when either pitcher is expected to exit early (bullpen game).
 */

import { logger } from "../lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PitcherStats {
  name: string;
  /** MLB Stats API player ID — used for career vs lineup lookups in mlbLineups. */
  playerId: number | null;
  /** Pitcher handedness: "L" or "R". Used for platoon split selection in lineups. */
  pitchHand: "L" | "R" | null;
  /** Season ERA. League average ≈ 4.20 */
  seasonEra: number;
  /** Season WHIP. League average ≈ 1.25 */
  seasonWhip: number;
  /**
   * Fielding-Independent Pitching — removes defense and BABIP luck.
   * FIP = (13×HR + 3×BB − 2×K) / IP + constant (~3.10).
   * A better predictor of future ERA than ERA itself.
   * League average ≈ 4.10.
   */
  fip: number;
  /** Season strikeout rate (K / batters faced). League avg ≈ 0.225 */
  kPct: number;
  /** Season walk rate (BB / batters faced). League avg ≈ 0.085 */
  bbPct: number;
  /** K% − BB%. Dominant starters have high K-BB%. League avg ≈ 0.140 */
  kMinusBbPct: number;
  /** ERA over last 3 starts — recent form. Falls back to season ERA. */
  recentEra: number;
  /** Average innings per start over last 3 outings. Proxy for arm depth. */
  recentIpAvg: number;
  /** Season innings; used to shrink small-sample rate stats toward neutral. */
  seasonIp: number;
  /** Season batters faced; corroborates workload when innings are sparse. */
  seasonBattersFaced: number;
  /** Average pitches thrown over recent starts. Proxy for current expected length. */
  recentPitchCountAvg: number;
  /** Number of valid recent starts contributing to workload/form. */
  recentStartCount: number;
}

export interface ProbableStarters {
  home: PitcherStats | null;
  away: PitcherStats | null;
  /** Machine-readable source/validation issues for the scheduled matchup. */
  qualityReasons?: string[];
}
export interface MlbSignalCacheMeta {
  sourceCapturedAt: string | null;
  cacheAgeMs: number | null;
  stale: boolean;
}

// ── MLB Stats API team ID → ESPN abbreviation ─────────────────────────────────
const MLB_ID_TO_ESPN: Record<number, string> = {
  109: "ARI",  133: "ATH",  144: "ATL",  110: "BAL",  111: "BOS",
  112: "CHC",  145: "CHW",  113: "CIN",  114: "CLE",  115: "COL",
  116: "DET",  117: "HOU",  118: "KC",   108: "LAA",  119: "LAD",
  146: "MIA",  158: "MIL",  142: "MIN",  121: "NYM",  147: "NYY",
  143: "PHI",  134: "PIT",  135: "SD",   137: "SF",   136: "SEA",
  138: "STL",  139: "TB",   140: "TEX",  141: "TOR",  120: "WSH",
};

// ── Constants ─────────────────────────────────────────────────────────────────

const LEAGUE_AVG_ERA  = 4.20;
const LEAGUE_AVG_WHIP = 1.25;
const LEAGUE_AVG_FIP  = 4.10; // slightly below ERA (removes defensive luck)
const LEAGUE_AVG_K_PCT  = 0.225;
const LEAGUE_AVG_BB_PCT = 0.085;
const LEAGUE_AVG_KBB    = 0.140;
const FIP_CONSTANT      = 3.10; // calibrated to equate FIP to ERA at league average
// The Stats API accepts individual pitcher-stat requests, but production can
// time out an entire slate when every starter is requested at once.
const PITCHER_STATS_CONCURRENCY = 4;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse MLB Stats API innings-pitched string "175.2" → 175.667
 * The decimal portion represents outs (0 = 0 outs, .1 = 1 out = 1/3 IP, .2 = 2/3 IP).
 */
function parseIP(ip: string | number | undefined): number {
  const input = String(ip ?? "").trim();
  if (!/^\d+(?:\.[012])?$/.test(input)) return Number.NaN;
  const [whole, thirds] = input.split(".").map(Number);
  return whole + ((thirds ?? 0) / 3);
}

function requiredNonNegativeNumber(value: unknown, field: string, pitcherId: number): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`invalid ${field} for pitcher ${pitcherId}`);
  }
  return parsed;
}

function requiredInnings(value: unknown, field: string, pitcherId: number): number {
  const parsed = parseIP(typeof value === "string" || typeof value === "number" ? value : undefined);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid ${field} for pitcher ${pitcherId}`);
  }
  return parsed;
}

// ── MLB Stats API types ───────────────────────────────────────────────────────

interface MlbPitchingStat {
  era?: string | number;
  whip?: string | number;
  inningsPitched?: string | number;
  strikeOuts?: number;
  battersFaced?: number;
  homeRuns?: number;
  baseOnBalls?: number;
  numberOfPitches?: number;
}

interface MlbGameLogSplit {
  date?: string;
  stat: MlbPitchingStat;
  player?: { id?: number };
}

interface MlbStatGroup {
  type: { displayName: string };
  splits: MlbGameLogSplit[];
}

// ── Pitcher stat fetch ────────────────────────────────────────────────────────

async function fetchPitcherStats(
  pitcherId: number,
  name: string,
  season: number,
): Promise<PitcherStats> {
  const url =
    `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats` +
    `?stats=season,gameLog&group=pitching&season=${season}&gameType=R`;

  const resp = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: { "User-Agent": "TheBettingModel/2.0" },
  });
  if (!resp.ok) throw new Error(`MLB Stats API ${resp.status} for pitcher ${pitcherId}`);

  const data = (await resp.json()) as { stats?: MlbStatGroup[] };
  if (!Array.isArray(data.stats)) {
    throw new Error(`missing stats payload for pitcher ${pitcherId}`);
  }

  // ── Season totals ─────────────────────────────────────────────────────────
  const seasonGroup = data.stats.find((s) => s.type.displayName === "season");
  const seasonSplit = seasonGroup?.splits?.[0];
  if (!seasonSplit?.stat) {
    throw new Error(`missing season stats for pitcher ${pitcherId}`);
  }
  if (seasonSplit.player?.id !== pitcherId) {
    throw new Error(`season stats identity mismatch for pitcher ${pitcherId}`);
  }
  const seasonStat = seasonSplit.stat;
  const seasonEra  = requiredNonNegativeNumber(seasonStat.era, "season ERA", pitcherId);
  const seasonWhip = requiredNonNegativeNumber(seasonStat.whip, "season WHIP", pitcherId);

  // ── FIP and peripherals ───────────────────────────────────────────────────
  // Use season totals for FIP/K%/BB% — large sample is more reliable than recent.
  const seasonIp  = requiredInnings(seasonStat.inningsPitched, "season innings pitched", pitcherId);
  const seasonK   = requiredNonNegativeNumber(seasonStat.strikeOuts, "season strikeouts", pitcherId);
  const seasonBb  = requiredNonNegativeNumber(seasonStat.baseOnBalls, "season walks", pitcherId);
  const seasonHr  = requiredNonNegativeNumber(seasonStat.homeRuns, "season home runs", pitcherId);
  const seasonBf  = requiredNonNegativeNumber(seasonStat.battersFaced, "season batters faced", pitcherId);

  const fip =
    seasonIp > 10
      ? (13 * seasonHr + 3 * seasonBb - 2 * seasonK) / seasonIp + FIP_CONSTANT
      : LEAGUE_AVG_FIP;

  const kPct       = seasonBf > 20 ? seasonK / seasonBf : LEAGUE_AVG_K_PCT;
  const bbPct      = seasonBf > 20 ? seasonBb / seasonBf : LEAGUE_AVG_BB_PCT;
  const kMinusBbPct = kPct - bbPct;

  // ── Recent form (last 3 starts) ───────────────────────────────────────────
  const gameLogGroup = data.stats.find((s) => s.type.displayName === "gameLog");
  if (!gameLogGroup?.splits?.length) {
    throw new Error(`missing game log for pitcher ${pitcherId}`);
  }
  // MLB Stats API returns the game log chronologically (oldest first). Sort
  // explicitly before selecting form so the displayed "recent ERA" never
  // accidentally averages the pitcher's first starts of the season.
  const lastStarts = [...(gameLogGroup?.splits ?? [])]
    .sort((a, b) => Date.parse(b.date ?? "") - Date.parse(a.date ?? ""))
    .slice(0, 3);
  if (lastStarts.length === 0 || lastStarts.some((start) => !Number.isFinite(Date.parse(start.date ?? "")))) {
    throw new Error(`invalid game log date for pitcher ${pitcherId}`);
  }

  let recentEraSum = 0;
  let recentIpSum  = 0;
  let recentPitchSum = 0;
  let count        = 0;

  for (const start of lastStarts) {
    if (start.player?.id !== pitcherId) {
      throw new Error(`game log identity mismatch for pitcher ${pitcherId}`);
    }
    const era = requiredNonNegativeNumber(start.stat.era, "game log ERA", pitcherId);
    const ip  = requiredInnings(start.stat.inningsPitched, "game log innings pitched", pitcherId);
    const pitches = requiredNonNegativeNumber(start.stat.numberOfPitches, "game log pitch count", pitcherId);
    recentEraSum += era;
    recentIpSum  += ip;
    recentPitchSum += pitches;
    count++;
  }

  const recentEra   = recentEraSum / count;
  const recentIpAvg = recentIpSum  / count;

  return {
    name,
    playerId:     null, // populated by fetchSchedule which has the pitcher's API id
    pitchHand:    null, // populated by fetchSchedule from probablePitcher.pitchHand
    seasonEra,
    seasonWhip,
    fip:          Math.max(1.5, Math.min(7.0, fip)),
    kPct,
    bbPct,
    kMinusBbPct,
    recentEra,
    recentIpAvg,
    seasonIp,
    seasonBattersFaced: seasonBf,
    recentPitchCountAvg: recentPitchSum / count,
    recentStartCount: count,
  };
}

// ── Schedule fetch + cache ────────────────────────────────────────────────────

interface CacheEntry {
  data: Map<string, ProbableStarters>; // key: "homeAbbr|awayAbbr|start minute"
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const INCOMPLETE_STARTER_RETRY_MS = 10 * 60 * 1000; // 10 minutes before first pitch
const START_TIME_TOLERANCE_MS = 90 * 60 * 1000; // protects doubleheaders while allowing provider drift

export function getProbablePitcherCacheMeta(dateStr: string): MlbSignalCacheMeta {
  const cached = cache.get(dateStr);
  if (!cached) return { sourceCapturedAt: null, cacheAgeMs: null, stale: true };
  const cacheAgeMs = Math.max(0, Date.now() - cached.fetchedAt);
  return {
    sourceCapturedAt: new Date(cached.fetchedAt).toISOString(),
    cacheAgeMs,
    stale: cacheAgeMs >= CACHE_TTL_MS,
  };
}

/** MLB and ESPN event IDs differ, so use matchup plus precise scheduled start. */
export function makePitcherGameKey(
  homeAbbr: string,
  awayAbbr: string,
  commenceTimeISO: string,
): string | null {
  const startMs = Date.parse(commenceTimeISO);
  if (!Number.isFinite(startMs)) return null;
  return `${homeAbbr}|${awayAbbr}|${new Date(startMs).toISOString().slice(0, 16)}`;
}

type PitcherMatchType = "exact" | "time_tolerance" | "unmatched" | "ambiguous";

export interface ProbablePitcherMatch {
  starters: ProbableStarters | null;
  matchType: PitcherMatchType;
  candidateStarts: string[];
}

function keyStartMs(gameKey: string): number | null {
  const start = gameKey.split("|")[2];
  if (!start) return null;
  const startMs = Date.parse(`${start}:00.000Z`);
  return Number.isFinite(startMs) ? startMs : null;
}

function hasCompleteStarterPair(starters: ProbableStarters | null | undefined): boolean {
  return starters?.home != null && starters.away != null;
}

/**
 * Resolve an ESPN game to the official MLB schedule. Exact start-minute matches
 * are preferred. A unique nearby same-team game can tolerate normal provider
 * time drift, while tied/ambiguous doubleheader candidates remain blocked.
 */
export function resolveProbablePitcherMatch(
  scheduleMap: Map<string, ProbableStarters>,
  homeAbbr: string,
  awayAbbr: string,
  commenceTimeISO: string,
): ProbablePitcherMatch {
  const exactKey = makePitcherGameKey(homeAbbr, awayAbbr, commenceTimeISO);
  if (!exactKey) return { starters: null, matchType: "unmatched", candidateStarts: [] };
  const exact = scheduleMap.get(exactKey);
  if (exact) return { starters: exact, matchType: "exact", candidateStarts: [exactKey] };

  const expectedStartMs = Date.parse(commenceTimeISO);
  if (!Number.isFinite(expectedStartMs)) {
    return { starters: null, matchType: "unmatched", candidateStarts: [] };
  }

  const prefix = `${homeAbbr}|${awayAbbr}|`;
  const candidates = [...scheduleMap.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, starters]) => ({ key, starters, startMs: keyStartMs(key) }))
    .filter((candidate): candidate is { key: string; starters: ProbableStarters; startMs: number } =>
      candidate.startMs != null
        && Math.abs(candidate.startMs - expectedStartMs) <= START_TIME_TOLERANCE_MS,
    )
    .sort((a, b) =>
      Math.abs(a.startMs - expectedStartMs) - Math.abs(b.startMs - expectedStartMs),
    );
  const candidateStarts = candidates.map((candidate) => candidate.key);
  if (candidates.length === 0) {
    return { starters: null, matchType: "unmatched", candidateStarts };
  }

  if (candidates.length !== 1) {
    return { starters: null, matchType: "ambiguous", candidateStarts };
  }
  return { starters: candidates[0]!.starters, matchType: "time_tolerance", candidateStarts };
}

interface MlbTeam {
  team: { id?: number; name?: string };
  probablePitcher?: { id: number; fullName: string; pitchHand?: { code: string } };
}

interface MlbGame {
  /** Precise MLB start time, used to distinguish same-day doubleheader legs. */
  gameDate?: string;
  season?: string;
  teams: { home: MlbTeam; away: MlbTeam };
}

interface MlbSchedule {
  dates?: Array<{ games: MlbGame[] }>;
}

async function fetchSchedule(dateStr: string): Promise<Map<string, ProbableStarters>> {
  const url =
    `https://statsapi.mlb.com/api/v1/schedule` +
    `?sportId=1&date=${dateStr}&hydrate=probablePitcher,team&gameType=R`;

  const resp = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "TheBettingModel/2.0" },
  });
  if (!resp.ok) throw new Error(`MLB schedule API ${resp.status}`);

  const schedule = (await resp.json()) as MlbSchedule;
  // The Stats API can split schedule data across date buckets. Consume all of
  // them instead of assuming the requested day is always dates[0].
  const games = (schedule.dates ?? []).flatMap((date) => date.games ?? []);
  const season = Number(games.find((game) => game.season)?.season ?? dateStr.slice(0, 4));
  const statsSeason = Number.isInteger(season) && season > 1900
    ? season
    : new Date().getUTCFullYear();

  const pitchersById = new Map<number, string>();
  for (const g of games) {
    const homePitcher = g.teams.home.probablePitcher;
    const awayPitcher = g.teams.away.probablePitcher;
    if (homePitcher?.id) pitchersById.set(homePitcher.id, homePitcher.fullName);
    if (awayPitcher?.id) pitchersById.set(awayPitcher.id, awayPitcher.fullName);
  }
  const pitcherIds = new Set(pitchersById.keys());

  const statsByPitcherId = new Map<number, PitcherStats>();
  const statFailureByPitcherId = new Map<number, string>();
  // handMap populated by batch people call below — pitchHand is NOT in probablePitcher hydration
  const handMap = new Map<number, "L" | "R">();

  const fetchAllPitcherStats = async () => {
    const pitchers = [...pitchersById.entries()];
    for (let start = 0; start < pitchers.length; start += PITCHER_STATS_CONCURRENCY) {
      const batch = pitchers.slice(start, start + PITCHER_STATS_CONCURRENCY);
      await Promise.all(batch.map(async ([id, name]) => {
        try {
          const stats = await fetchPitcherStats(id, name, statsSeason);
          statsByPitcherId.set(id, stats);
        } catch (err) {
          const reason = err instanceof Error ? err.message : "unknown pitcher stats failure";
          statFailureByPitcherId.set(id, reason);
          logger.warn(
            { err, pitcherId: id, reason },
            "MLB pitchers: stat verification failed; starter excluded from model evidence",
          );
        }
      }));
    }
  };

  await Promise.all([
    // Per-pitcher stats are deliberately bounded so a full slate cannot
    // overwhelm the provider and lose every starter to the same timeout.
    fetchAllPitcherStats(),
    // Batch people call to get pitchHand for all pitchers in one request
    (async () => {
      if (pitcherIds.size === 0) return;
      try {
        const url = `https://statsapi.mlb.com/api/v1/people?personIds=${[...pitcherIds].join(",")}`;
        const resp = await fetch(url, {
          signal: AbortSignal.timeout(8_000),
          headers: { "User-Agent": "TheBettingModel/2.0" },
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as {
          people?: Array<{ id: number; pitchHand?: { code: string } }>;
        };
        for (const p of data.people ?? []) {
          const code = p.pitchHand?.code;
          if (code === "L" || code === "R") handMap.set(p.id, code);
        }
      } catch {
        // non-fatal — pitchHand stays unknown for this run
      }
    })(),
  ]);

  const result = new Map<string, ProbableStarters>();

  for (const g of games) {
    const homeId   = g.teams.home.team?.id;
    const awayId   = g.teams.away.team?.id;
    const homeAbbr = homeId ? (MLB_ID_TO_ESPN[homeId] ?? "") : "";
    const awayAbbr = awayId ? (MLB_ID_TO_ESPN[awayId] ?? "") : "";
    if (!homeAbbr || !awayAbbr) continue;

    const homeP = g.teams.home.probablePitcher;
    const awayP = g.teams.away.probablePitcher;

    const gameKey = g.gameDate
      ? makePitcherGameKey(homeAbbr, awayAbbr, g.gameDate)
      : null;
    if (!gameKey) {
      logger.warn({ homeAbbr, awayAbbr }, "MLB pitchers: skipped game without valid start time");
      continue;
    }

    const verifiedStarter = (pitcher: MlbTeam["probablePitcher"]): PitcherStats | null => {
      if (!pitcher) return null;
      const stats = statsByPitcherId.get(pitcher.id);
      return stats
        ? { ...stats, playerId: pitcher.id, pitchHand: handMap.get(pitcher.id) ?? null }
        : null;
    };
    const statFailureReason = (side: "home" | "away", pitcher: MlbTeam["probablePitcher"]): string[] => {
      if (!pitcher || statsByPitcherId.has(pitcher.id)) return [];
      const failure = statFailureByPitcherId.get(pitcher.id) ?? "";
      if (failure.includes("identity mismatch")) return [`${side}_starter_stats_identity_mismatch`];
      if (failure.startsWith("invalid ") || failure.startsWith("missing ")) {
        return [`${side}_starter_stats_malformed_or_incomplete`];
      }
      return [`${side}_starter_stats_fetch_failed`];
    };
    const home = verifiedStarter(homeP);
    const away = verifiedStarter(awayP);
    const qualityReasons = [
      ...(!homeP ? ["home_probable_starter_missing"] : []),
      ...(!awayP ? ["away_probable_starter_missing"] : []),
      ...statFailureReason("home", homeP),
      ...statFailureReason("away", awayP),
    ];
    result.set(gameKey, { home, away, qualityReasons });
  }

  logger.info(
    {
      date: dateStr,
      games: result.size,
      pitchersFound: statsByPitcherId.size,
      incompleteGames: [...result.values()].filter((starters) => !hasCompleteStarterPair(starters)).length,
      season: statsSeason,
    },
    "MLB pitchers: schedule loaded",
  );
  return result;
}

function shouldRetryIncompletePitchers(
  cached: CacheEntry | undefined,
  match: ProbablePitcherMatch,
  commenceTimeISO: string,
): boolean {
  if (!cached || hasCompleteStarterPair(match.starters)) return false;
  const startMs = Date.parse(commenceTimeISO);
  return Number.isFinite(startMs)
    && startMs > Date.now()
    && Date.now() - cached.fetchedAt >= INCOMPLETE_STARTER_RETRY_MS;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getProbablePitchers(
  homeAbbr: string,
  awayAbbr: string,
  dateStr: string,
  commenceTimeISO: string,
): Promise<ProbableStarters> {
  let cached = cache.get(dateStr);
  let scheduleMap: Map<string, ProbableStarters>;

  const cachedMatch = cached
    ? resolveProbablePitcherMatch(cached.data, homeAbbr, awayAbbr, commenceTimeISO)
    : null;
  const cacheIsFresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
  if (cacheIsFresh && cachedMatch && !shouldRetryIncompletePitchers(cached, cachedMatch, commenceTimeISO)) {
    scheduleMap = cached!.data;
  } else {
    try {
      scheduleMap = await fetchSchedule(dateStr);
      cached = { data: scheduleMap, fetchedAt: Date.now() };
      cache.set(dateStr, cached);
    } catch (err) {
      logger.error({ err, dateStr }, "MLB pitchers: schedule fetch failed");
      scheduleMap = cached?.data ?? new Map();
    }
  }

  const match = resolveProbablePitcherMatch(scheduleMap, homeAbbr, awayAbbr, commenceTimeISO);
  if (!match.starters) {
    logger.warn(
      { dateStr, homeAbbr, awayAbbr, commenceTimeISO, matchType: match.matchType, candidateStarts: match.candidateStarts },
      "MLB pitchers: no safe schedule matchup",
    );
    return {
      home: null,
      away: null,
      qualityReasons: [
        match.matchType === "ambiguous"
          ? "starter_schedule_match_ambiguous"
          : "starter_schedule_match_unavailable",
      ],
    };
  }
  if (!hasCompleteStarterPair(match.starters)) {
    logger.info(
      { dateStr, homeAbbr, awayAbbr, commenceTimeISO, matchType: match.matchType },
      "MLB pitchers: schedule matchup is missing one or both probable starters",
    );
  } else if (match.matchType === "time_tolerance") {
    logger.info(
      { dateStr, homeAbbr, awayAbbr, commenceTimeISO },
      "MLB pitchers: matched schedule with start-time tolerance",
    );
  }
  return match.starters;
}

/**
 * Compute a [-0.08, +0.08] pitcher advantage score for the home team.
 *
 * Positive = home starter advantage. Negative = away starter advantage.
 *
 * Signal blend (in priority order):
 *   45% — FIP differential       (removes defense/luck; best predictor)
 *   30% — Recent ERA differential (last-3-start form)
 *   25% — K-BB% differential     (dominance/swing-and-miss profile)
 *
 * Workload scaling:
 *   When average recent IP < 5.5 (bullpen game or injury-depleted arm),
 *   the starter's impact is reduced because the bullpen will pitch more.
 *
 * Times-through-order:
 *   When both starters typically go 6+ IP, both face the lineup 3× — a
 *   tiny randomness increase is applied (variance goes up, edges compress).
 */
export function computePitcherAdvantage(starters: ProbableStarters): number {
  const { home, away } = starters;
  // Never manufacture a generic pitcher signal when either scheduled starter
  // is missing or failed source validation. The MLB decision-evidence gate will
  // block publication in this state; returning zero also protects callers that
  // compute a provisional projection before inspecting that gate.
  if (!home || !away) return 0;

  // ── FIP differential ───────────────────────────────────────────────────────
  const homeFip = home.fip;
  const awayFip = away.fip;
  const fipDiff = awayFip - homeFip; // positive = home pitcher better

  // ── Recent ERA differential ────────────────────────────────────────────────
  const homeRecent = home.recentEra;
  const awayRecent = away.recentEra;
  const recentDiff = awayRecent - homeRecent; // positive = home pitcher better

  // ── K-BB% differential (scaled to ERA-equivalent units) ───────────────────
  // Each 1pp K-BB% gap ≈ 0.05 ERA-point advantage (conservative calibration).
  // Elite vs. replacement K-BB% gap (~0.20) ≈ 1 ERA-point equivalent.
  const homeKBB = home.kMinusBbPct;
  const awayKBB = away.kMinusBbPct;
  const kbbDiffEraEq = (homeKBB - awayKBB) * 5; // positive = home pitcher more dominant

  // ── Weighted blend ─────────────────────────────────────────────────────────
  const blended = fipDiff * 0.45 + recentDiff * 0.30 + kbbDiffEraEq * 0.25;

  // ── Workload and sample-reliability scaling ─────────────────────────────────
  // If average recent IP is low, starter carries less of the game → reduce impact.
  // Full credit at ≥6.0 IP avg; floors at 60% for a true bullpen game (≤3.0 IP avg).
  const homeIp = home.recentIpAvg;
  const awayIp = away.recentIpAvg;
  const avgIp  = (homeIp + awayIp) / 2;
  const workloadFactor = Math.min(1.0, Math.max(0.60, avgIp / 6.0));
  const avgPitches = (home.recentPitchCountAvg + away.recentPitchCountAvg) / 2;
  const pitchCountFactor = Math.min(1.0, Math.max(0.65, avgPitches / 90));

  // Early-season or limited-workload rate stats are noisy. Require both a
  // meaningful innings sample and batters-faced sample before granting full
  // conviction; the floor preserves a modest signal without inventing certainty.
  const reliability = (pitcher: PitcherStats) => {
    const innings = Math.min(1, pitcher.seasonIp / 60);
    const batters = Math.min(1, pitcher.seasonBattersFaced / 250);
    return Math.max(0.35, Math.min(1, (innings + batters) / 2));
  };
  const sampleFactor = Math.min(reliability(home), reliability(away));

  // ── Times-through-order adjustment ────────────────────────────────────────
  // When both starters go deep, both face the lineup 3× — this increases
  // variance slightly, compressing the edge. Effect is intentionally tiny.
  const ttoAdj = avgIp >= 6.0 ? -0.003 : 0;

  // ── Final score: scale to probability, apply workload, cap ────────────────
  // Each ERA-equivalent point in blended ≈ 0.025 win probability shift.
  const raw = blended * 0.025 * workloadFactor * pitchCountFactor * sampleFactor + ttoAdj;
  return Math.max(-0.08, Math.min(0.08, raw));
}
