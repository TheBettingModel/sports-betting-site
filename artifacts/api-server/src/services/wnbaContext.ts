/**
 * Immutable WNBA pregame evidence assembler. Team coordinates/time zones below
 * are a maintained static arena-location map (home metro centroids, not GPS
 * tracking); distance is great-circle miles and timezone shift uses standard
 * UTC offsets, so it is deliberately an approximation around DST transitions.
 */
import { getWnbaTeamStats, type WnbaTeamStats } from "./teamStats";
import { getWnbaTeamInjuryImpact, type WnbaTeamInjuryImpact } from "./wnbaInjuries";

export interface WnbaLocation { city: string; latitude: number; longitude: number; timeZone: string; standardUtcOffset: number; }
export const WNBA_TEAM_LOCATIONS: Record<string, WnbaLocation> = {
  "20": { city: "Atlanta, GA", latitude: 33.749, longitude: -84.388, timeZone: "America/New_York", standardUtcOffset: -5 },
  "19": { city: "Chicago, IL", latitude: 41.878, longitude: -87.630, timeZone: "America/Chicago", standardUtcOffset: -6 },
  "18": { city: "Uncasville, CT", latitude: 41.434, longitude: -72.110, timeZone: "America/New_York", standardUtcOffset: -5 },
  "3": { city: "Arlington, TX", latitude: 32.705, longitude: -97.122, timeZone: "America/Chicago", standardUtcOffset: -6 },
  "129689": { city: "San Francisco, CA", latitude: 37.774, longitude: -122.419, timeZone: "America/Los_Angeles", standardUtcOffset: -8 },
  "5": { city: "Indianapolis, IN", latitude: 39.768, longitude: -86.158, timeZone: "America/Indiana/Indianapolis", standardUtcOffset: -5 },
  "17": { city: "Las Vegas, NV", latitude: 36.169, longitude: -115.140, timeZone: "America/Los_Angeles", standardUtcOffset: -8 },
  "6": { city: "Los Angeles, CA", latitude: 34.043, longitude: -118.267, timeZone: "America/Los_Angeles", standardUtcOffset: -8 },
  "8": { city: "Minneapolis, MN", latitude: 44.978, longitude: -93.265, timeZone: "America/Chicago", standardUtcOffset: -6 },
  "9": { city: "Brooklyn, NY", latitude: 40.682, longitude: -73.975, timeZone: "America/New_York", standardUtcOffset: -5 },
  "11": { city: "Phoenix, AZ", latitude: 33.445, longitude: -112.071, timeZone: "America/Phoenix", standardUtcOffset: -7 },
  "132052": { city: "Portland, OR", latitude: 45.531, longitude: -122.667, timeZone: "America/Los_Angeles", standardUtcOffset: -8 },
  "14": { city: "Seattle, WA", latitude: 47.622, longitude: -122.354, timeZone: "America/Los_Angeles", standardUtcOffset: -8 },
  "131935": { city: "Toronto, ON", latitude: 43.643, longitude: -79.379, timeZone: "America/Toronto", standardUtcOffset: -5 },
  "16": { city: "Washington, DC", latitude: 38.898, longitude: -77.021, timeZone: "America/New_York", standardUtcOffset: -5 },
};

interface ScheduleEvent {
  date: string;
  competitions?: Array<{ status?: { type?: { completed?: boolean } }; competitors?: Array<{ homeAway?: "home" | "away"; team?: { id?: string; displayName?: string } }> }>;
}
export interface WnbaScheduleContext {
  restDays: number | null; backToBack: boolean | null; gamesLast3Days: number | null; gamesLast5Days: number | null;
  roadTripLength: number | null; priorVenue: string | null; priorOpponent: string | null;
  travelMiles: number | null; timezoneShiftHours: number | null;
  evidence: { source: "espn-schedule+static-team-location-map"; sourceSeason: number; capturedAt: string; stale: false; missing: string[] };
}
const season = (date: Date) => date.getUTCMonth() < 3 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();
const days = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);
function miles(a: WnbaLocation, b: WnbaLocation): number {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians, dLon = (b.longitude - a.longitude) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return Math.round(3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export async function getWnbaScheduleContext(teamId: string, opponentId: string, isHome: boolean, gameTime: string | Date): Promise<WnbaScheduleContext> {
  const target = new Date(gameTime); const capturedAt = new Date().toISOString(); const sourceSeason = season(target);
  const missing: string[] = [];
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${teamId}/schedule?season=${sourceSeason}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as { events?: ScheduleEvent[] };
    const prior = (payload.events ?? []).filter((event) => event.competitions?.[0]?.status?.type?.completed && new Date(event.date) < target)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const parsed = prior.map((event) => {
      const competitors = event.competitions?.[0]?.competitors ?? [];
      const mine = competitors.find((item) => item.team?.id === teamId);
      const other = competitors.find((item) => item.team?.id !== teamId);
      return { date: new Date(event.date), away: mine?.homeAway === "away", opponentId: other?.team?.id, opponent: other?.team?.displayName ?? null };
    });
    const last = parsed[0];
    if (!last) missing.push("priorCompletedGame");
    const targetVenue = isHome ? WNBA_TEAM_LOCATIONS[teamId] : WNBA_TEAM_LOCATIONS[opponentId];
    const priorVenue = last ? WNBA_TEAM_LOCATIONS[last.away ? last.opponentId ?? "" : teamId] : undefined;
    if (!targetVenue || !priorVenue) missing.push("staticLocationForTravel");
    let roadTripLength: number | null = null;
    if (last) { roadTripLength = 0; for (const event of parsed) { if (!event.away) break; roadTripLength++; } }
    return {
      restDays: last ? Math.max(0, days(target, last.date) - 1) : null,
      backToBack: last ? days(target, last.date) <= 1 : null,
      gamesLast3Days: parsed.filter((event) => days(target, event.date) <= 3).length,
      gamesLast5Days: parsed.filter((event) => days(target, event.date) <= 5).length,
      roadTripLength, priorVenue: priorVenue?.city ?? null, priorOpponent: last?.opponent ?? null,
      travelMiles: targetVenue && priorVenue ? miles(priorVenue, targetVenue) : null,
      timezoneShiftHours: targetVenue && priorVenue ? targetVenue.standardUtcOffset - priorVenue.standardUtcOffset : null,
      evidence: { source: "espn-schedule+static-team-location-map", sourceSeason, capturedAt, stale: false, missing },
    };
  } catch {
    return { restDays: null, backToBack: null, gamesLast3Days: null, gamesLast5Days: null, roadTripLength: null, priorVenue: null, priorOpponent: null, travelMiles: null, timezoneShiftHours: null, evidence: { source: "espn-schedule+static-team-location-map", sourceSeason, capturedAt, stale: false, missing: ["schedule"] } };
  }
}

export interface WnbaGameContext {
  capturedAt: string; sourceSeason: number; home: { stats?: WnbaTeamStats; availability: WnbaTeamInjuryImpact; schedule: WnbaScheduleContext };
  away: { stats?: WnbaTeamStats; availability: WnbaTeamInjuryImpact; schedule: WnbaScheduleContext };
  matchup: Record<"pace" | "perimeter" | "reboundingInteriorProxy" | "turnover" | "freeThrow", { home: number | null; away: number | null; missing: boolean }>;
  evidence: { immutable: true; missing: string[] };
}
const hasStat = (stats: WnbaTeamStats | undefined, missingKeys: string[]): boolean =>
  Boolean(stats) && missingKeys.every((key) => !stats?.evidence?.missing.includes(key));

const pair = (
  homeStats: WnbaTeamStats | undefined,
  awayStats: WnbaTeamStats | undefined,
  value: (stats: WnbaTeamStats) => number,
  missingKeys: string[],
) => {
  const home = hasStat(homeStats, missingKeys) ? value(homeStats!) : null;
  const away = hasStat(awayStats, missingKeys) ? value(awayStats!) : null;
  return { home, away, missing: home === null || away === null };
};

/** Snapshot-ready evidence only. It intentionally contains no odds or market-derived pricing. */
export async function getWnbaGameContext(input: { homeTeamId: string; awayTeamId: string; gameTime: string | Date }): Promise<WnbaGameContext> {
  const capturedAt = new Date().toISOString(); const sourceSeason = season(new Date(input.gameTime));
  const [homeStats, awayStats, homeAvailability, awayAvailability, homeSchedule, awaySchedule] = await Promise.all([
    getWnbaTeamStats(input.homeTeamId, input.gameTime), getWnbaTeamStats(input.awayTeamId, input.gameTime), getWnbaTeamInjuryImpact(input.homeTeamId), getWnbaTeamInjuryImpact(input.awayTeamId),
    getWnbaScheduleContext(input.homeTeamId, input.awayTeamId, true, input.gameTime), getWnbaScheduleContext(input.awayTeamId, input.homeTeamId, false, input.gameTime),
  ]);
  const matchup = {
    pace: pair(homeStats, awayStats, (stats) => stats.paceApprox, ["fieldGoalAttempts"]),
    perimeter: pair(homeStats, awayStats, (stats) => stats.threePointRate, ["avgThreePointFieldGoalsAttempted", "fieldGoalAttempts"]),
    reboundingInteriorProxy: pair(homeStats, awayStats, (stats) => stats.orebPg + stats.drebPg + stats.bpg, ["avgOffensiveRebounds", "avgDefensiveRebounds", "avgBlocks"]),
    turnover: pair(homeStats, awayStats, (stats) => stats.turnoverPercent, ["avgTurnovers", "fieldGoalAttempts"]),
    freeThrow: pair(homeStats, awayStats, (stats) => stats.ftRate, ["avgFreeThrowsAttempted", "fieldGoalAttempts"]),
  };
  const missing = Object.entries(matchup).filter(([, value]) => value.missing).map(([key]) => `matchup.${key}`);
  return { capturedAt, sourceSeason, home: { stats: homeStats, availability: homeAvailability, schedule: homeSchedule }, away: { stats: awayStats, availability: awayAvailability, schedule: awaySchedule }, matchup, evidence: { immutable: true, missing } };
}