/**
 * WNBA Injury / Availability Service — ESPN Injury API (free, no key)
 *
 * The WNBA has small rosters (~12 active players) where a single star accounts
 * for 15–25% of team scoring. A'ja Wilson, Breanna Stewart, Caitlin Clark
 * individually shift expected margin by 4–8 points when they sit.
 *
 * Position weights reflect individual impact in a 40-game WNBA season:
 *   C  (Center / power forward): 10  — interior dominant players (A'ja Wilson)
 *   F  (Forward):                 9  — wing stars (Breanna Stewart, Napheesa Collier)
 *   G  (Guard):                   8  — playmakers / scorers (Caitlin Clark, Sabrina Ionescu)
 *   G-F / F-G hybrid:             8  — versatile wings
 *
 * Status mappings (from ESPN `status` field):
 *   Out            → 1.00 — confirmed missing
 *   Doubtful       → 0.75 — ~75% chance of missing
 *   Questionable   → 0.35 — ~35% chance of missing
 *   Day-To-Day     → 0.20 — likely playing with restriction
 *
 * Returns an impact score in [-0.07, 0] per team.
 * Negative = team weakened by injury/absence.
 * The advantage function computes (awayImpact − homeImpact), clamped to [-0.07, +0.07].
 *
 * Cache TTL: 3 hours (injury reports updated by ESPN throughout the day)
 */

import { logger } from "../lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WnbaTeamInjuryImpact {
  /** Probability penalty in [-0.07, 0]. 0 = fully healthy. */
  impactScore: number;
  /** Human-readable list of key missing players, e.g. ["A'ja Wilson (C, Out)"] */
  keyInjuries: string[];
}

// ── Position weights ──────────────────────────────────────────────────────────
// WNBA positions from ESPN: "C", "F", "G", "G-F", "F-G", "F-C", "C-F"

const POSITION_WEIGHT: Record<string, number> = {
  C:   10,
  F:    9,
  G:    8,
  "G-F": 8,
  "F-G": 8,
  "F-C": 9,
  "C-F": 9,
};

const STATUS_MULTIPLIER: Record<string, number> = {
  "Out":          1.00,
  "Doubtful":     0.75,
  "Questionable": 0.35,
  "Day-To-Day":   0.20,
};

/** Max raw impact sum before normalization to a probability shift */
const MAX_RAW_IMPACT = 30;

/** Max probability shift per team — individual stars in WNBA matter more than in NFL */
const MAX_PROB_SHIFT = 0.07;

// ── Cache ─────────────────────────────────────────────────────────────────────

/** Map from ESPN team ID (numeric string) → impact */
let reportCache: { data: Map<string, WnbaTeamInjuryImpact>; fetchedAt: number } | null = null;
const TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

// ── ESPN response interfaces ──────────────────────────────────────────────────

interface EspnWnbaInjury {
  status?: string;
  athlete?: {
    displayName?: string;
    position?: { abbreviation?: string; displayName?: string };
  };
}

interface EspnWnbaTeam {
  id?: string;            // ESPN numeric team ID — matches homeTeamId/awayTeamId in games table
  displayName?: string;
  injuries?: EspnWnbaInjury[];
}

interface EspnWnbaInjuryResponse {
  injuries?: EspnWnbaTeam[];
}

// ── Impact computation ────────────────────────────────────────────────────────

function computeTeamImpact(injuries: EspnWnbaInjury[]): WnbaTeamInjuryImpact {
  let rawImpact = 0;
  const keyInjuries: string[] = [];

  for (const inj of injuries) {
    const status = inj.status ?? "";
    const mult = STATUS_MULTIPLIER[status];
    if (!mult) continue; // Active / "Active" / unknown — skip

    const posAbbr = inj.athlete?.position?.abbreviation ?? "";
    const posWeight = POSITION_WEIGHT[posAbbr] ?? 5; // fallback = average contributor
    const contribution = posWeight * mult;
    rawImpact += contribution;

    // Track notable absences (weight ≥ 5 × mult ≥ 0.35 = contribution ≥ 1.75)
    if (contribution >= 1.75 && inj.athlete?.displayName) {
      keyInjuries.push(
        `${inj.athlete.displayName} (${posAbbr || "?"}, ${status})`,
      );
    }
  }

  // Normalize: MAX_RAW_IMPACT → MAX_PROB_SHIFT
  const impactScore = -Math.min(MAX_PROB_SHIFT, (rawImpact / MAX_RAW_IMPACT) * MAX_PROB_SHIFT);

  return { impactScore, keyInjuries: keyInjuries.slice(0, 5) };
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchAllInjuries(): Promise<Map<string, WnbaTeamInjuryImpact>> {
  const url = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/injuries";
  const resp = await fetch(url, {
    headers: { "User-Agent": "TheBettingModel/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`WNBA injuries: HTTP ${resp.status}`);

  const data = (await resp.json()) as EspnWnbaInjuryResponse;
  const result = new Map<string, WnbaTeamInjuryImpact>();

  for (const team of data.injuries ?? []) {
    const teamId = team.id;
    if (!teamId) continue;
    result.set(teamId, computeTeamImpact(team.injuries ?? []));
  }

  logger.info({ teams: result.size }, "WNBA injuries: report loaded");
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the injury/availability impact for a single WNBA team by its ESPN team ID.
 * Returns { impactScore: 0, keyInjuries: [] } on error (safe default = no adjustment).
 */
export async function getWnbaTeamInjuryImpact(
  espnTeamId: string,
): Promise<WnbaTeamInjuryImpact> {
  if (!espnTeamId) return { impactScore: 0, keyInjuries: [] };

  const now = Date.now();

  if (!reportCache || now - reportCache.fetchedAt > TTL_MS) {
    try {
      const data = await fetchAllInjuries();
      reportCache = { data, fetchedAt: now };
    } catch (err) {
      logger.warn({ err }, "WNBA injuries: fetch failed; using stale or empty data");
      if (!reportCache) reportCache = { data: new Map(), fetchedAt: now };
    }
  }

  return reportCache.data.get(espnTeamId) ?? { impactScore: 0, keyInjuries: [] };
}

/**
 * Compute the net probability advantage for the home team.
 * Positive = home team is relatively healthier.
 * Clamped to [-0.07, +0.07].
 */
export function computeWnbaInjuryAdvantage(
  homeImpact: WnbaTeamInjuryImpact,
  awayImpact: WnbaTeamInjuryImpact,
): number {
  // Both scores are in [-0.07, 0]; their difference = relative advantage
  const raw = awayImpact.impactScore - homeImpact.impactScore;
  return Math.max(-MAX_PROB_SHIFT, Math.min(MAX_PROB_SHIFT, raw));
}
