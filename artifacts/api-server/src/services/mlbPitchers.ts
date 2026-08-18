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
 * Cache TTL: 4 hours. Probable pitchers announced by morning; day-of scratches
 * are rare and typically announced hours before game time.
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
}

export interface ProbableStarters {
  home: PitcherStats | null;
  away: PitcherStats | null;
}

// ── MLB Stats API team ID → ESPN abbreviation ─────────────────────────────────
const MLB_ID_TO_ESPN: Record<number, string> = {
  109: "ARI",  133: "ATH",  144: "ATL",  110: "BAL",  111: "BOS",
  112: "CHC",  145: "CWS",  113: "CIN",  114: "CLE",  115: "COL",
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse MLB Stats API innings-pitched string "175.2" → 175.667
 * The decimal portion represents outs (0 = 0 outs, .1 = 1 out = 1/3 IP, .2 = 2/3 IP).
 */
function parseIP(ip: string | undefined): number {
  if (!ip) return 0;
  const [whole, thirds] = ip.split(".").map(Number);
  return (whole ?? 0) + ((thirds ?? 0) / 3);
}

// ── MLB Stats API types ───────────────────────────────────────────────────────

interface MlbPitchingStat {
  era?: string;
  whip?: string;
  inningsPitched?: string;
  strikeOuts?: number;
  battersFaced?: number;
  homeRuns?: number;
  baseOnBalls?: number;
  numberOfPitches?: number;
}

interface MlbGameLogSplit {
  date: string;
  stat: MlbPitchingStat;
}

interface MlbStatGroup {
  type: { displayName: string };
  splits: MlbGameLogSplit[];
}

// ── Pitcher stat fetch ────────────────────────────────────────────────────────

async function fetchPitcherStats(pitcherId: number, name: string): Promise<PitcherStats> {
  const url =
    `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats` +
    `?stats=season,gameLog&group=pitching&season=2026&gameType=R`;

  const resp = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: { "User-Agent": "TheBettingModel/2.0" },
  });
  if (!resp.ok) throw new Error(`MLB Stats API ${resp.status} for pitcher ${pitcherId}`);

  const data = (await resp.json()) as { stats: MlbStatGroup[] };

  // ── Season totals ─────────────────────────────────────────────────────────
  const seasonGroup = data.stats.find((s) => s.type.displayName === "season");
  const seasonSplit  = seasonGroup?.splits?.[0]?.stat;
  const latestLog    = (data.stats.find((s) => s.type.displayName === "gameLog")?.splits ?? [])[0]?.stat;

  const seasonEra  = parseFloat(seasonSplit?.era  ?? latestLog?.era  ?? String(LEAGUE_AVG_ERA));
  const seasonWhip = parseFloat(seasonSplit?.whip ?? latestLog?.whip ?? String(LEAGUE_AVG_WHIP));

  // ── FIP and peripherals ───────────────────────────────────────────────────
  // Use season totals for FIP/K%/BB% — large sample is more reliable than recent.
  const seasonIp  = parseIP(seasonSplit?.inningsPitched);
  const seasonK   = seasonSplit?.strikeOuts    ?? 0;
  const seasonBb  = seasonSplit?.baseOnBalls   ?? 0;
  const seasonHr  = seasonSplit?.homeRuns      ?? 0;
  const seasonBf  = seasonSplit?.battersFaced  ?? 0;

  const fip =
    seasonIp > 10
      ? (13 * seasonHr + 3 * seasonBb - 2 * seasonK) / seasonIp + FIP_CONSTANT
      : LEAGUE_AVG_FIP;

  const kPct       = seasonBf > 20 ? seasonK / seasonBf : LEAGUE_AVG_K_PCT;
  const bbPct      = seasonBf > 20 ? seasonBb / seasonBf : LEAGUE_AVG_BB_PCT;
  const kMinusBbPct = kPct - bbPct;

  // ── Recent form (last 3 starts) ───────────────────────────────────────────
  const gameLogGroup = data.stats.find((s) => s.type.displayName === "gameLog");
  const lastStarts   = (gameLogGroup?.splits ?? []).slice(0, 3);

  let recentEraSum = 0;
  let recentIpSum  = 0;
  let count        = 0;

  for (const start of lastStarts) {
    const era = parseFloat(start.stat.era ?? "0");
    const ip  = parseIP(start.stat.inningsPitched);
    if (!isNaN(era) && ip > 0) {
      recentEraSum += era;
      recentIpSum  += ip;
      count++;
    }
  }

  const recentEra   = count > 0 ? recentEraSum / count : seasonEra;
  const recentIpAvg = count > 0 ? recentIpSum  / count : 5.5;

  return {
    name,
    playerId:     null, // populated by fetchSchedule which has the pitcher's API id
    pitchHand:    null, // populated by fetchSchedule from probablePitcher.pitchHand
    seasonEra:    isNaN(seasonEra)  ? LEAGUE_AVG_ERA  : seasonEra,
    seasonWhip:   isNaN(seasonWhip) ? LEAGUE_AVG_WHIP : seasonWhip,
    fip:          isNaN(fip)        ? LEAGUE_AVG_FIP  : Math.max(1.5, Math.min(7.0, fip)),
    kPct,
    bbPct,
    kMinusBbPct,
    recentEra:    isNaN(recentEra)  ? seasonEra : recentEra,
    recentIpAvg:  isNaN(recentIpAvg) ? 5.5 : recentIpAvg,
  };
}

// ── Schedule fetch + cache ────────────────────────────────────────────────────

interface CacheEntry {
  data: Map<string, ProbableStarters>; // key: "homeAbbr|awayAbbr"
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface MlbTeam {
  team: { id?: number; name?: string };
  probablePitcher?: { id: number; fullName: string; pitchHand?: { code: string } };
}

interface MlbGame {
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
  const games    = schedule.dates?.[0]?.games ?? [];

  const pitcherIds = new Set<number>();
  for (const g of games) {
    if (g.teams.home.probablePitcher?.id) pitcherIds.add(g.teams.home.probablePitcher.id);
    if (g.teams.away.probablePitcher?.id) pitcherIds.add(g.teams.away.probablePitcher.id);
  }

  const statsByPitcherId = new Map<number, PitcherStats>();
  await Promise.allSettled(
    [...pitcherIds].map(async (id) => {
      try {
        const pitcher = games
          .flatMap((g) => [g.teams.home.probablePitcher, g.teams.away.probablePitcher])
          .find((p) => p?.id === id);
        const stats = await fetchPitcherStats(id, pitcher?.fullName ?? "Unknown");
        statsByPitcherId.set(id, stats);
      } catch (err) {
        logger.warn({ err, pitcherId: id }, "MLB pitchers: stat fetch failed for one pitcher");
      }
    }),
  );

  const LEAGUE_AVG_DEFAULTS: PitcherStats = {
    name: "Unknown",
    playerId: null, pitchHand: null,
    seasonEra: LEAGUE_AVG_ERA, seasonWhip: LEAGUE_AVG_WHIP,
    fip: LEAGUE_AVG_FIP, kPct: LEAGUE_AVG_K_PCT, bbPct: LEAGUE_AVG_BB_PCT,
    kMinusBbPct: LEAGUE_AVG_KBB, recentEra: LEAGUE_AVG_ERA, recentIpAvg: 5.5,
  };

  const result = new Map<string, ProbableStarters>();

  for (const g of games) {
    const homeId   = g.teams.home.team?.id;
    const awayId   = g.teams.away.team?.id;
    const homeAbbr = homeId ? (MLB_ID_TO_ESPN[homeId] ?? "") : "";
    const awayAbbr = awayId ? (MLB_ID_TO_ESPN[awayId] ?? "") : "";
    if (!homeAbbr || !awayAbbr) continue;

    const homeP = g.teams.home.probablePitcher;
    const awayP = g.teams.away.probablePitcher;

    const toHand = (code?: string): "L" | "R" | null =>
      code === "L" || code === "R" ? code : null;

    result.set(`${homeAbbr}|${awayAbbr}`, {
      home: homeP
        ? {
            ...(statsByPitcherId.get(homeP.id) ?? { ...LEAGUE_AVG_DEFAULTS, name: homeP.fullName }),
            playerId:  homeP.id,
            pitchHand: toHand(homeP.pitchHand?.code),
          }
        : null,
      away: awayP
        ? {
            ...(statsByPitcherId.get(awayP.id) ?? { ...LEAGUE_AVG_DEFAULTS, name: awayP.fullName }),
            playerId:  awayP.id,
            pitchHand: toHand(awayP.pitchHand?.code),
          }
        : null,
    });
  }

  logger.info(
    { date: dateStr, games: result.size, pitchersFound: statsByPitcherId.size },
    "MLB pitchers: schedule loaded",
  );
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getProbablePitchers(
  homeAbbr: string,
  awayAbbr: string,
  dateStr: string,
): Promise<ProbableStarters> {
  const cached = cache.get(dateStr);
  let scheduleMap: Map<string, ProbableStarters>;

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    scheduleMap = cached.data;
  } else {
    try {
      scheduleMap = await fetchSchedule(dateStr);
      cache.set(dateStr, { data: scheduleMap, fetchedAt: Date.now() });
    } catch (err) {
      logger.error({ err, dateStr }, "MLB pitchers: schedule fetch failed");
      scheduleMap = cached?.data ?? new Map();
    }
  }

  return scheduleMap.get(`${homeAbbr}|${awayAbbr}`) ?? { home: null, away: null };
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

  // ── FIP differential ───────────────────────────────────────────────────────
  const homeFip = home?.fip ?? LEAGUE_AVG_FIP;
  const awayFip = away?.fip ?? LEAGUE_AVG_FIP;
  const fipDiff = awayFip - homeFip; // positive = home pitcher better

  // ── Recent ERA differential ────────────────────────────────────────────────
  const homeRecent = home?.recentEra ?? (home?.seasonEra ?? LEAGUE_AVG_ERA);
  const awayRecent = away?.recentEra ?? (away?.seasonEra ?? LEAGUE_AVG_ERA);
  const recentDiff = awayRecent - homeRecent; // positive = home pitcher better

  // ── K-BB% differential (scaled to ERA-equivalent units) ───────────────────
  // Each 1pp K-BB% gap ≈ 0.05 ERA-point advantage (conservative calibration).
  // Elite vs. replacement K-BB% gap (~0.20) ≈ 1 ERA-point equivalent.
  const homeKBB = home?.kMinusBbPct ?? LEAGUE_AVG_KBB;
  const awayKBB = away?.kMinusBbPct ?? LEAGUE_AVG_KBB;
  const kbbDiffEraEq = (homeKBB - awayKBB) * 5; // positive = home pitcher more dominant

  // ── Weighted blend ─────────────────────────────────────────────────────────
  const blended = fipDiff * 0.45 + recentDiff * 0.30 + kbbDiffEraEq * 0.25;

  // ── Workload scaling ───────────────────────────────────────────────────────
  // If average recent IP is low, starter carries less of the game → reduce impact.
  // Full credit at ≥6.0 IP avg; floors at 60% for a true bullpen game (≤3.0 IP avg).
  const homeIp = home?.recentIpAvg ?? 5.5;
  const awayIp = away?.recentIpAvg ?? 5.5;
  const avgIp  = (homeIp + awayIp) / 2;
  const workloadFactor = Math.min(1.0, Math.max(0.60, avgIp / 6.0));

  // ── Times-through-order adjustment ────────────────────────────────────────
  // When both starters go deep, both face the lineup 3× — this increases
  // variance slightly, compressing the edge. Effect is intentionally tiny.
  const ttoAdj = avgIp >= 6.0 ? -0.003 : 0;

  // ── Final score: scale to probability, apply workload, cap ────────────────
  // Each ERA-equivalent point in blended ≈ 0.025 win probability shift.
  const raw = blended * 0.025 * workloadFactor + ttoAdj;
  return Math.max(-0.08, Math.min(0.08, raw));
}
