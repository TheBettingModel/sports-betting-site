import { Router, type IRouter } from "express";
import { eq, and, desc, inArray, notInArray, sql } from "drizzle-orm";
import {
  db, gamesTable, modelPredictionsTable, modelVersionsTable, modelWeightsTable,
  officialPredictionIdentityTable, publishedPicksTable,
} from "@workspace/db";
import { getDailyFreePick } from "../services/freePick";
import { lockGame } from "../services/gameAccess";
import { fetchAllSports } from "../services/espn";
import { computeProjection, type ComputeOptions } from "../services/model";
import {
  getOddsForGameWithStatus,
  getBestLine,
  displayBookName,
  selectActionableMoneylineMarket,
} from "../services/oddsApi";
import { getProbablePitchers, computePitcherAdvantage, getProbablePitcherCacheMeta } from "../services/mlbPitchers";
import { getBullpenMatchup, computeBullpenAdvantage, getBullpenCacheMeta } from "../services/mlbBullpen";
import { getLineupMatchup, computeLineupAdvantage, enrichLineupMatchup, getLineupCacheMeta } from "../services/mlbLineups";
import { getParkFactor } from "../services/mlbParkFactors";
import { getVenueWeather, computeWeatherEffect, getVenueWeatherCacheMeta } from "../services/weatherService";
import { getGoalieMatchup, computeGoalieAdvantage } from "../services/nhlGoalies";
import { getTeamInjuryImpact, computeInjuryAdvantage } from "../services/nflInjuries";
import { computeWnbaInjuryAdvantage } from "../services/wnbaInjuries";
import type { GoalieMatchup } from "../services/nhlGoalies";
import type { TeamInjuryImpact } from "../services/nflInjuries";
import { getWnbaTeamStats, getNbaTeamStats, getSoccerTeamStats, getDbTeamStats } from "../services/teamStats";
import { getWnbaGameContext } from "../services/wnbaContext";
import { runLearning } from "../services/learning";
import {
  createPredictionDecisionContext,
  processGameSnapshot,
} from "../services/snapshot";
import { resolveProductionPredictionBoundary, shouldRunIncumbentSnapshot } from "../services/guardedServing/productionBoundary";
import { assessMlbDecisionEvidence } from "../services/mlbDecisionEvidence";
import { createMlbQualificationAudit } from "../services/mlbQualificationAudit";
import { runGrading, syncGameResults, recoverStaleGames } from "../services/grading-runner";
import { runForecastReviews } from "../services/forecastReviews";
import { logger } from "../lib/logger";
import { resolveSubscriberStatus, rejectInvalidToken } from "../middleware/requireSubscriber";
import { createNcaafFeatureSnapshot } from "../services/ncaafFeatures";
import { ncaafSeasonForDate } from "../services/ncaafEvidenceLedger";
import {
  choosePrimaryMarket,
  getLatestSpreadCandidates,
  type MarketSelectionCandidate,
} from "../services/spreadModel";
import { getMoneylinePublicationPermissionsForGames } from "../services/marketApproval";
import { isExactPublishedMarketActionable } from "../services/subscriberPublicationSafety";

type AnyGame = Record<string, unknown>;

/** Number of full picks shown to non-subscribers */

/**
 * Returns the game with premium model fields zeroed out and `isLocked: true`.
 * Fields are kept as valid numbers (not null) so clients don't crash on
 * numeric rendering — they should hide/replace locked rows using `isLocked`.
 */
async function attachMarketSelection<T extends AnyGame>(games: T[]): Promise<T[]> {
  const gameIds = games.map((game) => game["id"] as string);
  const [spreadByGame, moneylinePermissions, predictionIdentities] = await Promise.all([
    getLatestSpreadCandidates(gameIds),
    getMoneylinePublicationPermissionsForGames(gameIds),
    gameIds.length ? db.select({
      gameId: modelPredictionsTable.gameId,
      predictionTimestamp: modelPredictionsTable.predictionTimestamp,
      engine: modelVersionsTable.modelId,
      modelVersion: modelVersionsTable.modelId,
      officialEngine: officialPredictionIdentityTable.engine,
      officialFamily: officialPredictionIdentityTable.modelFamily,
      officialVersion: officialPredictionIdentityTable.modelVersion,
      artifactId: officialPredictionIdentityTable.artifactId,
      servingMode: officialPredictionIdentityTable.servingMode,
      inputVersion: officialPredictionIdentityTable.inputVersion,
      approvalStatus: officialPredictionIdentityTable.approvalStatusAtPrediction,
      fallbackUsed: officialPredictionIdentityTable.fallbackUsed,
      fallbackReason: officialPredictionIdentityTable.fallbackReason,
    }).from(modelPredictionsTable)
      .innerJoin(modelVersionsTable, eq(modelPredictionsTable.modelVersionId, modelVersionsTable.id))
      .leftJoin(officialPredictionIdentityTable, eq(officialPredictionIdentityTable.predictionId, modelPredictionsTable.id))
      .where(inArray(modelPredictionsTable.gameId, gameIds))
      .orderBy(desc(modelPredictionsTable.predictionTimestamp)) : Promise.resolve([]),
  ]);
  const identityByGame = new Map<string, Record<string, unknown>>();
  for (const row of predictionIdentities) {
    if (identityByGame.has(row.gameId)) continue;
    identityByGame.set(row.gameId, {
      engine: row.officialEngine ?? row.engine,
      modelFamily: row.officialFamily ?? null,
      modelVersion: row.officialVersion ?? row.modelVersion,
      artifactId: row.artifactId ?? null,
      servingMode: row.servingMode ?? null,
      inputVersion: row.inputVersion ?? null,
      approvalStatus: row.approvalStatus ?? null,
      fallbackUsed: row.fallbackUsed ?? false,
      fallbackReason: row.fallbackReason ?? null,
      predictionTimestamp: row.predictionTimestamp.toISOString(),
    });
  }
  return games.map((game) => {
    const researchRecommendation = String(game["modelRecommendation"] ?? game["valueRating"]);
    const researchUnits = Number(game["requestedUnits"] ?? game["units"] ?? 0);
    const downstreamPublic = game["isPublic"] === true;
    const downstreamApprovedUnits = Number(game["approvedUnits"] ?? 0);
    const moneylinePermission = moneylinePermissions.get(game["id"] as string);
    const moneylineApproved = moneylinePermission?.approved === true;
    const moneylineQualified = downstreamPublic
      && game["publicationStatus"] === "PUBLISHED"
      && downstreamApprovedUnits === 1
      && moneylineApproved
      && (researchRecommendation === "Strong Buy" || researchRecommendation === "Buy");
    const pickIsHome = Number(game["edge"]) >= 0;
    const moneylineProbability = pickIsHome
      ? Number(game["homeWinPct"])
      : 100 - Number(game["homeWinPct"]);
    const moneylineOdds = pickIsHome
      ? Number(game["vegasHomeOdds"])
      : Number(game["vegasAwayOdds"]);
    const probabilityDecimal = moneylineProbability / 100;
    const payout = moneylineOdds > 0 ? moneylineOdds / 100 : 100 / Math.abs(moneylineOdds);
    const moneylineExpectedValue = probabilityDecimal * payout - (1 - probabilityDecimal);
    const confidenceNum = Number(game["confidenceNum"] ?? 50);
    const bestLineOdds = Number(game["bestLineOdds"] ?? moneylineOdds);
    const moneylineSelectionCandidate: MarketSelectionCandidate = {
      market: "moneyline",
      eligible: moneylineQualified,
      expectedValue: moneylineExpectedValue,
      edge: Math.abs(Number(game["edge"])) / 100,
      modelProbability: probabilityDecimal,
      uncertainty: Math.max(0, Math.min(1, 1 - confidenceNum / 100)),
      priceQuality: bestLineOdds === moneylineOdds ? 1 : 0.8,
      marketQuality: Number.isFinite(moneylineOdds) && moneylineOdds !== 0 ? 1 : 0,
      dataQuality: 1,
      clvSignal: 0,
    };
    const moneylineMarket = {
      market: "moneyline",
      selection: pickIsHome ? "home" : "away",
      teamAbbr: pickIsHome ? game["homeTeamAbbr"] : game["awayTeamAbbr"],
      odds: moneylineOdds,
      modelProbability: moneylineProbability,
      fairPrice: moneylineProbability >= 50
        ? Math.round(-(moneylineProbability / (100 - moneylineProbability)) * 100)
        : Math.round(((100 - moneylineProbability) / moneylineProbability) * 100),
      edge: Math.abs(Number(game["edge"])),
      expectedValue: Math.round(moneylineExpectedValue * 1000) / 10,
      recommendation: moneylineQualified ? researchRecommendation : "Neutral",
      units: moneylineQualified ? 1 : 0,
      eligible: moneylineQualified,
      approvalStatus: moneylinePermission?.status ?? "UNVALIDATED",
      approvalReasons: moneylinePermission?.reasons ?? ["exact_approval_record_missing"],
      researchRecommendation,
      researchUnits,
    };
    const spread = spreadByGame.get(game["id"] as string);
    const spreadResearchRecommendation = spread?.recommendation ?? "Neutral";
    const spreadResearchUnits = spread?.units ?? 0;
    const spreadQualified = spread != null
      && isExactPublishedMarketActionable({
        isPublic: game["spreadIsPublic"],
        publicationStatus: game["spreadPublicationStatus"],
        approvedUnits: game["spreadApprovedUnits"],
        publishedSelection: game["spreadPublishedSelection"],
        candidateSelection: spread.selection,
      })
      && spread.promotionEligible;
    const spreadMarket = spread ? {
      market: "spread",
      selection: spread.selection,
      teamAbbr: spread.selection === "home" ? game["homeTeamAbbr"] : game["awayTeamAbbr"],
      line: spread.line,
      odds: spread.odds,
      sportsbook: displayBookName(spread.sportsbook),
      modelProbability: Math.round(spread.modelProbability * 1000) / 10,
      fairPrice: spread.fairPrice,
      edge: Math.round(spread.edge * 1000) / 10,
      expectedValue: Math.round(spread.expectedValue * 1000) / 10,
      pushProbability: Math.round(spread.pushProbability * 1000) / 10,
      recommendation: spreadQualified ? spread.recommendation : "Neutral",
      units: spreadQualified ? 1 : 0,
      eligible: spreadQualified,
      gateStatus: spread.gateStatus,
      researchRecommendation: spreadResearchRecommendation,
      researchUnits: spreadResearchUnits,
    } : null;
    const primaryMarket = choosePrimaryMarket(
      moneylineSelectionCandidate,
      spread ? { ...spread, promotionEligible: spreadQualified } : null,
    );
    const selectedPick = primaryMarket === "moneyline"
      ? moneylineMarket
      : primaryMarket === "spread"
        ? spreadMarket
        : null;
    return {
      ...game,
      valueRating: moneylineQualified ? researchRecommendation : "Neutral",
      units: moneylineQualified ? 1 : 0,
      publicationApprovalStatus: moneylinePermission?.status ?? "UNVALIDATED",
      selectedMarket: selectedPick?.market ?? null,
      selectedPick,
      moneylineMarket,
      spreadMarket,
      ...(identityByGame.has(game["id"] as string)
        ? { modelIdentity: identityByGame.get(game["id"] as string) }
        : {}),
    } as T;
  });
}

/**
 * MLB qualification diagnostics are operator-only. They remain accessible
 * through the authenticated admin audit endpoint, never through this public
 * subscriber/free game feed.
 */
function stripInternalDiagnostics(game: AnyGame): AnyGame {
  const {
    mlbDecisionAudit: _internalAudit,
    spreadIsPublic: _spreadIsPublic,
    spreadApprovedUnits: _spreadApprovedUnits,
    spreadPublishedSelection: _spreadPublishedSelection,
    spreadPublicationStatus: _spreadPublicationStatus,
    ...publicGame
  } = game;
  return publicGame;
}

const router: IRouter = Router();

/** In-memory cache: when we last successfully refreshed */
let lastRefreshedAt: Date | null = null;
// Keep the server-side game slate close to the live odds cadence. The mobile
// client refetches while the Picks tab is open, but this shared guard ensures
// only one full model refresh is needed per interval.
const STALE_MS = 30 * 60 * 1000; // 30 minutes

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
  // Also fetch existing market values. A temporary missing provider response
  // must not turn a valid game into a fabricated 50/50, zero-edge projection.
  const todayDateStr = new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD

  const [fetchedGames, weights, existingRows] = await Promise.all([
    fetchAllSports(),
    db.select().from(modelWeightsTable),
    db.select({
      id: gamesTable.id,
      openingHomeOdds: gamesTable.openingHomeOdds,
      openingAwayOdds: gamesTable.openingAwayOdds,
       vegasHomeOdds: gamesTable.vegasHomeOdds,
       vegasAwayOdds: gamesTable.vegasAwayOdds,
       vegasDrawOdds: gamesTable.vegasDrawOdds,
       bestLineBook: gamesTable.bestLineBook,
       bestLineOdds: gamesTable.bestLineOdds,
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
      await getLineupMatchup(
        first.homeTeamAbbr,
        first.awayTeamAbbr,
        first.gameDate,
        first.commenceTimeISO,
      );
      // Remaining calls are served from cache (no additional HTTP requests)
      for (const g of mlbGames) {
        const lm = await getLineupMatchup(
          g.homeTeamAbbr,
          g.awayTeamAbbr,
          g.gameDate,
          g.commenceTimeISO,
        );
        lineupMap.set(g.espnId, lm);
      }
    })(),
  ]);

  let upserted = 0;
  const sports = new Set<string>();

  for (const game of fetchedGames) {
    const w = weightsBySport[game.sport] ?? null;
    // One immutable context assembly per WNBA game supplies the exact stats,
    // availability, schedule, travel, and evidence used by this decision.
    const wnbaContext = game.sport === "WNBA" && game.homeTeamId && game.awayTeamId
      ? await getWnbaGameContext({
          homeTeamId: game.homeTeamId,
          awayTeamId: game.awayTeamId,
          gameTime: game.commenceTimeISO,
        })
      : undefined;

    const DB_SPORTS = new Set(["MLB", "NFL", "NHL", "NCAAF", "NCAAB"]);

    // Fetch advanced team analytics (all cached after first call per run).
    // WNBA/NBA: ESPN stats (4h TTL). Soccer: DB goals (1h TTL).
    // MLB/NFL/NHL/NCAAF/NCAAB: DB runs/points (1h TTL).
    const [homeTeamStats, awayTeamStats, homeSoccerStats, awaySoccerStats, homeDbStats, awayDbStats] =
      await Promise.all([
        game.sport === "WNBA"
          ? Promise.resolve(wnbaContext?.home.stats)
          : game.sport === "NBA"
          ? getNbaTeamStats(game.homeTeamId ?? "", game.gameDate)
          : Promise.resolve(undefined),
        game.sport === "WNBA"
          ? Promise.resolve(wnbaContext?.away.stats)
          : game.sport === "NBA"
          ? getNbaTeamStats(game.awayTeamId ?? "", game.gameDate)
          : Promise.resolve(undefined),
        game.sport === "Soccer"
          ? getSoccerTeamStats(game.homeTeamId ?? "", game.gameDate, game.league)
          : Promise.resolve(undefined),
        game.sport === "Soccer"
          ? getSoccerTeamStats(game.awayTeamId ?? "", game.gameDate, game.league)
          : Promise.resolve(undefined),
        DB_SPORTS.has(game.sport)
          ? getDbTeamStats(game.homeTeamId ?? "", game.sport, game.gameDate, game.league)
          : Promise.resolve(undefined),
        DB_SPORTS.has(game.sport)
          ? getDbTeamStats(game.awayTeamId ?? "", game.sport, game.gameDate, game.league)
          : Promise.resolve(undefined),
      ]);

    // ── Phase 2a: multi-book odds (30-min cache) ──────────────────────────────
    // Replaces ESPN's single-book moneyline with a consensus price and adds
    // Pinnacle's line for the sharp-money divergence signal.
    const oddsLookup = await getOddsForGameWithStatus(
      game.sport,
      game.league ?? null,
      game.homeTeamName,
      game.awayTeamName,
      game.commenceTimeISO,
    );
    const gameOdds = oddsLookup.odds;

    // ── Phase 2b: MLB probable starters (4-hour cache) ────────────────────────
    const starters = game.sport === "MLB"
      ? await getProbablePitchers(
          game.homeTeamAbbr,
          game.awayTeamAbbr,
          game.gameDate,
          game.commenceTimeISO,
        )
      : { home: null, away: null };
    const pitcherAdvantage = game.sport === "MLB"
      ? computePitcherAdvantage(starters)
      : undefined;

    // ── Phase 2c: line movement ───────────────────────────────────────────────
    const existingRow = existingByGameId.get(game.espnId);
    const espnMarket = {
      homeOdds: game.vegasHomeOdds,
      awayOdds: game.vegasAwayOdds,
      drawOdds: game.vegasDrawOdds,
    };
    const currentMarket = selectActionableMoneylineMarket(
      game.sport,
      oddsLookup,
      espnMarket,
    );
    const currentHomeOdds = currentMarket?.homeOdds;
    const currentAwayOdds = currentMarket?.awayOdds;
    const currentDrawOdds = currentMarket?.drawOdds ?? undefined;
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
    const homeWnbaInjury = wnbaContext?.home.availability;
    const awayWnbaInjury = wnbaContext?.away.availability;
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
      : game.sport === "WNBA" && homeWnbaInjury && awayWnbaInjury
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

    const projectionOptions: ComputeOptions = {
      homeHomeRecord:    game.homeHomeRecord,
      homeRoadRecord:    game.homeRoadRecord,
      awayHomeRecord:    game.awayHomeRecord,
      awayRoadRecord:    game.awayRoadRecord,
      // Consensus odds preferred over ESPN single book
      realVegasHomeOdds: currentHomeOdds,
      realVegasAwayOdds: currentAwayOdds,
      realVegasDrawOdds: currentDrawOdds,
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
      wnbaContext,
    };
    const ncaafFeature = game.sport === "NCAAF" && new Date(game.commenceTimeISO) > new Date()
      ? await createNcaafFeatureSnapshot({
          provider: "espn",
          eventId: game.espnId,
          season: ncaafSeasonForDate(game.gameDate),
          kickoffAt: new Date(game.commenceTimeISO),
          homeTeamId: game.homeTeamId ?? null,
          awayTeamId: game.awayTeamId ?? null,
          homeTeamName: game.homeTeamName,
          awayTeamName: game.awayTeamName,
          neutralSite: game.neutralSite,
        }, new Date())
      : null;
    if (game.sport === "NCAAF") {
      projectionOptions.ncaafFeatureSnapshot = ncaafFeature?.snapshot;
      projectionOptions.ncaafRecommendationBlocked = ncaafFeature?.snapshot.forecast.status !== "ready";
      projectionOptions.ncaafFeatureMetadata = ncaafFeature ? {
        snapshotId: ncaafFeature.id,
        schemaVersion: ncaafFeature.snapshot.schemaVersion,
        modelVersion: ncaafFeature.snapshot.modelVersion,
        configHash: ncaafFeature.snapshot.configHash,
        inputHash: ncaafFeature.inputHash,
        dataCutoffAt: ncaafFeature.snapshot.cutoff,
        sufficientIndependentEvidence: ncaafFeature.snapshot.quality.sufficientIndependentEvidence,
      } : undefined;
    }
    const mlbAvailability = {
      homeStarter: starters.home ?? null,
      awayStarter: starters.away ?? null,
      starterQualityReasons: starters.qualityReasons ?? [],
      homeLineupConfirmed: enrichedLineup.home.confirmed,
      awayLineupConfirmed: enrichedLineup.away.confirmed,
      homeLineup: enrichedLineup.home,
      awayLineup: enrichedLineup.away,
      homeBullpen: bullpenMatchup.home ?? null,
      awayBullpen: bullpenMatchup.away ?? null,
      venueWeather,
      startersMeta: getProbablePitcherCacheMeta(game.gameDate),
      bullpenMeta: getBullpenCacheMeta(game.gameDate),
      lineupsMeta: getLineupCacheMeta(game.gameDate),
      weatherMeta: getVenueWeatherCacheMeta(
        game.sport,
        game.homeTeamAbbr,
        game.gameDate,
        game.gameTime ?? "7:00 PM ET",
      ),
    };
    let mlbEvidence;
    if (game.sport === "MLB") {
      mlbEvidence = assessMlbDecisionEvidence(game, projectionOptions, mlbAvailability);
      projectionOptions.mlbEvidenceMultiplier = mlbEvidence.confidenceMultiplier;
      projectionOptions.mlbRecommendationBlocked = mlbEvidence.recommendationBlocked;
    }

    const proj = computeProjection(
      game.espnId,
      game.sport,
      game.homeTeamRecord,
      game.awayTeamRecord,
      w,
      projectionOptions,
    );
    const decisionContext = createPredictionDecisionContext(
      game,
      w,
      projectionOptions,
      {
        ...mlbAvailability,
        homeGoalie: goalieMatchup.home ?? null,
        awayGoalie: goalieMatchup.away ?? null,
        homeInjuries: game.sport === "NFL" ? homeInjury.keyInjuries :
          game.sport === "WNBA" ? homeWnbaInjury?.keyInjuries ?? [] : [],
        awayInjuries: game.sport === "NFL" ? awayInjury.keyInjuries :
          game.sport === "WNBA" ? awayWnbaInjury?.keyInjuries ?? [] : [],
        wnbaContext,
      },
      mlbEvidence,
      ncaafFeature ? {
        snapshotId: ncaafFeature.id,
        schemaVersion: ncaafFeature.snapshot.schemaVersion,
        modelVersion: ncaafFeature.snapshot.modelVersion,
        configHash: ncaafFeature.snapshot.configHash,
        inputHash: ncaafFeature.inputHash,
        dataCutoffAt: ncaafFeature.snapshot.cutoff,
        sufficientIndependentEvidence: ncaafFeature.snapshot.quality.sufficientIndependentEvidence,
      } : undefined,
    );
    const mlbDecisionAudit = game.sport === "MLB"
      ? createMlbQualificationAudit(proj, mlbEvidence)
      : null;
    const persistedMlbDecisionAudit = mlbDecisionAudit as Record<string, unknown> | null;

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
        startsAt: new Date(game.commenceTimeISO),
        status: game.status,
        homeScore: game.homeScore ?? null,
        awayScore: game.awayScore ?? null,
        ...proj,
        mlbDecisionAudit: persistedMlbDecisionAudit,
        // Phase 2: set once — opening odds preserved on conflict (not in set block)
        openingHomeOdds: openingHomeOdds ?? null,
        openingAwayOdds: openingAwayOdds ?? null,
        // Phase 2: always refreshed
        homeStarterName:     starters.home?.name ?? null,
        homeStarterEra:      starters.home?.seasonEra ?? null,
        homeStarterWhip:     starters.home?.seasonWhip ?? null,
        homeStarterRecentEra: starters.home?.recentEra ?? null,
        homeStarterHand:     starters.home?.pitchHand ?? null,
        awayStarterName:     starters.away?.name ?? null,
        awayStarterEra:      starters.away?.seasonEra ?? null,
        awayStarterWhip:     starters.away?.seasonWhip ?? null,
        awayStarterRecentEra: starters.away?.recentEra ?? null,
        awayStarterHand:     starters.away?.pitchHand ?? null,
        bestLineBook: bestLine ? displayBookName(bestLine.book) : (existingRow?.bestLineBook ?? null),
        bestLineOdds: bestLine?.odds ?? (existingRow?.bestLineOdds ?? null),
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
          game.sport === "WNBA" ? homeWnbaInjury?.impactScore ?? null : null,
        awayInjuryImpact:
          game.sport === "NFL"  ? awayInjury.impactScore :
          game.sport === "WNBA" ? awayWnbaInjury?.impactScore ?? null : null,
        homeKeyInjuries:
          game.sport === "NFL"  ? JSON.stringify(homeInjury.keyInjuries) :
          game.sport === "WNBA" ? JSON.stringify(homeWnbaInjury?.keyInjuries ?? []) : null,
        awayKeyInjuries:
          game.sport === "NFL"  ? JSON.stringify(awayInjury.keyInjuries) :
          game.sport === "WNBA" ? JSON.stringify(awayWnbaInjury?.keyInjuries ?? []) : null,
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
          startsAt: new Date(game.commenceTimeISO),
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
          mlbDecisionAudit: persistedMlbDecisionAudit,
          // Phase 2: opening odds — use COALESCE to set once on first sighting;
          // if the row already has a non-null value, preserve it.
          openingHomeOdds: sql`COALESCE(${gamesTable.openingHomeOdds}, EXCLUDED.opening_home_odds)`,
          openingAwayOdds: sql`COALESCE(${gamesTable.openingAwayOdds}, EXCLUDED.opening_away_odds)`,
          // Phase 2: always refreshed
          homeStarterName:     starters.home?.name ?? null,
          homeStarterEra:      starters.home?.seasonEra ?? null,
          homeStarterWhip:     starters.home?.seasonWhip ?? null,
          homeStarterRecentEra: starters.home?.recentEra ?? null,
          homeStarterHand:     starters.home?.pitchHand ?? null,
          awayStarterName:     starters.away?.name ?? null,
          awayStarterEra:      starters.away?.seasonEra ?? null,
          awayStarterWhip:     starters.away?.seasonWhip ?? null,
          awayStarterRecentEra: starters.away?.recentEra ?? null,
          awayStarterHand:     starters.away?.pitchHand ?? null,
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
            game.sport === "WNBA" ? homeWnbaInjury?.impactScore ?? null : null,
          awayInjuryImpact:
            game.sport === "NFL"  ? awayInjury.impactScore :
            game.sport === "WNBA" ? awayWnbaInjury?.impactScore ?? null : null,
          homeKeyInjuries:
            game.sport === "NFL"  ? JSON.stringify(homeInjury.keyInjuries) :
            game.sport === "WNBA" ? JSON.stringify(homeWnbaInjury?.keyInjuries ?? []) : null,
          awayKeyInjuries:
            game.sport === "NFL"  ? JSON.stringify(awayInjury.keyInjuries) :
            game.sport === "WNBA" ? JSON.stringify(awayWnbaInjury?.keyInjuries ?? []) : null,
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

    // Legacy projections remain research/gradeable evidence only after the V4
    // cutover.  They must never be promoted into the official publication
    // pipeline; V4 has its own immutable forecast ledger and publication seam.
    const servingBoundary = await resolveProductionPredictionBoundary(game, proj, decisionContext);
    if (shouldRunIncumbentSnapshot(servingBoundary)) {
      const predictionId = await processGameSnapshot(game, servingBoundary.projection, decisionContext, {
        odds: gameOdds,
        homeTeamStats,
        awayTeamStats,
        homeDbStats,
        awayDbStats,
      }, false);
    }

    upserted++;
    sports.add(game.sport);
  }

  // Do not feed incumbent/legacy snapshots into official publication.  This is
  // an intentional V4-only cutover boundary, not a fallback condition.

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

  // Recover any past-date games still stuck in a non-final status (handles
  // the case where the server was down / restarted after games finished)
  await recoverStaleGames();

  // Ensure game_results rows exist for every game already marked "final"
  await syncGameResults();

  // Grade any picks that now have a completed game result
  const picksGraded = await runGrading();
  // Only learn from a completed grade, never from the mutable game outcome.
  await runLearning();
    // Forecast-only reviews use the same immutable snapshots but are kept out
    // of subscriber-pick learning and model-weight updates.
    await runForecastReviews();

  lastRefreshedAt = new Date();
  logger.info(
    { upserted, sports: [...sports], picksGraded },
    "Games refresh complete",
  );
  return { gamesUpdated: upserted, sportsRefreshed: [...sports], picksGraded };
}

let refreshInFlight: ReturnType<typeof refreshAll> | null = null;

async function refreshStaleGamesOnce(): Promise<void> {
  if (!isStale()) return;

  if (!refreshInFlight) {
    refreshInFlight = refreshAll().finally(() => {
      refreshInFlight = null;
    });
  }

  await refreshInFlight;
}

/**
 * GET /api/games/today
 * Auto-refreshes from ESPN when data is stale (>30 minutes old).
 * Optional ?sport=NFL query param for server-side filtering.
 *
 * Subscriber gating:
 *   - Pro subscribers receive full model projections for all games.
   *   - Non-subscribers receive the one server-selected, persisted free pick.
 */
router.get("/games/today", resolveSubscriberStatus, rejectInvalidToken, async (req, res): Promise<void> => {
  // This response differs by bearer token and subscription status. Never let a
  // browser/CDN reuse a pre-purchase locked response after entitlement changes.
  res.set("Cache-Control", "private, no-store");
  res.set("Vary", "Authorization");

  if (isStale()) {
    try {
      await refreshStaleGamesOnce();
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
    // Resolve every effective downstream decision. Private/cap-excluded model
    // opinions are forced to Neutral in subscriber payloads rather than
    // resurrecting the mutable games-table recommendation.
    db
      .select({
        gameId: publishedPicksTable.gameId,
        market: publishedPicksTable.market,
        selection: publishedPicksTable.selection,
        recommendation: publishedPicksTable.recommendation,
        isPublic: publishedPicksTable.isPublic,
        publicationStatus: sql<string | null>`publication_status`,
        publicationReason: sql<string | null>`publication_reason_code`,
        globalRank: sql<number | null>`global_rank`,
        selectedSideEdge: sql<number | null>`selected_side_edge`,
        requestedUnits: sql<number | null>`requested_units`,
        approvedUnits: sql<number | null>`approved_units`,
        stakePolicyVersion: sql<string | null>`stake_policy_version`,
      })
      .from(publishedPicksTable)
      .where(
        and(
          sql`DATE(${publishedPicksTable.publishedAt} AT TIME ZONE 'America/New_York') = ${today}::date`,
          eq(publishedPicksTable.isEffective, true),
        ),
      ),
  ]);
  const liveGamesCount = liveGamesRows.length;

  const publicationDecisionMap = new Map(
    todayPickRows.map((pick) => [`${pick.gameId}:${pick.market}`, pick]),
  );

  /**
   * Apply the immutable downstream decision. The forecast recommendation is
   * preserved separately, while only globally approved public picks retain an
   * actionable subscriber recommendation and approved stake.
   */
  function applyPublishedRatings<T extends AnyGame>(games: T[]): T[] {
    return games.map((g) => {
      const gameId = g["id"] as string;
      const decision = publicationDecisionMap.get(`${gameId}:moneyline`);
      const spreadDecision = publicationDecisionMap.get(`${gameId}:spread`);
      if (!decision) {
        return {
          ...g,
          valueRating: "Neutral",
          units: 0,
          spreadIsPublic: spreadDecision?.isPublic === true,
          spreadPublicationStatus: spreadDecision?.publicationStatus,
          spreadApprovedUnits: spreadDecision?.approvedUnits,
          spreadPublishedSelection: spreadDecision?.selection,
        };
      }
      return {
        ...g,
        modelRecommendation: decision.recommendation,
        valueRating: decision.isPublic && Number(decision.approvedUnits) === 1
          ? decision.recommendation : "Neutral",
        units: decision.isPublic && Number(decision.approvedUnits) === 1 ? 1 : 0,
        publicationStatus: decision.publicationStatus,
        publicationReason: decision.publicationReason,
        isPublic: decision.isPublic,
        globalRank: decision.globalRank,
        selectedSideEdge: decision.selectedSideEdge,
        requestedUnits: decision.requestedUnits,
        approvedUnits: decision.approvedUnits,
        stakePolicyVersion: decision.stakePolicyVersion,
        spreadIsPublic: spreadDecision?.isPublic === true,
        spreadPublicationStatus: spreadDecision?.publicationStatus,
        spreadApprovedUnits: spreadDecision?.approvedUnits,
        spreadPublishedSelection: spreadDecision?.selection,
      };
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

    const selectedGames = await attachMarketSelection(applyPublishedRatings(games as AnyGame[]));
    res.json({
      games: selectedGames.map(stripInternalDiagnostics),
      lastUpdated: (lastRefreshedAt ?? new Date()).toISOString(),
      totalGames: games.length,
      liveGamesCount,
      isSubscribed: true,
    });
    return;
  }

  // Non-subscribers: resolve the slate-level persisted selection before a
  // sport filter is applied. A filter can never mint an additional free pick.
  const allTodayGames = await db
    .select()
    .from(gamesTable)
    .where(and(eq(gamesTable.gameDate, today), eq(gamesTable.status, "upcoming")))
    .orderBy(desc(gamesTable.modelScore));

  const ratedGames = await attachMarketSelection(applyPublishedRatings(allTodayGames as AnyGame[]));
  const freePick = await getDailyFreePick(today);

  // Apply lock state across the full slate, then sport-filter for the response
  const gatedAll = ratedGames.map((game) => {
    return lockGame(game);
  });

  const filtered =
    typeof sport === "string" && sport !== "All"
      ? gatedAll.filter((g) => g["sport"] === sport)
      : gatedAll;

  res.json({
    games: filtered.map(stripInternalDiagnostics),
    lastUpdated: (lastRefreshedAt ?? new Date()).toISOString(),
    totalGames: filtered.length,
    liveGamesCount,
    isSubscribed: false,
    // This separately allowlisted DTO is the only non-Pro pick disclosure.
    // All game rows remain schedule-only locked cards.
    freePick: freePick ?? null,
    freePickPublishedPickId: freePick?.publishedPickId ?? null,
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
