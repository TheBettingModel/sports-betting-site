import { Router, type IRouter } from "express";
import { eq, and, desc, inArray, notInArray, sql } from "drizzle-orm";
import { db, gamesTable, modelWeightsTable, publishedPicksTable } from "@workspace/db";
import { fetchAllSports } from "../services/espn";
import { computeProjection } from "../services/model";
import { getOddsForGame, getBestLine, displayBookName } from "../services/oddsApi";
import { getProbablePitchers, computePitcherAdvantage } from "../services/mlbPitchers";
import { getBullpenMatchup, computeBullpenAdvantage } from "../services/mlbBullpen";
import { getLineupMatchup, computeLineupAdvantage, enrichLineupMatchup } from "../services/mlbLineups";
import { getParkFactor } from "../services/mlbParkFactors";
import { getVenueWeather, computeWeatherEffect } from "../services/weatherService";
import { getGoalieMatchup, computeGoalieAdvantage } from "../services/nhlGoalies";
import { getTeamInjuryImpact, computeInjuryAdvantage } from "../services/nflInjuries";
import { getWnbaTeamInjuryImpact, computeWnbaInjuryAdvantage } from "../services/wnbaInjuries";
import type { GoalieMatchup } from "../services/nhlGoalies";
import type { TeamInjuryImpact } from "../services/nflInjuries";
import type { WnbaTeamInjuryImpact } from "../services/wnbaInjuries";
import { getWnbaTeamStats, getSoccerTeamStats, getDbTeamStats } from "../services/teamStats";
import { runLearning } from "../services/learning";
import { processGameSnapshot } from "../services/snapshot";
import { runGrading, syncGameResults, recoverStaleGames } from "../services/grading-runner";
import { logger } from "../lib/logger";
import { resolveSubscriberStatus, rejectInvalidToken } from "../middleware/requireSubscriber";

type AnyGame = Record<string, unknown>;

/** Number of full picks shown to non-subscribers */
const FREE_PICKS = 2;

/**
 * Returns the game with premium model fields zeroed out and `isLocked: true`.
 * Fields are kept as valid numbers (not null) so clients don't crash on
 * numeric rendering — they should hide/replace locked rows using `isLocked`.
 */
function lockGame(game: AnyGame): AnyGame {
  return {
    ...game,
    // Zero out model projection fields
    homeWinPct: 50,
    confidence: "Low",
    projectedSpread: 0,
    projectedTotal: 0,
    valueRating: "Neutral",
    modelScore: 0,
    edge: 0,
    vegasSpread: 0,
    vegasTotal: 0,
    vegasHomeOdds: 0,
    vegasAwayOdds: 0,
    // Signal to the client that this game is gated
    isLocked: true,
  };
}

const router: IRouter = Router();

/** In-memory cache: when we last successfully refreshed */
let lastRefreshedAt: Date | null = null;
const STALE_MS = 60 * 60 * 1000; // 1 hour

function isStale(): boolean {
  if (!lastRefreshedAt) return true;
  return Date.now() - lastRefreshedAt.getTime() > STALE_MS;
}

/** Convert American moneyline to raw implied probability (vig-inclusive). */
function impliedProbFromOdds(american: number): number {
  return american < 0
    ? Math.abs(american) / (Math.abs(american) + 100)
    : 100 / (american + 100);
}

export async function refreshAll(): Promise<{
  gamesUpdated: number;
  sportsRefreshed: string[];
  picksGraded: number;
}> {
  // Also fetch existing game rows so we can preserve opening odds and detect line movement
  const todayDateStr = new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD

  const [fetchedGames, weights, existingRows] = await Promise.all([
    fetchAllSports(),
    db.select().from(modelWeightsTable),
    db.select({
      id: gamesTable.id,
      openingHomeOdds: gamesTable.openingHomeOdds,
      openingAwayOdds: gamesTable.openingAwayOdds,
    }).from(gamesTable).where(eq(gamesTable.gameDate, todayDateStr)),
  ]);

  const existingByGameId = new Map(existingRows.map((r) => [r.id, r]));
  const weightsBySport   = Object.fromEntries(weights.map((w) => [w.sport, w]));

  // ── Phase 3 pre-fetch: all external signals in parallel before the game loop ─
  // Running these inside the per-game loop would serialize 15+ HTTP calls
  // (worst case 15 × 8s timeout ≈ 2 minutes). Pre-batching bounds latency to
  // the slowest single request (~1s for Open-Meteo, ~2s for NHL).
  const weatherMap    = new Map<string, Awaited<ReturnType<typeof getVenueWeather>>>();
  const goalieMap     = new Map<string, Awaited<ReturnType<typeof getGoalieMatchup>>>();
  const injuryMap     = new Map<string, Awaited<ReturnType<typeof getTeamInjuryImpact>>>();
  const wnbaInjuryMap = new Map<string, WnbaTeamInjuryImpact>(); // keyed by ESPN team ID
  const bullpenMap    = new Map<string, Awaited<ReturnType<typeof getBullpenMatchup>>>();
  const lineupMap     = new Map<string, Awaited<ReturnType<typeof getLineupMatchup>>>();

  await Promise.all([
    // Weather — one call per outdoor MLB/NFL venue (dome stadiums resolve instantly)
    ...fetchedGames
      .filter((g) => g.sport === "MLB" || g.sport === "NFL")
      .map(async (g) => {
        const w = await getVenueWeather(
          g.sport, g.homeTeamAbbr, g.gameDate, g.gameTime ?? "7:00 PM ET",
        );
        weatherMap.set(g.espnId, w);
      }),
    // NHL goalies — one call per game (both teams fetched inside)
    ...fetchedGames
      .filter((g) => g.sport === "NHL")
      .map(async (g) => {
        const m = await getGoalieMatchup(g.homeTeamAbbr, g.awayTeamAbbr, g.gameDate);
        goalieMap.set(g.espnId, m);
      }),
    // NFL injuries — one report covers all 32 teams; cache dedupes repeat lookups
    ...fetchedGames
      .filter((g) => g.sport === "NFL")
      .flatMap((g) => [g.homeTeamAbbr, g.awayTeamAbbr])
      .filter((abbr, i, arr) => arr.indexOf(abbr) === i) // unique
      .map(async (abbr) => {
        const impact = await getTeamInjuryImpact(abbr);
        injuryMap.set(abbr, impact);
      }),
    // WNBA injuries — one ESPN report covers all 12 teams; keyed by ESPN team ID.
    // Pre-batch so all WNBA games share a single fetch (3-hour TTL in the service).
    (async () => {
      const wnbaTeamIds = fetchedGames
        .filter((g) => g.sport === "WNBA")
        .flatMap((g) => [g.homeTeamId, g.awayTeamId])
        .filter((id): id is string => !!id)
        .filter((id, i, arr) => arr.indexOf(id) === i); // unique
      for (const teamId of wnbaTeamIds) {
        const impact = await getWnbaTeamInjuryImpact(teamId);
        wnbaInjuryMap.set(teamId, impact);
      }
    })(),
    // MLB bullpen fatigue — one batch call fetches all teams; single cache per day
    (async () => {
      const mlbGames = fetchedGames.filter((g) => g.sport === "MLB");
      if (mlbGames.length === 0) return;
      // All MLB games share one bullpen cache call — pass first game to seed the cache
      const first = mlbGames[0]!;
      await getBullpenMatchup(first.homeTeamAbbr, first.awayTeamAbbr, todayDateStr);
      // Now populate per-game (all served from cache after first call)
      await Promise.all(mlbGames.map(async (g) => {
        const bm = await getBullpenMatchup(g.homeTeamAbbr, g.awayTeamAbbr, g.gameDate);
        bullpenMap.set(g.espnId, bm);
      }));
    })(),
    // MLB lineups — one batch call for today; 30-min cache.
    // Seed the cache with the first game, then all subsequent lookups hit cache.
    (async () => {
      const mlbGames = fetchedGames.filter((g) => g.sport === "MLB");
      if (mlbGames.length === 0) return;
      // First call populates the shared in-memory cache for todayDateStr
      const first = mlbGames[0]!;
      await getLineupMatchup(first.homeTeamAbbr, first.awayTeamAbbr, first.gameDate);
      // Remaining calls are served from cache (no additional HTTP requests)
      for (const g of mlbGames) {
        const lm = await getLineupMatchup(g.homeTeamAbbr, g.awayTeamAbbr, g.gameDate);
        lineupMap.set(g.espnId, lm);
      }
    })(),
  ]);

  let upserted = 0;
  const sports = new Set<string>();

  for (const game of fetchedGames) {
    const w = weightsBySport[game.sport] ?? null;

    const DB_SPORTS = new Set(["MLB", "NFL", "NHL", "NCAAF", "NCAAB"]);

    // Fetch advanced team analytics (all cached after first call per run).
    // WNBA/NBA: ESPN stats (4h TTL). Soccer: DB goals (1h TTL).
    // MLB/NFL/NHL/NCAAF/NCAAB: DB runs/points (1h TTL).
    const [homeTeamStats, awayTeamStats, homeSoccerStats, awaySoccerStats, homeDbStats, awayDbStats] =
      await Promise.all([
        (game.sport === "WNBA" || game.sport === "NBA")
          ? getWnbaTeamStats(game.homeTeamId ?? "")
          : Promise.resolve(undefined),
        (game.sport === "WNBA" || game.sport === "NBA")
          ? getWnbaTeamStats(game.awayTeamId ?? "")
          : Promise.resolve(undefined),
        game.sport === "Soccer"
          ? getSoccerTeamStats(game.homeTeamId ?? "")
          : Promise.resolve(undefined),
        game.sport === "Soccer"
          ? getSoccerTeamStats(game.awayTeamId ?? "")
          : Promise.resolve(undefined),
        DB_SPORTS.has(game.sport)
          ? getDbTeamStats(game.homeTeamId ?? "", game.sport)
          : Promise.resolve(undefined),
        DB_SPORTS.has(game.sport)
          ? getDbTeamStats(game.awayTeamId ?? "", game.sport)
          : Promise.resolve(undefined),
      ]);

    // ── Phase 2a: multi-book odds (30-min cache) ──────────────────────────────
    // Replaces ESPN's single-book moneyline with a consensus price and adds
    // Pinnacle's line for the sharp-money divergence signal.
    const gameOdds = await getOddsForGame(
      game.sport,
      game.league ?? null,
      game.homeTeamName,
      game.awayTeamName,
      game.commenceTimeISO,
    );

    // ── Phase 2b: MLB probable starters (4-hour cache) ────────────────────────
    const starters = game.sport === "MLB"
      ? await getProbablePitchers(game.homeTeamAbbr, game.awayTeamAbbr, game.gameDate)
      : { home: null, away: null };
    const pitcherAdvantage = game.sport === "MLB"
      ? computePitcherAdvantage(starters)
      : undefined;

    // ── Phase 2c: line movement ───────────────────────────────────────────────
    const existingRow = existingByGameId.get(game.espnId);
    const currentHomeOdds = gameOdds?.consensusHomeOdds ?? game.vegasHomeOdds ?? null;
    const currentAwayOdds = gameOdds?.consensusAwayOdds ?? game.vegasAwayOdds ?? null;
    // Opening odds: preserved from first observation; falls back to current on first insert.
    const openingHomeOdds = existingRow?.openingHomeOdds ?? currentHomeOdds;
    const openingAwayOdds = existingRow?.openingAwayOdds ?? currentAwayOdds;
    // Did the home team's implied probability increase since opening?
    const lineMovedTowardHome: boolean | undefined =
      existingRow?.openingHomeOdds != null && currentHomeOdds != null
        ? impliedProbFromOdds(currentHomeOdds) > impliedProbFromOdds(existingRow.openingHomeOdds)
        : undefined;

    // ── Phase 3: look up pre-fetched signals (already resolved above) ─────────
    const venueWeather   = weatherMap.get(game.espnId) ?? null;
    const goalieMatchup  = goalieMap.get(game.espnId) ?? ({ home: null, away: null } as GoalieMatchup);
    const homeInjury     = injuryMap.get(game.homeTeamAbbr) ?? ({ impactScore: 0, keyInjuries: [] } as TeamInjuryImpact);
    const awayInjury     = injuryMap.get(game.awayTeamAbbr) ?? ({ impactScore: 0, keyInjuries: [] } as TeamInjuryImpact);
    const homeWnbaInjury = wnbaInjuryMap.get(game.homeTeamId ?? "") ?? ({ impactScore: 0, keyInjuries: [] } as WnbaTeamInjuryImpact);
    const awayWnbaInjury = wnbaInjuryMap.get(game.awayTeamId ?? "") ?? ({ impactScore: 0, keyInjuries: [] } as WnbaTeamInjuryImpact);
    const bullpenMatchup = bullpenMap.get(game.espnId) ?? { home: null, away: null };
    const lineupMatchup  = lineupMap.get(game.espnId) ?? { home: { confirmed: false, batterCount: 0 }, away: { confirmed: false, batterCount: 0 } };

    const weatherEffect   = venueWeather && !venueWeather.isDome
      ? computeWeatherEffect(venueWeather, game.sport)
      : null;
    const goalieAdvantage = game.sport === "NHL"
      ? computeGoalieAdvantage(goalieMatchup)
      : undefined;
    const injuryAdvantage = game.sport === "NFL"
      ? computeInjuryAdvantage(homeInjury, awayInjury)
      : game.sport === "WNBA"
      ? computeWnbaInjuryAdvantage(homeWnbaInjury, awayWnbaInjury)
      : undefined;
    const bullpenEffect = game.sport === "MLB"
      ? computeBullpenAdvantage(bullpenMatchup)
      : null;
    // Enrich lineup with career batter–pitcher matchup data (cached 30 min)
    const enrichedLineup = game.sport === "MLB"
      ? await enrichLineupMatchup(lineupMatchup, starters)
      : lineupMatchup;
    const lineupAdvantage = game.sport === "MLB"
      ? computeLineupAdvantage(
          enrichedLineup.home,
          enrichedLineup.away,
          starters.home?.pitchHand ?? null, // what AWAY batters face
          starters.away?.pitchHand ?? null, // what HOME batters face
        )
      : undefined;
    const parkFactor = game.sport === "MLB"
      ? getParkFactor(game.homeTeamAbbr)
      : undefined;

    const proj = computeProjection(
      game.espnId,
      game.sport,
      game.homeTeamRecord,
      game.awayTeamRecord,
      w,
      {
        homeHomeRecord:    game.homeHomeRecord,
        homeRoadRecord:    game.homeRoadRecord,
        awayHomeRecord:    game.awayHomeRecord,
        awayRoadRecord:    game.awayRoadRecord,
        // Consensus odds preferred over ESPN single book
        realVegasHomeOdds: gameOdds?.consensusHomeOdds ?? game.vegasHomeOdds,
        realVegasAwayOdds: gameOdds?.consensusAwayOdds ?? game.vegasAwayOdds,
        realVegasDrawOdds: gameOdds?.consensusDrawOdds ?? game.vegasDrawOdds,
        realVegasOverUnder: gameOdds?.total ?? game.vegasOverUnder,
        // Phase 2 signals
        pinnacleHomeOdds:  gameOdds?.pinnacleHomeOdds,
        pinnacleAwayOdds:  gameOdds?.pinnacleAwayOdds,
        consensusHomeOdds: gameOdds?.consensusHomeOdds,
        consensusAwayOdds: gameOdds?.consensusAwayOdds,
        lineMovedTowardHome,
        pitcherAdvantage,
        // Phase 3 signals
        goalieAdvantage,
        injuryAdvantage,
        bullpenAdvantage:        bullpenEffect?.probabilityAdj,
        bullpenTotalAdjustment:  bullpenEffect?.totalAdj,
        lineupAdvantage,
        parkFactor,
        weatherTotalAdjustment: (weatherEffect?.totalAdjustment ?? 0) + (bullpenEffect?.totalAdj ?? 0),
        weatherWindMph:   venueWeather?.windSpeedMph,
        weatherPrecipMm:  venueWeather?.precipitationMm,
        homeTeamStats,
        awayTeamStats,
        homeSoccerStats,
        awaySoccerStats,
        homeDbStats,
        awayDbStats,
      },
    );

    // ── Phase 2d: best available line ──────────────────────────────────────────
    const pickIsHome = proj.edge >= 0;
    const bestLine = getBestLine(gameOdds ?? null, pickIsHome);

    await db
      .insert(gamesTable)
      .values({
        id: game.espnId,
        sport: game.sport,
        league: game.league ?? null,
        homeTeamId: game.homeTeamId ?? null,
        awayTeamId: game.awayTeamId ?? null,
        homeTeamLogo: game.homeTeamLogo ?? null,
        awayTeamLogo: game.awayTeamLogo ?? null,
        homeTeamAbbr: game.homeTeamAbbr,
        homeTeamName: game.homeTeamName,
        homeTeamRecord: game.homeTeamRecord,
        awayTeamAbbr: game.awayTeamAbbr,
        awayTeamName: game.awayTeamName,
        awayTeamRecord: game.awayTeamRecord,
        gameTime: game.gameTime,
        gameDate: game.gameDate,
        status: game.status,
        homeScore: game.homeScore ?? null,
        awayScore: game.awayScore ?? null,
        ...proj,
        // Phase 2: set once — opening odds preserved on conflict (not in set block)
        openingHomeOdds: openingHomeOdds ?? null,
        openingAwayOdds: openingAwayOdds ?? null,
        // Phase 2: always refreshed
        homeStarterName:     starters.home?.name ?? null,
        homeStarterEra:      starters.home?.seasonEra ?? null,
        homeStarterWhip:     starters.home?.seasonWhip ?? null,
        homeStarterRecentEra: starters.home?.recentEra ?? null,
        awayStarterName:     starters.away?.name ?? null,
        awayStarterEra:      starters.away?.seasonEra ?? null,
        awayStarterWhip:     starters.away?.seasonWhip ?? null,
        awayStarterRecentEra: starters.away?.recentEra ?? null,
        bestLineBook: bestLine ? displayBookName(bestLine.book) : null,
        bestLineOdds: bestLine?.odds ?? null,
        // Phase 3: weather (null for domes or unsupported sports)
        weatherWindMph:  venueWeather?.isDome ? null : (venueWeather?.windSpeedMph ?? null),
        weatherPrecipMm: venueWeather?.isDome ? null : (venueWeather?.precipitationMm ?? null),
        weatherTotalAdj: weatherEffect?.totalAdjustment ?? null,
        weatherIsDome:   venueWeather?.isDome ?? null,
        weatherSummary:  weatherEffect?.summary ?? null,
        // Phase 3: NHL goalies
        homeGoalieName:    goalieMatchup.home?.name ?? null,
        homeGoalieSavePct: goalieMatchup.home?.savePct ?? null,
        homeGoalieGaa:     goalieMatchup.home?.gaa ?? null,
        awayGoalieName:    goalieMatchup.away?.name ?? null,
        awayGoalieSavePct: goalieMatchup.away?.savePct ?? null,
        awayGoalieGaa:     goalieMatchup.away?.gaa ?? null,
        // Phase 3: NFL / WNBA injuries (shared columns)
        homeInjuryImpact:
          game.sport === "NFL"  ? homeInjury.impactScore :
          game.sport === "WNBA" ? homeWnbaInjury.impactScore : null,
        awayInjuryImpact:
          game.sport === "NFL"  ? awayInjury.impactScore :
          game.sport === "WNBA" ? awayWnbaInjury.impactScore : null,
        homeKeyInjuries:
          game.sport === "NFL"  ? JSON.stringify(homeInjury.keyInjuries) :
          game.sport === "WNBA" ? JSON.stringify(homeWnbaInjury.keyInjuries) : null,
        awayKeyInjuries:
          game.sport === "NFL"  ? JSON.stringify(awayInjury.keyInjuries) :
          game.sport === "WNBA" ? JSON.stringify(awayWnbaInjury.keyInjuries) : null,
        // Phase 4: MLB bullpen fatigue
        homeBullpenFatigue: game.sport === "MLB" ? (bullpenMatchup.home?.weightedPitches ?? null) : null,
        awayBullpenFatigue: game.sport === "MLB" ? (bullpenMatchup.away?.weightedPitches ?? null) : null,
        homeBullpenLabel:   game.sport === "MLB" ? (bullpenMatchup.home?.fatigueLabel ?? null) : null,
        awayBullpenLabel:   game.sport === "MLB" ? (bullpenMatchup.away?.fatigueLabel ?? null) : null,
        // Phase 4: MLB lineup confirmation
        homeLineupConfirmed: game.sport === "MLB" ? lineupMatchup.home.confirmed : null,
        awayLineupConfirmed: game.sport === "MLB" ? lineupMatchup.away.confirmed : null,
      })
      .onConflictDoUpdate({
        target: gamesTable.id,
        set: {
          league: game.league ?? null,
          homeTeamId: game.homeTeamId ?? null,
          awayTeamId: game.awayTeamId ?? null,
          homeTeamLogo: game.homeTeamLogo ?? null,
          awayTeamLogo: game.awayTeamLogo ?? null,
          gameDate: game.gameDate,
          gameTime: game.gameTime,
          status: game.status,
          // Preserve a valid score once captured — ESPN sometimes returns 0 on
          // subsequent refreshes even after a game has finished.
          homeScore: sql`COALESCE(NULLIF(EXCLUDED.home_score, 0), ${gamesTable.homeScore})`,
          awayScore: sql`COALESCE(NULLIF(EXCLUDED.away_score, 0), ${gamesTable.awayScore})`,
          homeTeamRecord: game.homeTeamRecord,
          awayTeamRecord: game.awayTeamRecord,
          homeWinPct: proj.homeWinPct,
          confidence: proj.confidence,
          projectedSpread: proj.projectedSpread,
          projectedTotal: proj.projectedTotal,
          valueRating: proj.valueRating,
          modelScore: proj.modelScore,
          edge: proj.edge,
          vegasSpread: proj.vegasSpread,
          vegasTotal: proj.vegasTotal,
          // Preserve existing odds when the latest refresh returns null (e.g. Soccer
          // game just appeared, Odds API cache hasn't refreshed yet, or fetch failed).
          vegasHomeOdds: sql`COALESCE(EXCLUDED.vegas_home_odds, ${gamesTable.vegasHomeOdds})`,
          vegasAwayOdds: sql`COALESCE(EXCLUDED.vegas_away_odds, ${gamesTable.vegasAwayOdds})`,
          vegasDrawOdds: sql`COALESCE(EXCLUDED.vegas_draw_odds, ${gamesTable.vegasDrawOdds})`,
          // Phase 1
          confidenceNum: proj.confidenceNum,
          units: proj.units,
          priceAdjustment: proj.priceAdjustment,
          sharpScore: proj.sharpScore,
          sharpSignal: proj.sharpSignal,
          finalModelScore: proj.finalModelScore,
          finalModelTier: proj.finalModelTier,
          finalModelStars: proj.finalModelStars,
          podScore: proj.podScore,
          // Phase 2: opening odds — use COALESCE to set once on first sighting;
          // if the row already has a non-null value, preserve it.
          openingHomeOdds: sql`COALESCE(${gamesTable.openingHomeOdds}, EXCLUDED.opening_home_odds)`,
          openingAwayOdds: sql`COALESCE(${gamesTable.openingAwayOdds}, EXCLUDED.opening_away_odds)`,
          // Phase 2: always refreshed
          homeStarterName:     starters.home?.name ?? null,
          homeStarterEra:      starters.home?.seasonEra ?? null,
          homeStarterWhip:     starters.home?.seasonWhip ?? null,
          homeStarterRecentEra: starters.home?.recentEra ?? null,
          awayStarterName:     starters.away?.name ?? null,
          awayStarterEra:      starters.away?.seasonEra ?? null,
          awayStarterWhip:     starters.away?.seasonWhip ?? null,
          awayStarterRecentEra: starters.away?.recentEra ?? null,
          bestLineBook: bestLine ? displayBookName(bestLine.book) : null,
          bestLineOdds: bestLine?.odds ?? null,
          // Phase 3: always refreshed (weather/lineups change daily)
          weatherWindMph:  venueWeather?.isDome ? null : (venueWeather?.windSpeedMph ?? null),
          weatherPrecipMm: venueWeather?.isDome ? null : (venueWeather?.precipitationMm ?? null),
          weatherTotalAdj: weatherEffect?.totalAdjustment ?? null,
          weatherIsDome:   venueWeather?.isDome ?? null,
          weatherSummary:  weatherEffect?.summary ?? null,
          homeGoalieName:    goalieMatchup.home?.name ?? null,
          homeGoalieSavePct: goalieMatchup.home?.savePct ?? null,
          homeGoalieGaa:     goalieMatchup.home?.gaa ?? null,
          awayGoalieName:    goalieMatchup.away?.name ?? null,
          awayGoalieSavePct: goalieMatchup.away?.savePct ?? null,
          awayGoalieGaa:     goalieMatchup.away?.gaa ?? null,
          // Phase 3: NFL / WNBA injuries (shared columns, refreshed each run)
          homeInjuryImpact:
            game.sport === "NFL"  ? homeInjury.impactScore :
            game.sport === "WNBA" ? homeWnbaInjury.impactScore : null,
          awayInjuryImpact:
            game.sport === "NFL"  ? awayInjury.impactScore :
            game.sport === "WNBA" ? awayWnbaInjury.impactScore : null,
          homeKeyInjuries:
            game.sport === "NFL"  ? JSON.stringify(homeInjury.keyInjuries) :
            game.sport === "WNBA" ? JSON.stringify(homeWnbaInjury.keyInjuries) : null,
          awayKeyInjuries:
            game.sport === "NFL"  ? JSON.stringify(awayInjury.keyInjuries) :
            game.sport === "WNBA" ? JSON.stringify(awayWnbaInjury.keyInjuries) : null,
          // Phase 4: MLB bullpen fatigue (refreshed each run — fatigue changes daily)
          homeBullpenFatigue: game.sport === "MLB" ? (bullpenMatchup.home?.weightedPitches ?? null) : null,
          awayBullpenFatigue: game.sport === "MLB" ? (bullpenMatchup.away?.weightedPitches ?? null) : null,
          homeBullpenLabel:   game.sport === "MLB" ? (bullpenMatchup.home?.fatigueLabel ?? null) : null,
          awayBullpenLabel:   game.sport === "MLB" ? (bullpenMatchup.away?.fatigueLabel ?? null) : null,
          // Phase 4: MLB lineup confirmation (refreshed each run — lineups post ~1–3h before game)
          homeLineupConfirmed: game.sport === "MLB" ? lineupMatchup.home.confirmed : null,
          awayLineupConfirmed: game.sport === "MLB" ? lineupMatchup.away.confirmed : null,
        },
      });

    // Snapshot pipeline: odds, predictions, results, closing lines
    await processGameSnapshot(game, proj);

    upserted++;
    sports.add(game.sport);
  }

  // Mark any games that are still "live" in the DB but were NOT returned by
  // ESPN this cycle as "completed" — ESPN drops finished events from its feed,
  // so absence from the response means the game ended.
  const returnedIds = fetchedGames.map((g) => g.espnId);
  if (returnedIds.length > 0) {
    await db
      .update(gamesTable)
      .set({ status: "final" })
      .where(
        and(
          eq(gamesTable.gameDate, todayDateStr),
          eq(gamesTable.status, "live"),
          notInArray(gamesTable.id, returnedIds),
        ),
      );
  } else {
    // ESPN returned nothing at all — don't blindly mark everything completed;
    // this is likely a transient fetch failure. Leave existing statuses alone.
  }

  // EMA learning pass (keeps confidenceMultiplier up to date)
  await runLearning();

  // Recover any past-date games still stuck in a non-final status (handles
  // the case where the server was down / restarted after games finished)
  await recoverStaleGames();

  // Ensure game_results rows exist for every game already marked "final"
  await syncGameResults();

  // Grade any picks that now have a completed game result
  const picksGraded = await runGrading();

  lastRefreshedAt = new Date();
  logger.info(
    { upserted, sports: [...sports], picksGraded },
    "Games refresh complete",
  );
  return { gamesUpdated: upserted, sportsRefreshed: [...sports], picksGraded };
}

/**
 * GET /api/games/today
 * Auto-refreshes from ESPN when data is stale (>1 hr old).
 * Optional ?sport=NFL query param for server-side filtering.
 *
 * Subscriber gating:
 *   - Pro subscribers receive full model projections for all games.
 *   - Non-subscribers receive full data for only the top FREE_PICKS games
 *     across today's ENTIRE slate (sorted by modelScore descending).
 *     The free quota is global — not per-sport — so repeatedly querying
 *     with ?sport= cannot be used to extract additional premium picks.
 */
router.get("/games/today", resolveSubscriberStatus, rejectInvalidToken, async (req, res): Promise<void> => {
  if (isStale()) {
    try {
      await refreshAll();
    } catch (err) {
      req.log.warn({ err }, "Auto-refresh failed; serving cached data");
    }
  }

  // Use US Eastern time for the "sports day" — games at 8 PM ET fall on the
  // same calendar day as the afternoon slate, even though they're UTC+1 day.
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2");
  const { sport } = req.query;
  const isSubscribed = req.subscriberStatus?.isSubscribed === true;

  // Count live games for the "N games in progress" indicator — always scoped
  // to today's full slate regardless of sport filter or subscription status.
  const [liveGamesRows, todayPickRows] = await Promise.all([
    db
      .select({ id: gamesTable.id })
      .from(gamesTable)
      .where(and(eq(gamesTable.gameDate, today), inArray(gamesTable.status, ["live"]))),
    // Fetch today's public published picks so we can pin the rating category.
    // Units stay dynamic (updated each scheduler run), but once a pick is
    // published as "Buy" it must stay in the Buy section for the day — the
    // model re-running with a slightly lower score shouldn't move it to Neutral.
    db
      .select({ gameId: publishedPicksTable.gameId, recommendation: publishedPicksTable.recommendation })
      .from(publishedPicksTable)
      .where(
        and(
          sql`DATE(${publishedPicksTable.publishedAt} AT TIME ZONE 'America/New_York') = ${today}::date`,
          eq(publishedPicksTable.isPublic, true),
        ),
      ),
  ]);
  const liveGamesCount = liveGamesRows.length;

  // Map gameId → locked-in rating from the time of publication.
  const publishedRatingMap = new Map(todayPickRows.map((p) => [p.gameId, p.recommendation]));

  /**
   * Apply published rating override: keeps a game in its published section
   * (e.g. "Buy") even if the model re-runs and downgrades it, while leaving
   * games with no published pick showing their live rating.
   * Units are intentionally NOT overridden — they remain dynamic.
   */
  function applyPublishedRatings<T extends AnyGame>(games: T[]): T[] {
    return games.map((g) => {
      const pinned = publishedRatingMap.get(g["id"] as string);
      return pinned != null ? { ...g, valueRating: pinned } : g;
    });
  }

  if (isSubscribed) {
    // Subscribers: apply sport filter directly — no locking needed
    const where =
      typeof sport === "string" && sport !== "All"
        ? and(eq(gamesTable.gameDate, today), eq(gamesTable.sport, sport), eq(gamesTable.status, "upcoming"))
        : and(eq(gamesTable.gameDate, today), eq(gamesTable.status, "upcoming"));

    const games = await db
      .select()
      .from(gamesTable)
      .where(where)
      .orderBy(desc(gamesTable.modelScore));

    res.json({
      games: applyPublishedRatings(games as AnyGame[]),
      lastUpdated: (lastRefreshedAt ?? new Date()).toISOString(),
      totalGames: games.length,
      liveGamesCount,
      isSubscribed: true,
    });
    return;
  }

  // Non-subscribers: always fetch the FULL day's slate first to establish
  // global lock positions, then filter by sport for the final response.
  // This prevents the ?sport= bypass: the free quota is consumed from the
  // global ranked list regardless of the sport filter in the request.
  const allTodayGames = await db
    .select()
    .from(gamesTable)
    .where(and(eq(gamesTable.gameDate, today), eq(gamesTable.status, "upcoming")))
    .orderBy(desc(gamesTable.modelScore));

  // Apply published rating pins before determining free slots, so the free
  // pick selection operates on the corrected ratings.
  const ratedGames = applyPublishedRatings(allTodayGames as AnyGame[]);

  // Free picks: top FREE_PICKS qualifying games (Strong Buy or Buy) by model
  // score. Skipping Neutral/Fade ensures free slots aren't wasted on games
  // that don't appear on the All tab, which only shows actionable picks.
  const qualifyingGames = ratedGames.filter(
    (g) => g["valueRating"] === "Strong Buy" || g["valueRating"] === "Buy",
  );
  const freeGameIds = new Set(
    qualifyingGames.slice(0, FREE_PICKS).map((g) => g["id"] as string),
  );

  // Apply lock state across the full slate, then sport-filter for the response
  const gatedAll = ratedGames.map((game) => {
    const isFree = freeGameIds.has(game["id"] as string);
    return isFree ? { ...game, isLocked: false } : lockGame(game);
  });

  const filtered =
    typeof sport === "string" && sport !== "All"
      ? gatedAll.filter((g) => g["sport"] === sport)
      : gatedAll;

  res.json({
    games: filtered,
    lastUpdated: (lastRefreshedAt ?? new Date()).toISOString(),
    totalGames: filtered.length,
    liveGamesCount,
    isSubscribed: false,
  });
});

/**
 * POST /api/games/refresh
 * Manually trigger an ESPN pull + model update + grading pass.
 */
router.post("/games/refresh", async (req, res): Promise<void> => {
  const result = await refreshAll();
  res.json({ message: "Refresh complete", ...result });
});

export default router;
