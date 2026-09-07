import { describe, expect, it } from "vitest";
import { NCAAF_V4_CANONICAL_BASELINE_D } from "./ncaafV4DistinctChallenger";
import { classifyV4MarketIdentity, easternDayBounds, isNcaafV4PredictionWriteEligible, mayPersistNcaafV4GameDayDate, ncaafV4MarketHealth, ncaafV4SnapshotSetFingerprint, normalNcaafV4GameDayDate, predictFrozenNcaafV4, safeCurrentMarketSnapshot, twoWayNoVig } from "./ncaafV4GameDay";

const features: any = {
  home: { seasonToDate: { games: 3, offensePointsPerGame: 30, defensePointsAllowedPerGame: 20 }, priorSeason: { offensePointsPerGame: 28, defensePointsAllowedPerGame: 23 } },
  away: { seasonToDate: { games: 3, offensePointsPerGame: 24, defensePointsAllowedPerGame: 25 }, priorSeason: { offensePointsPerGame: 25, defensePointsAllowedPerGame: 26 } },
  elo: { difference: 50 }, context: { homeField: true },
};
const input: any = { stableGameId: "espn:123", season: 2026, week: 2, kickoffAt: "2026-09-06T17:00:00.000Z", featureCutoff: "2026-09-06T12:00:00.000Z", features, checksum: "feature-proof", sourceAudit: {} };
const market = (overrides: Partial<any> = {}) => ({
  gameEvidenceId: 1, marketKey: "h2h", selection: "Home", price: -110, line: null,
  bookmakerProviderId: "book", bookmakerName: "Book", capturedAt: new Date(), isMatchedToGame: true, marketIdentityStatus: "matched_exact", ...overrides,
});

describe("NCAAF V4 game-day primitives", () => {
  it("uses only frozen Baseline D parameters and emits immutable identity", () => {
    const first = predictFrozenNcaafV4(input), second = predictFrozenNcaafV4(input);
    expect(first.predictionId).toBe(second.predictionId);
    expect(first.diagnostics).toMatchObject({
      configurationHash: NCAAF_V4_CANONICAL_BASELINE_D.configurationHash,
      parameterHash: NCAAF_V4_CANONICAL_BASELINE_D.parameterHash,
    });
    expect(first.homeWinProbability + first.awayWinProbability).toBeCloseTo(1, 12);
    expect(first.expectedHomePoints).toBeGreaterThan(0);
    expect(first.probabilityHomeCovers(-7.5)).toBeLessThan(first.probabilityHomeCovers(3.5));
  });

  it("removes two-way vig without accepting invalid prices", () => {
    const noVig = twoWayNoVig(-110, -110)!;
    expect(noVig.first).toBeCloseTo(.5, 12);
    expect(noVig.first + noVig.second).toBeCloseTo(1, 12);
  });

  it("only permits explicit safe market identity classifications", () => {
    expect(classifyV4MarketIdentity(market())).toBe("EXACT_CANONICAL_MATCH");
    expect(classifyV4MarketIdentity(market({ marketIdentityStatus: "matched_alias" }))).toBe("SAFE_TEAM_TIME_MATCH");
    expect(classifyV4MarketIdentity(market({ isMatchedToGame: false, marketIdentityStatus: "unmatched_ambiguous" }))).toBe("AMBIGUOUS");
    expect(classifyV4MarketIdentity(market({ isMatchedToGame: false, marketIdentityStatus: "unmatched_identity" }))).toBe("UNMATCHED");
    expect(classifyV4MarketIdentity(market({ marketIdentityStatus: "unknown" }))).toBe("UNMATCHED");
  });

  it("uses an exact DST-safe Eastern calendar window", () => {
    const normal = easternDayBounds("2026-09-06");
    expect(normal.start.toISOString()).toBe("2026-09-06T04:00:00.000Z");
    expect(normal.end.toISOString()).toBe("2026-09-07T04:00:00.000Z");
    const fallback = easternDayBounds("2026-11-01");
    expect(fallback.end.getTime() - fallback.start.getTime()).toBe(25 * 60 * 60_000);
  });

  it("defaults normal execution to the current Eastern date and never permits future persistence", () => {
    const now = new Date("2026-11-01T04:30:00.000Z"); // Nov 1, 00:30 EDT
    expect(normalNcaafV4GameDayDate(now)).toBe("2026-11-01");
    expect(mayPersistNcaafV4GameDayDate("2026-11-01", now)).toBe(true);
    expect(mayPersistNcaafV4GameDayDate("2026-11-02", now)).toBe(false);
  });
  it("rejects a write that races past kickoff even when the request began pre-kickoff", () => {
    const requestStartedAt = new Date("2026-09-06T16:59:59.000Z");
    const kickoffAt = new Date("2026-09-06T17:00:00.000Z");
    expect(isNcaafV4PredictionWriteEligible("2026-09-06", kickoffAt, requestStartedAt)).toBe(true);
    expect(isNcaafV4PredictionWriteEligible("2026-09-06", kickoffAt, new Date("2026-09-06T17:00:01.000Z"))).toBe(false);
  });
  it("changes the sports fingerprint for a replacement or additional selected snapshot", () => {
    const base = { id: 1, schemaVersion: "v1", targetProvider: "espn", targetEventId: "one", kickoffAt: new Date("2026-09-06T17:00:00Z"), dataCutoffAt: new Date("2026-09-06T12:00:00Z"), inputHash: "a" };
    expect(ncaafV4SnapshotSetFingerprint([base])).not.toBe(ncaafV4SnapshotSetFingerprint([{ ...base, id: 2, inputHash: "replacement" }]));
    expect(ncaafV4SnapshotSetFingerprint([base])).not.toBe(ncaafV4SnapshotSetFingerprint([base, { ...base, id: 3, targetEventId: "two" }]));
  });

  it("reports grouped fail-closed market health without counting stale or rejected rows as safe", () => {
    const now = new Date("2026-09-06T16:05:00Z");
    const rows = [
      market({ marketIdentityStatus: "matched_exact", capturedAt: new Date("2026-09-06T16:00:00Z") }),
      market({ marketIdentityStatus: "matched_alias", capturedAt: new Date("2026-09-06T16:00:00Z") }),
      market({ isMatchedToGame: false, marketIdentityStatus: "unmatched_ambiguous", capturedAt: new Date("2026-09-06T16:00:00Z") }),
      market({ isMatchedToGame: false, marketIdentityStatus: "unmatched_identity", capturedAt: new Date("2026-09-06T15:00:00Z") }),
    ];
    const health = ncaafV4MarketHealth(rows, [
      { marketMatch: { classification: "EXACT_CANONICAL_MATCH", rootCause: "SAFE_MATCH" } },
      { marketMatch: { classification: "SAFE_TEAM_TIME_MATCH", rootCause: "SAFE_MATCH" } },
      { marketMatch: { classification: "UNMATCHED", rootCause: "STALE_MARKET" } },
    ], now);
    expect(health).toMatchObject({ observationsConsidered: 4, eligibleForecasts: 3, safeMatches: 2, unmatchedGames: 1, ambiguousGames: 0, staleGames: 1, rejectedGames: 0 });
    expect(health.safeMatchRate).toBeCloseTo(2 / 3);
  });

  it("rejects wrong-game, stale, ambiguous, and neutral-site-unsafe markets", () => {
    const kickoff = new Date("2026-09-06T17:00:00Z");
    const game = { id: 1, homeTeamName: "Home State", awayTeamName: "Away U", kickoffAt: kickoff, neutralSite: false };
    const payload = { event: { sport_key: "americanfootball_ncaaf", home_team: "Home State", away_team: "Away U", commence_time: kickoff.toISOString() } };
    const rows = ["h2h", "spreads", "totals"].map((marketKey) => market({ marketKey, payload, capturedAt: new Date("2026-09-06T16:00:00Z") }));
    const safe = safeCurrentMarketSnapshot(rows, game, new Date("2026-09-06T16:05:00Z"));
    expect(safe.rootCause).toBe("SAFE_MATCH");
    expect(safe.rows).toHaveLength(3);
    expect(safeCurrentMarketSnapshot(rows.map(x => ({ ...x, payload: { event: { ...payload.event, away_team: "Wrong U" } } })), game, new Date("2026-09-06T16:05:00Z")).classification).toBe("UNMATCHED");
    expect(safeCurrentMarketSnapshot(rows.map(x => ({ ...x, capturedAt: new Date("2026-09-06T15:00:00Z") })), game, new Date("2026-09-06T16:00:01Z")).rootCause).toBe("STALE_MARKET");
    expect(safeCurrentMarketSnapshot(rows.map(x => ({ ...x, marketIdentityStatus: "unmatched_ambiguous", isMatchedToGame: false })), game, new Date("2026-09-06T16:05:00Z")).rootCause).toBe("AMBIGUOUS_MATCH");
    expect(safeCurrentMarketSnapshot(rows, { ...game, neutralSite: true }, new Date("2026-09-06T16:05:00Z")).classification).toBe("UNMATCHED");
  });
});