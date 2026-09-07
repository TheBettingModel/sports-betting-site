/**
 * NFL Injury Report Service — ESPN Injury API (free, no key)
 *
 * Official NFL injury designations (Out, Doubtful, Questionable) are released
 * Wednesday–Friday each week. On game day, final statuses appear by noon.
 *
 * Position weights reflect the impact of each position on game outcome:
 *   QB:  15  (losing a starter is catastrophic)
 *   WR1: 5   (key pass-catcher)
 *   RB:  4
 *   OL:  3   (affects both run and pass)
 *   TE:  3
 *   DL:  3   (pass rush quality)
 *   LB:  3
 *   CB:  3   (cover corner)
 *   S:   2
 *   K:   4   (kicker Out = high-variance situation)
 *
 * Status multipliers:
 *   Out (O, IR, PUP, DNP): 1.0  — confirmed missing
 *   Doubtful (D):          0.75 — 75% chance of missing
 *   Questionable (Q):      0.35 — 35% chance of missing
 *
 * Returns an impact score in [-0.06, 0] per team.
 * Negative = team is weakened (key players out).
 * The model subtracts the home team's injury penalty and adds the away team's
 * to shift win probability toward the healthier side.
 *
 * Cache TTL: 3 hours (injury reports update daily in-season; negligible off-season)
 */

import { logger } from "../lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TeamInjuryImpact {
  /** Probability penalty: in [-0.06, 0]. 0 = fully healthy. */
  impactScore: number;
  /** Human-readable summary of key missing players */
  keyInjuries: string[];
}

// ── Position weights ──────────────────────────────────────────────────────────

const POSITION_WEIGHT: Record<string, number> = {
  QB:  15,
  WR:  5,
  RB:  4,
  K:   4,
  FB:  2,
  OL:  3,
  OT:  3,
  OG:  3,
  C:   3,
  TE:  3,
  DT:  3,
  DE:  3,
  DL:  3,
  NT:  2,
  LB:  3,
  ILB: 3,
  OLB: 3,
  MLB: 3,
  CB:  3,
  S:   2,
  SS:  2,
  FS:  2,
  P:   1,
  LS:  1,
};

// Status abbreviations that mean meaningful absences
const STATUS_MULTIPLIER: Record<string, number> = {
  O:   1.00,  // Out
  IR:  1.00,  // Injured Reserve
  PUP: 1.00,  // Physically Unable to Perform
  D:   0.75,  // Doubtful
  Q:   0.35,  // Questionable
  DNP: 0.90,  // Did Not Practice (all week = likely out)
};

// Max total raw impact before normalization
const MAX_RAW_IMPACT = 25;

// ── Cache ─────────────────────────────────────────────────────────────────────

interface TeamEntry {
  impact: TeamInjuryImpact;
  fetchedAt: number;
}

// Shared full report cache (one fetch for all 32 teams)
let reportCache: { data: Map<string, TeamInjuryImpact>; fetchedAt: number } | null = null;
const TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

// Per-team lookups
const teamCache = new Map<string, TeamEntry>();

// ── ESPN Injury fetch ─────────────────────────────────────────────────────────

interface EspnInjury {
  athlete?: {
    displayName?: string;
    position?: { abbreviation?: string };
  };
  status?: string;
  type?: { abbreviation?: string };
}

interface EspnTeamInjuries {
  displayName?: string;
  team?: { abbreviation?: string };
  injuries?: EspnInjury[];
}

interface EspnInjuryResponse {
  injuries?: EspnTeamInjuries[];
}

function parseTeamAbbr(team: EspnTeamInjuries): string {
  // ESPN returns team.abbreviation OR team name matching
  return team.team?.abbreviation ?? team.displayName?.substring(0, 3).toUpperCase() ?? "";
}

function computeTeamImpact(injuries: EspnInjury[]): TeamInjuryImpact {
  let rawImpact = 0;
  const keyInjuries: string[] = [];

  for (const inj of injuries) {
    const statusAbbr = inj.type?.abbreviation ?? inj.status ?? "";
    const mult = STATUS_MULTIPLIER[statusAbbr.toUpperCase()];
    if (!mult) continue; // Active / Full / INJURED_STATUS_ACTIVE

    const posAbbr = inj.athlete?.position?.abbreviation?.toUpperCase() ?? "";
    const posWeight = POSITION_WEIGHT[posAbbr] ?? 1;
    const contribution = posWeight * mult;
    rawImpact += contribution;

    if (posWeight >= 4 && mult >= 0.35) {
      const name = inj.athlete?.displayName ?? "Unknown";
      const label = `${name} (${posAbbr}, ${statusAbbr})`;
      keyInjuries.push(label);
    }
  }

  // Normalize to probability penalty in [-0.06, 0]
  const impactScore = -(Math.min(rawImpact, MAX_RAW_IMPACT) / MAX_RAW_IMPACT) * 0.06;

  return { impactScore, keyInjuries: keyInjuries.slice(0, 5) };
}

async function fetchAllInjuries(): Promise<Map<string, TeamInjuryImpact>> {
  const url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries?limit=100";

  const resp = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "TheBettingModel/2.0" },
  });
  if (!resp.ok) throw new Error(`ESPN injuries API ${resp.status}`);

  const data = (await resp.json()) as EspnInjuryResponse;
  const result = new Map<string, TeamInjuryImpact>();

  for (const team of data.injuries ?? []) {
    const abbr = parseTeamAbbr(team);
    if (!abbr) continue;
    result.set(abbr, computeTeamImpact(team.injuries ?? []));
  }

  logger.info({ teams: result.size }, "NFL injuries: report loaded");
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the injury impact for a single NFL team.
 * Returns { impactScore: 0, keyInjuries: [] } on error (safe default = no adjustment).
 */
export async function getTeamInjuryImpact(teamAbbr: string): Promise<TeamInjuryImpact> {
  const now = Date.now();

  // Refresh shared report if stale
  if (!reportCache || now - reportCache.fetchedAt > TTL_MS) {
    try {
      const data = await fetchAllInjuries();
      reportCache = { data, fetchedAt: now };
    } catch (err) {
      logger.warn({ err }, "NFL injuries: report fetch failed; using stale or empty data");
      if (!reportCache) reportCache = { data: new Map(), fetchedAt: now };
    }
  }

  return reportCache.data.get(teamAbbr) ?? { impactScore: 0, keyInjuries: [] };
}

/**
 * Compute the net probability advantage for the home team from injury reports.
 * Positive = home team is relatively healthier.
 *
 * Formula: (awayImpact − homeImpact), clamped to [-0.05, +0.05].
 * This is additive to the base win probability.
 */
export function computeInjuryAdvantage(
  homeImpact: TeamInjuryImpact,
  awayImpact: TeamInjuryImpact,
): number {
  // Both scores are in [-0.06, 0]; their difference gives a relative advantage
  const raw = awayImpact.impactScore - homeImpact.impactScore;
  // Away injuries help home team (positive); home injuries help away team (negative)
  return Math.max(-0.05, Math.min(0.05, raw));
}
