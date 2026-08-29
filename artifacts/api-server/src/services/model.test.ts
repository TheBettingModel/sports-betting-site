import { describe, expect, it } from "vitest";
import { computeProjection, computeWnbaContextContributions, SPORT_DEFAULT_WEIGHTS, removeVig2, type ComputeOptions } from "./model";
import { selectActionableMoneylineMarket } from "./oddsApi";
import type { WnbaGameContext } from "./wnbaContext";
import type { DbTeamStats } from "./teamStats";

const ncaafStats = (overrides: Partial<DbTeamStats> = {}): DbTeamStats => ({
  teamId: "team",
  sport: "NCAAF",
  scoredPerGame: 35,
  allowedPerGame: 17,
  scoreDifferential: 18,
  pythagoreanWinPct: 0.8,
  last5WinPct: 0.8,
  last10WinPct: 0.8,
  last5ScoreDiff: 18,
  last10ScoreDiff: 18,
  restDays: 7,
  sampleSize: 4,
  ...overrides,
});

const wnbaContext = (overrides: Partial<WnbaGameContext> = {}): WnbaGameContext => ({
  capturedAt: "2026-06-01T00:00:00.000Z",
  sourceSeason: 2026,
  home: {
    stats: {
      teamId: "home", ppg: 85, efgPercent: .52, trueShootingPercent: .60, paceApprox: 80,
      offensiveRating: 112, defensiveRating: 100, netRating: 12, turnoverPercent: .12,
      assistPercent: .6, orebPg: 9, threePointRate: .4, threePointPct: .36, ftRate: .25,
      ftPct: .8, spg: 7, bpg: 4, drebPg: 25, last5WinPct: .6, last10WinPct: .6,
      last5PointDiff: 4, last10PointDiff: 4, restDays: 2,
    },
    availability: { impactScore: 0, keyInjuries: [] },
    schedule: { restDays: 2, backToBack: false, gamesLast3Days: 1, gamesLast5Days: 2, roadTripLength: 0, priorVenue: null, priorOpponent: null, travelMiles: 100, timezoneShiftHours: 0, evidence: { source: "espn-schedule+static-team-location-map", sourceSeason: 2026, capturedAt: "", stale: false, missing: [] } },
  },
  away: {
    stats: {
      teamId: "away", ppg: 80, efgPercent: .48, trueShootingPercent: .50, paceApprox: 75,
      offensiveRating: 100, defensiveRating: 112, netRating: -12, turnoverPercent: .18,
      assistPercent: .5, orebPg: 7, threePointRate: .25, threePointPct: .3, ftRate: .15,
      ftPct: .75, spg: 5, bpg: 2, drebPg: 20, last5WinPct: .4, last10WinPct: .4,
      last5PointDiff: -4, last10PointDiff: -4, restDays: 1,
    },
    availability: { impactScore: -.07, keyInjuries: [] },
    schedule: { restDays: 0, backToBack: true, gamesLast3Days: 3, gamesLast5Days: 4, roadTripLength: 3, priorVenue: null, priorOpponent: null, travelMiles: 2000, timezoneShiftHours: 3, evidence: { source: "espn-schedule+static-team-location-map", sourceSeason: 2026, capturedAt: "", stale: false, missing: [] } },
  },
  matchup: {
    pace: { home: 80, away: 75, missing: false }, perimeter: { home: .4, away: .25, missing: false },
    reboundingInteriorProxy: { home: 38, away: 29, missing: false }, turnover: { home: .12, away: .18, missing: false },
    freeThrow: { home: .25, away: .15, missing: false },
  },
  evidence: { immutable: true, missing: [] },
  ...overrides,
});

describe("two-way market edge safeguards", () => {
  it("removes vig before comparing a model to the home or away market", () => {
    const fair = removeVig2(-120, 100);

    expect(fair.home).toBeCloseTo(0.521739, 5);
    expect(fair.away).toBeCloseTo(0.478261, 5);
    expect(fair.home + fair.away).toBeCloseTo(1, 10);
  });

  it("falls back instead of using implausible market prices", () => {
    const projection = computeProjection(
      "invalid-odds-game",
      "MLB",
      "50-50",
      "50-50",
      null,
      { realVegasHomeOdds: -9_900, realVegasAwayOdds: 3_300 },
    );

    expect(Math.abs(projection.vegasHomeOdds)).toBeLessThanOrEqual(2_000);
    expect(Math.abs(projection.vegasAwayOdds)).toBeLessThanOrEqual(2_000);
    expect(projection.valueRating).toBe("Neutral");
    expect(projection.podScore).toBe(0);
    expect(projection.units).toBe(0);
  });

  it("never publishes a recommendation from a one-sided market", () => {
    const projection = computeProjection(
      "one-sided-odds-game",
      "MLB",
      "100-0",
      "0-100",
      null,
      { realVegasHomeOdds: 130, realVegasAwayOdds: 0 },
    );

    expect(projection.valueRating).toBe("Neutral");
    expect(projection.finalModelScore).toBeLessThanOrEqual(59);
    expect(projection.podScore).toBe(0);
    expect(projection.units).toBe(0);
  });

  it("keeps a conflicting live provider event from being revived by ESPN fallback odds", () => {
    const market = selectActionableMoneylineMarket(
      "MLB",
      { odds: null, marketBlockedByProviderStart: true },
      { homeOdds: -120, awayOdds: 100 },
    );
    const projection = computeProjection(
      "provider-start-conflict",
      "MLB",
      "60-40",
      "40-60",
      null,
      {
        realVegasHomeOdds: market?.homeOdds,
        realVegasAwayOdds: market?.awayOdds,
      },
    );

    expect(market).toBeUndefined();
    expect(projection.valueRating).toBe("Neutral");
    expect(projection.units).toBe(0);
    expect(projection.podScore).toBe(0);
  });

  it("blocks MLB favorites at the approved -160 ceiling", () => {
    const projection = computeProjection(
      "extreme-heavy-chalk-neutral",
      "MLB",
      "100-0",
      "0-100",
      null,
      { realVegasHomeOdds: -160, realVegasAwayOdds: 140 },
    );

    expect(projection.valueRating).toBe("Neutral");
    expect(projection.units).toBe(0);
  });

  it("compresses MLB confidence for incomplete secondary evidence and blocks required evidence failures", () => {
    const fullEvidence = computeProjection(
      "mlb-evidence-compression",
      "MLB",
      "100-0",
      "0-100",
      null,
      { realVegasHomeOdds: 120, realVegasAwayOdds: -140, mlbEvidenceMultiplier: 1 },
    );
    const compressed = computeProjection(
      "mlb-evidence-compression",
      "MLB",
      "100-0",
      "0-100",
      null,
      { realVegasHomeOdds: 120, realVegasAwayOdds: -140, mlbEvidenceMultiplier: 0.6 },
    );
    const blocked = computeProjection(
      "mlb-evidence-blocked",
      "MLB",
      "100-0",
      "0-100",
      null,
      {
        realVegasHomeOdds: 120,
        realVegasAwayOdds: -140,
        mlbRecommendationBlocked: true,
      },
    );

    expect(Math.abs(compressed.homeWinPct - 50)).toBeLessThan(
      Math.abs(fullEvidence.homeWinPct - 50),
    );
    expect(blocked.valueRating).toBe("Neutral");
    expect(blocked.units).toBe(0);
    expect(blocked.podScore).toBe(0);
  });

  it("keeps opening-week NCAAF games at no bet without independent team evidence", () => {
    const projection = computeProjection(
      "NCAAF-opening-week",
      "NCAAF",
      "0-0",
      "0-0",
      null,
      { realVegasHomeOdds: -350, realVegasAwayOdds: 280 },
    );

    expect(Math.abs(projection.edge)).toBeGreaterThan(10);
    expect(projection.valueRating).toBe("Neutral");
    expect(projection.finalModelScore).toBeLessThanOrEqual(59);
    expect(projection.podScore).toBe(0);
    expect(projection.units).toBe(0);
  });

  it("keeps NCAAF at no bet until both teams satisfy the current-season sample", () => {
    const projection = computeProjection(
      "NCAAF-one-sided-evidence",
      "NCAAF",
      "4-0",
      "0-4",
      null,
      {
        realVegasHomeOdds: 110,
        realVegasAwayOdds: -130,
        homeDbStats: ncaafStats(),
      },
    );

    expect(projection.valueRating).toBe("Neutral");
    expect(projection.units).toBe(0);
  });

  it("keeps NCAAF unconditionally Neutral after sufficient challenger evidence", () => {
    const projection = computeProjection(
      "NCAAF-qualified",
      "NCAAF",
      "4-0",
      "0-4",
      null,
      {
        realVegasHomeOdds: 110,
        realVegasAwayOdds: -130,
        homeDbStats: ncaafStats(),
        awayDbStats: ncaafStats({
          teamId: "away",
          scoredPerGame: 14,
          allowedPerGame: 35,
          scoreDifferential: -21,
          pythagoreanWinPct: 0.15,
          last5WinPct: 0.2,
          last10WinPct: 0.2,
          last5ScoreDiff: -21,
          last10ScoreDiff: -21,
        }),
      },
    );

    expect(projection.valueRating).toBe("Neutral");
    expect(projection.units).toBe(0);
  });

  it("uses a ready NCAAF feature probability in the runs model only", () => {
    const ncaafFeatureSnapshot = {
      forecast: { status: "ready", homeWinProbability: 0.73 },
    } as unknown as NonNullable<ComputeOptions["ncaafFeatureSnapshot"]>;
    const ncaaf = computeProjection("feature-ready", "NCAAF", "0-4", "4-0", null, {
      realVegasHomeOdds: 110,
      realVegasAwayOdds: -130,
      ncaafFeatureSnapshot,
    });
    expect(ncaaf.homeWinPct).toBe(71);
    expect(ncaaf.valueRating).toBe("Neutral");
    expect(ncaaf.units).toBe(0);

    const nhlOptions = { realVegasHomeOdds: 110, realVegasAwayOdds: -130 };
    const baseline = computeProjection("cross-sport-ready", "NHL", "3-1", "1-3", null, nhlOptions);
    const withNcaafPayload = computeProjection("cross-sport-ready", "NHL", "3-1", "1-3", null, {
      ...nhlOptions,
      ncaafFeatureSnapshot,
    });
    expect(withNcaafPayload).toEqual(baseline);
  });

  it("does not apply the NCAAF evidence gate to other sports", () => {
    const projection = computeProjection(
      "NHL-no-db-evidence",
      "NHL",
      "10-0",
      "0-10",
      null,
      { realVegasHomeOdds: 110, realVegasAwayOdds: -130 },
    );

    expect(["Buy", "Strong Buy"]).toContain(projection.valueRating);
  });
});

describe("three-way market edge safeguards", () => {
  it("never publishes a recommendation from an incomplete Soccer market", () => {
    const projection = computeProjection(
      "incomplete-soccer-odds",
      "Soccer",
      "20-4-2",
      "5-6-15",
      null,
      { realVegasHomeOdds: 125, realVegasAwayOdds: 220, realVegasDrawOdds: 0 },
    );

    expect(projection.valueRating).toBe("Neutral");
    expect(projection.finalModelScore).toBeLessThanOrEqual(59);
    expect(projection.podScore).toBe(0);
    expect(projection.units).toBe(0);
  });
});

describe("WNBA immutable evidence contributions", () => {
  it("moves toward the better evidenced side while keeping each contribution bounded", () => {
    const contributions = computeWnbaContextContributions(wnbaContext(), SPORT_DEFAULT_WEIGHTS.WNBA!);

    expect(contributions.trueShooting).toBeGreaterThan(0);
    expect(contributions.possessionNetRating).toBeGreaterThan(0);
    expect(contributions.availability).toBeGreaterThan(0);
    expect(contributions.travel).toBeGreaterThan(0);
    expect(Object.values(contributions).every((value) => Math.abs(value) <= .035)).toBe(true);
  });

  it("uses missing WNBA evidence as zero and never applies it to NBA", () => {
    const missing = wnbaContext({
      matchup: {
        pace: { home: null, away: null, missing: true }, perimeter: { home: null, away: null, missing: true },
        reboundingInteriorProxy: { home: null, away: null, missing: true }, turnover: { home: null, away: null, missing: true },
        freeThrow: { home: null, away: null, missing: true },
      },
    });
    expect(computeWnbaContextContributions(missing, SPORT_DEFAULT_WEIGHTS.WNBA!).perimeter).toBe(0);

    const opts = { realVegasHomeOdds: -110, realVegasAwayOdds: -110, wnbaContext: wnbaContext() };
    const wnba = computeProjection("context-league-split", "WNBA", "10-10", "10-10", null, opts);
    const nba = computeProjection("context-league-split", "NBA", "10-10", "10-10", null, opts);
    expect(wnba.homeWinPct).toBeGreaterThan(nba.homeWinPct);
  });
});