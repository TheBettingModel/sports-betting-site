import { and, eq, inArray, sql } from "drizzle-orm";
import { db, gamesTable } from "@workspace/db";
import { fetchSportGamesByDate, type FetchedGame } from "./espn";
import { ACTIVE_PRODUCT_SPORTS } from "./sportScope";
import { V4_PROVIDER_KEYS } from "./v4FullSlate";
import type { TbmV4Sport } from "./v4Platform";

export type StoredFixture = {
  id: string; sport: string; homeTeamId: string | null; awayTeamId: string | null; startsAt: Date | null;
  homeTeamName?: string; awayTeamName?: string; gameDate?: string | Date; status?: string;
};
export type FixtureConflict = { gameId: string; reason: string };
export type FixtureSyncReport = {
  sport: string; status: "READY" | "NO_CURRENT_SLATE" | "BLOCKED";
  fixtures: number; written: number; conflicts: FixtureConflict[]; providerFailures: string[];
};
const toleranceMs = 90 * 60_000;
const dateET = (now: Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
}).format(now);
const modelSport = (sport: string) => (sport === "NCAAB" ? "NCAAMB" : sport.toUpperCase()) as TbmV4Sport;

/** Same provider sources, physical IDs, teams and dates as the working schedule.
 * Raw historical aliases are not rewritten or used to create a second fixture. */
export function planSharedAnalyticsFixtures(
  incoming: readonly FetchedGame[], existing: readonly StoredFixture[], now: Date, horizonEnd: Date,
) {
  const grouped = new Map<string, FetchedGame[]>();
  const conflicts: FixtureConflict[] = [];
  for (const game of incoming) {
    const kickoff = new Date(game.commenceTimeISO);
    if (game.status !== "upcoming" || kickoff <= now || kickoff >= horizonEnd) continue;
    if (!(ACTIVE_PRODUCT_SPORTS as readonly string[]).includes(game.sport)
      || !Number.isFinite(kickoff.getTime()) || !game.homeTeamId || !game.awayTeamId
      || game.homeTeamId === game.awayTeamId || !game.homeTeamName || !game.awayTeamName
      || !new RegExp(`^${game.sport}(?:_[A-Za-z]+)?-[0-9]+$`).test(game.espnId)
      || dateET(kickoff) !== game.gameDate) {
      conflicts.push({ gameId: game.espnId, reason: "INVALID_PROVIDER_FIXTURE" }); continue;
    }
    grouped.set(game.espnId, [...(grouped.get(game.espnId) ?? []), game]);
  }
  const fixtures: FetchedGame[] = [];
  for (const [id, versions] of grouped) {
    const candidate = versions[0]!;
    const sameFixture = (game: FetchedGame) => game.homeTeamId === candidate.homeTeamId
      && game.awayTeamId === candidate.awayTeamId
      && new Date(game.commenceTimeISO).getTime() === new Date(candidate.commenceTimeISO).getTime();
    const native = id.slice(id.lastIndexOf("-") + 1);
    const aliases = existing.filter(row => row.id === id || row.id === native && row.sport === candidate.sport);
    if (!versions.every(sameFixture)) {
      conflicts.push({ gameId: id, reason: "CONFLICTING_PROVIDER_DUPLICATES" }); continue;
    }
    if (aliases.some(row => row.id !== id)) {
      conflicts.push({ gameId: id, reason: "EXISTING_NATIVE_ALIAS_REQUIRES_VERIFIED_RESOLUTION" }); continue;
    }
    const sameName = (a: string | undefined, b: string) => Boolean(a?.trim())
      && a!.trim().toLowerCase() === b.trim().toLowerCase();
    const compatible = (row: StoredFixture) => {
      const home = row.homeTeamId ? row.homeTeamId === candidate.homeTeamId : sameName(row.homeTeamName, candidate.homeTeamName);
      const away = row.awayTeamId ? row.awayTeamId === candidate.awayTeamId : sameName(row.awayTeamName, candidate.awayTeamName);
      const day = row.gameDate instanceof Date ? row.gameDate.toISOString().slice(0, 10) : row.gameDate?.slice(0, 10);
      const kickoff = row.startsAt ? Number.isFinite(row.startsAt.getTime())
        && Math.abs(row.startsAt.getTime() - new Date(candidate.commenceTimeISO).getTime()) <= toleranceMs
        : day === candidate.gameDate;
      return row.sport === candidate.sport && row.status !== "final" && row.status !== "live" && home && away && kickoff;
    };
    if (aliases.some(row => !compatible(row))) {
      conflicts.push({ gameId: id, reason: "EXISTING_ORDERED_TEAM_OR_KICKOFF_CONFLICT" }); continue;
    }
    fixtures.push(candidate);
  }
  return { fixtures, conflicts };
}

/** Only mutable fixture metadata is synchronized; model columns are untouched.
 * The conflict update condition protects against concurrent metadata changes. */
export async function persistSharedAnalyticsFixtures(fixtures: readonly FetchedGame[]): Promise<number> {
  let written = 0;
  for (const game of fixtures) {
    const rows = await db.insert(gamesTable).values({
      id: game.espnId, sport: game.sport, league: game.league ?? null,
      homeTeamId: game.homeTeamId!, awayTeamId: game.awayTeamId!,
      homeTeamName: game.homeTeamName, awayTeamName: game.awayTeamName,
      homeTeamAbbr: game.homeTeamAbbr, awayTeamAbbr: game.awayTeamAbbr,
      homeTeamLogo: game.homeTeamLogo ?? null, awayTeamLogo: game.awayTeamLogo ?? null,
      homeTeamRecord: game.homeTeamRecord, awayTeamRecord: game.awayTeamRecord,
      gameTime: game.gameTime, gameDate: game.gameDate, startsAt: new Date(game.commenceTimeISO), status: game.status,
    }).onConflictDoUpdate({
      target: gamesTable.id,
      set: { league: sql`excluded.league`, homeTeamId: sql`excluded.home_team_id`, awayTeamId: sql`excluded.away_team_id`,
        homeTeamName: sql`excluded.home_team_name`,
        awayTeamName: sql`excluded.away_team_name`, homeTeamAbbr: sql`excluded.home_team_abbr`,
        awayTeamAbbr: sql`excluded.away_team_abbr`, homeTeamLogo: sql`excluded.home_team_logo`,
        awayTeamLogo: sql`excluded.away_team_logo`, homeTeamRecord: sql`excluded.home_team_record`,
        awayTeamRecord: sql`excluded.away_team_record`, gameTime: sql`excluded.game_time`,
        gameDate: sql`excluded.game_date`, startsAt: sql`excluded.starts_at`, status: sql`excluded.status` },
      setWhere: and(eq(gamesTable.sport, game.sport),
        sql`(${gamesTable.homeTeamId} = excluded.home_team_id OR (${gamesTable.homeTeamId} IS NULL
          AND lower(trim(${gamesTable.homeTeamName})) = lower(trim(excluded.home_team_name))))`,
        sql`(${gamesTable.awayTeamId} = excluded.away_team_id OR (${gamesTable.awayTeamId} IS NULL
          AND lower(trim(${gamesTable.awayTeamName})) = lower(trim(excluded.away_team_name))))`,
        sql`(abs(extract(epoch from (${gamesTable.startsAt} - excluded.starts_at))) <= 5400
          OR (${gamesTable.startsAt} IS NULL AND ${gamesTable.gameDate} = excluded.game_date))`,
        eq(gamesTable.status, "upcoming"),
        sql`excluded.starts_at > now()`),
    }).returning({ id: gamesTable.id });
    written += rows.length;
  }
  return written;
}

/** Publication-independent, forward-only association for every supported sport.
 * A bounded set of daily requests per existing provider source; never infer a
 * season or manufacture sportsbook observations. */
export async function synchronizeSharedAnalyticsFixtures(
  now: Date, horizonDays: number,
  dependencies: {
    fetch?: typeof fetchSportGamesByDate;
    load?: (ids: string[]) => Promise<StoredFixture[]>;
    persist?: typeof persistSharedAnalyticsFixtures;
  } = {},
): Promise<FixtureSyncReport[]> {
  const end = new Date(now.getTime() + horizonDays * 86400_000);
  const dates: string[] = [];
  const calendarStart = new Date(`${dateET(now)}T12:00:00Z`);
  for (let day = 0; day <= horizonDays; day++) {
    const date = new Date(calendarStart.getTime() + day * 86400_000).toISOString().slice(0, 10);
    dates.push(date.replaceAll("-", ""));
  }
  const fetch = dependencies.fetch ?? fetchSportGamesByDate;
  const load = dependencies.load ?? (async (ids) => ids.length ? db.select({
    id: gamesTable.id, sport: gamesTable.sport, homeTeamId: gamesTable.homeTeamId,
    awayTeamId: gamesTable.awayTeamId, startsAt: gamesTable.startsAt,
    homeTeamName: gamesTable.homeTeamName, awayTeamName: gamesTable.awayTeamName, gameDate: gamesTable.gameDate, status: gamesTable.status,
  }).from(gamesTable).where(inArray(gamesTable.id, ids)) : []);
  const persist = dependencies.persist ?? persistSharedAnalyticsFixtures;
  const reports: FixtureSyncReport[] = [];
  // ESPN's production scoreboards reject date ranges with HTTP 400. Reuse the
  // working schedule's single-date contract instead of silently losing slates.
  const requests = ACTIVE_PRODUCT_SPORTS.flatMap(sport => V4_PROVIDER_KEYS[modelSport(sport)]
    .flatMap(key => dates.map(date => ({ key, date }))));
  const fetched = new Map<string, FetchedGame[]>(), errors = new Map<string, string[]>();
  let next = 0;
  // At most three bounded provider requests, including Soccer leagues.
  await Promise.all(Array.from({ length: Math.min(3, requests.length) }, async () => {
    while (next < requests.length) {
      const { key, date } = requests[next++]!;
      try {
        const rows = await fetch(key, date, { throwOnError: true });
        fetched.set(key, [...fetched.get(key) ?? [], ...rows]);
      }
      catch (error) { errors.set(key, [...errors.get(key) ?? [],
        `${key}/${date}: ${error instanceof Error ? error.message : String(error)}`]); }
    }
  }));
  for (const sport of ACTIVE_PRODUCT_SPORTS) {
    const incoming: FetchedGame[] = [], providerFailures: string[] = [];
    for (const key of V4_PROVIDER_KEYS[modelSport(sport)]) {
      incoming.push(...fetched.get(key) ?? []);
      if (errors.has(key)) providerFailures.push(...errors.get(key)!);
    }
    const ids = [...new Set(incoming.flatMap(game => [game.espnId, game.espnId.slice(game.espnId.lastIndexOf("-") + 1)]))];
    const plan = planSharedAnalyticsFixtures(incoming, await load(ids), now, end);
    const written = await persist(plan.fixtures);
    if (written < plan.fixtures.length) plan.conflicts.push({ gameId: sport, reason: "CONCURRENT_FIXTURE_IDENTITY_CONFLICT" });
    reports.push({ sport, status: providerFailures.length || plan.conflicts.length ? "BLOCKED"
      : plan.fixtures.length ? "READY" : "NO_CURRENT_SLATE",
      fixtures: plan.fixtures.length, written, conflicts: plan.conflicts, providerFailures });
  }
  return reports;
}