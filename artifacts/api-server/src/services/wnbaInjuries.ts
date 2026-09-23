/**
 * WNBA availability evidence. ESPN is the report-of-record; this module does
 * not infer starters, lineups, or minute restrictions when ESPN has not said so.
 */
import { logger } from "../lib/logger";

export type InjuryRole = "starter" | "rotation" | "unknown";
export interface WnbaInjuryPlayer {
  athleteId?: string;
  name: string;
  position: string | null;
  status: string;
  comments: string | null;
  /** Report-status probability only, not a market price. */
  expectedAvailabilityProbability: number | null;
  /** Only populated when the provider supplied usable player-stat evidence. */
  playerQuality: { value: number; metric: string; source: "espn-injury-payload" } | null;
  /** Null rather than invented when no reliable restriction/minutes feed exists. */
  expectedMinutesLost: number | null;
  role: InjuryRole;
  roleUncertainty: "unknown-lineup";
  minutesRestriction: "unknown";
}

export interface WnbaTeamInjuryImpact {
  /** Bounded model adjustment in [-0.07, 0], deliberately separate from prices. */
  impactScore: number;
  keyInjuries: string[];
  /** Optional for source compatibility with pre-evidence callers; service results always include it. */
  players?: WnbaInjuryPlayer[];
  evidence?: {
    source: "espn";
    sourceSeason: number;
    capturedAt: string;
    stale: boolean;
    missing: string[];
  };
}

const POSITION_WEIGHT: Record<string, number> = {
  C: 10, F: 9, G: 8, "G-F": 8, "F-G": 8, "F-C": 9, "C-F": 9,
};
const STATUS_MULTIPLIER: Record<string, number> = {
  out: 1, doubtful: .75, questionable: .35, "day-to-day": .2,
};
const AVAILABILITY: Record<string, number> = {
  out: 0, doubtful: .25, questionable: .65, "day-to-day": .8,
};
const MAX_RAW_IMPACT = 30;
const MAX_PROB_SHIFT = .07;
const TTL_MS = 3 * 60 * 60 * 1000;
let reportCache: { data: Map<string, WnbaTeamInjuryImpact>; fetchedAt: number } | null = null;

interface EspnWnbaInjury {
  status?: string; comment?: string; details?: string;
  athlete?: {
    id?: string; displayName?: string;
    position?: { abbreviation?: string; displayName?: string };
    // ESPN payload variants occasionally attach a per-game stat display value.
    statistics?: Array<{ name?: string; displayValue?: string; value?: number }>;
  };
}
interface EspnWnbaTeam { id?: string; injuries?: EspnWnbaInjury[]; }
interface EspnWnbaInjuryResponse { injuries?: EspnWnbaTeam[]; }

export function getActiveWnbaInjurySeason(now = new Date()): number {
  return now.getUTCMonth() < 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

function normalizedStatus(status?: string): string {
  return (status ?? "unknown").trim().toLowerCase();
}
function playerQuality(injury: EspnWnbaInjury): WnbaInjuryPlayer["playerQuality"] {
  const stat = injury.athlete?.statistics?.find((item) =>
    /points|minutes|player efficiency/i.test(item.name ?? "") &&
    Number.isFinite(item.value ?? Number(item.displayValue)),
  );
  const value = stat?.value ?? Number(stat?.displayValue);
  return stat && Number.isFinite(value) && value > 0
    ? { value, metric: stat.name ?? "provider-player-stat", source: "espn-injury-payload" }
    : null;
}
function emptyImpact(stale = false): WnbaTeamInjuryImpact {
  return {
    impactScore: 0, keyInjuries: [], players: [],
    evidence: {
      source: "espn", sourceSeason: getActiveWnbaInjurySeason(),
      capturedAt: new Date().toISOString(), stale,
      missing: ["injuryReport"],
    },
  };
}

export function computeWnbaTeamInjuryImpact(
  injuries: EspnWnbaInjury[],
  capturedAt = new Date().toISOString(),
): WnbaTeamInjuryImpact {
  let rawImpact = 0;
  const players: WnbaInjuryPlayer[] = [];
  const keyInjuries: string[] = [];
  for (const injury of injuries) {
    const status = normalizedStatus(injury.status);
    const multiplier = STATUS_MULTIPLIER[status];
    const position = injury.athlete?.position?.abbreviation ?? null;
    const quality = playerQuality(injury);
    const player: WnbaInjuryPlayer = {
      athleteId: injury.athlete?.id,
      name: injury.athlete?.displayName ?? "Unknown athlete",
      position, status: injury.status ?? "Unknown",
      comments: injury.comment ?? injury.details ?? null,
      expectedAvailabilityProbability: AVAILABILITY[status] ?? null,
      playerQuality: quality,
      expectedMinutesLost: null,
      role: "unknown", roleUncertainty: "unknown-lineup", minutesRestriction: "unknown",
    };
    players.push(player);
    if (multiplier === undefined) continue;
    const contribution = (POSITION_WEIGHT[position ?? ""] ?? 5) * multiplier;
    rawImpact += contribution;
    if (contribution >= 1.75 && injury.athlete?.displayName) {
      keyInjuries.push(`${injury.athlete.displayName} (${position ?? "?"}, ${injury.status})`);
    }
  }
  const missing = players.some((p) => !p.athleteId) ? ["athleteId for one or more reports"] : [];
  return {
    impactScore: -Math.min(MAX_PROB_SHIFT, rawImpact / MAX_RAW_IMPACT * MAX_PROB_SHIFT),
    keyInjuries: keyInjuries.slice(0, 5), players,
    evidence: { source: "espn", sourceSeason: getActiveWnbaInjurySeason(), capturedAt, stale: false, missing },
  };
}

async function fetchAllInjuries(): Promise<Map<string, WnbaTeamInjuryImpact>> {
  const resp = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/injuries", {
    headers: { "User-Agent": "TheBettingModel/1.0" }, signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`WNBA injuries: HTTP ${resp.status}`);
  const data = await resp.json() as EspnWnbaInjuryResponse;
  const capturedAt = new Date().toISOString();
  const result = new Map<string, WnbaTeamInjuryImpact>();
  for (const team of data.injuries ?? []) if (team.id) {
    result.set(team.id, computeWnbaTeamInjuryImpact(team.injuries ?? [], capturedAt));
  }
  logger.info({ teams: result.size }, "WNBA injuries: report loaded");
  return result;
}

export async function getWnbaTeamInjuryImpact(espnTeamId: string): Promise<WnbaTeamInjuryImpact> {
  if (!espnTeamId) return emptyImpact();
  const now = Date.now();
  if (!reportCache || now - reportCache.fetchedAt > TTL_MS) {
    try { reportCache = { data: await fetchAllInjuries(), fetchedAt: now }; }
    catch (err) {
      logger.warn({ err }, "WNBA injuries: fetch failed; using stale or empty data");
      if (!reportCache) reportCache = { data: new Map(), fetchedAt: now };
      else {
        const stale = new Map<string, WnbaTeamInjuryImpact>();
        for (const [id, item] of reportCache.data) stale.set(id, {
          ...item,
          evidence: item.evidence ? { ...item.evidence, stale: true } : undefined,
        });
        reportCache = { data: stale, fetchedAt: now };
      }
    }
  }
  return reportCache.data.get(espnTeamId) ?? emptyImpact(Boolean(reportCache));
}

/** Relative health adjustment only; it is not a betting-market probability. */
export function computeWnbaInjuryAdvantage(homeImpact: WnbaTeamInjuryImpact, awayImpact: WnbaTeamInjuryImpact): number {
  return Math.max(-MAX_PROB_SHIFT, Math.min(MAX_PROB_SHIFT, awayImpact.impactScore - homeImpact.impactScore));
}