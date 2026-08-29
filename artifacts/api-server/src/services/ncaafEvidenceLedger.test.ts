import { describe, expect, it } from "vitest";
import {
  isEvidenceAvailableAsOf,
  assertPregameEvidenceCutoff,
  evidenceIdempotencyKey,
  isWithinNcaafSeason,
  ncaafSeasonForDate,
  ncaafBackfillCalendarDates,
  normalizeOddsApiMarkets,
  normalizeEspnGameEvidence,
  stablePayloadHash,
  selectCurrentNcaafOddsForCapture,
  summarizeNcaafCoverage,
} from "./ncaafEvidenceLedger";

describe("NCAAF evidence ledger helpers", () => {
  it("builds a stable idempotency key for equivalent provider payloads", () => {
    expect(stablePayloadHash({ b: [2, 1], a: { z: true } }))
      .toBe(stablePayloadHash({ a: { z: true }, b: [2, 1] }));
    expect(evidenceIdempotencyKey("espn", "1", { b: 2, a: 1 }))
      .toBe(evidenceIdempotencyKey("espn", "1", { a: 1, b: 2 }));
    expect(evidenceIdempotencyKey("espn", "1", { a: 1 }, "v1"))
      .not.toBe(evidenceIdempotencyKey("espn", "1", { a: 1 }, "v2"));
  });

  it("preserves exact UTC calendar dates when constructing Eastern backfills", () => {
    expect(ncaafBackfillCalendarDates(
      new Date("2025-08-29T00:00:00Z"),
      new Date("2025-08-29T00:00:00Z"),
    )).toEqual(["2025-08-29"]);
    expect(ncaafBackfillCalendarDates(
      new Date("2025-08-29T00:00:00Z"),
      new Date("2025-08-31T00:00:00Z"),
    )).toEqual(["2025-08-29", "2025-08-30", "2025-08-31"]);
  });

  it("preserves partial markets rather than fabricating missing prices", () => {
    const rows = normalizeOddsApiMarkets({
      id: "odds-1", home_team: "Home", away_team: "Away", commence_time: "2025-09-06T18:00:00Z",
      bookmakers: [{ key: "book", title: "Book", markets: [{
        key: "h2h", outcomes: [{ name: "Home", price: -110 }, { name: "Away", price: Number.NaN }],
      }] }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ price: null, missing: { fields: ["price"] } });
    expect(rows[0]).toMatchObject({ line: null, observationPhase: "current" });
  });

  it("retains upcoming in-season odds and preserves successive price observations", () => {
    const first = {
      id: "future-1",
      home_team: "Home",
      away_team: "Away",
      commence_time: "2025-09-13T18:00:00Z",
      bookmakers: [{ key: "book", title: "Book", markets: [{
        key: "h2h",
        outcomes: [{ name: "Home", price: -110 }, { name: "Away", price: -110 }],
      }] }],
    };
    const second = {
      ...first,
      bookmakers: [{ key: "book", title: "Book", markets: [{
        key: "h2h",
        outcomes: [{ name: "Home", price: -125 }, { name: "Away", price: 105 }],
      }] }],
    };
    expect(selectCurrentNcaafOddsForCapture([first], 2025)).toEqual([first]);
    const firstMarket = normalizeOddsApiMarkets(first)[0];
    const secondMarket = normalizeOddsApiMarkets(second)[0];
    expect(firstMarket.price).toBe(-110);
    expect(secondMarket.price).toBe(-125);
    expect(stablePayloadHash(firstMarket.payload)).not.toBe(stablePayloadHash(secondMarket.payload));
  });

  it("retains enriched scoreboard evidence in normalized game fields", () => {
    const game = {
      espnId: "NCAAF-1", sport: "NCAAF", homeTeamAbbr: "H", homeTeamName: "Home", awayTeamAbbr: "A",
      awayTeamName: "Away", homeTeamRecord: "1-0", awayTeamRecord: "0-1", gameTime: "Noon ET",
      gameDate: "2025-09-06", commenceTimeISO: "2025-09-06T16:00:00Z", status: "final" as const,
      homeScore: 31, awayScore: 24, week: 2, neutralSite: true, venueId: "venue-1",
      homeConferenceId: "1", awayConferenceId: "2", homeHalftimeScore: 14, awayHalftimeScore: 10, isOvertime: true,
    };
    expect(normalizeEspnGameEvidence(game, new Date("2025-09-07T00:00:00Z"), new Date("2025-09-07T00:00:00Z")))
      .toMatchObject({ week: 2, neutralSite: true, venueId: "venue-1", homeConferenceId: "1",
        awayConferenceId: "2", homeHalftimeScore: 14, awayHalftimeScore: 10, isOvertime: true,
        gameStatus: "final", homeScore: 31, awayScore: 24 });
  });

  it("keeps evidence only at or before a cutoff", () => {
    const modeledDate = new Date("2025-09-06T12:00:00Z");
    expect(isEvidenceAvailableAsOf({
      season: 2025, kickoffAt: modeledDate, capturedAt: new Date("2025-09-06T10:00:00Z"), modeledAsOf: new Date("2025-09-06T10:00:00Z"),
    }, new Date("2025-09-06T11:00:00Z"))).toBe(true);
    expect(isEvidenceAvailableAsOf({
      season: 2025, kickoffAt: modeledDate, capturedAt: new Date("2025-09-06T12:00:00Z"), modeledAsOf: new Date("2025-09-06T10:00:00Z"),
    }, new Date("2025-09-06T11:00:00Z"))).toBe(false);
  });

  it("rejects a post-kickoff cutoff before a historical read can leak results", () => {
    const kickoff = new Date("2025-09-06T16:00:00Z");
    expect(() => assertPregameEvidenceCutoff(
      kickoff,
      new Date("2025-09-06T15:59:59Z"),
    )).not.toThrow();
    expect(() => assertPregameEvidenceCutoff(
      kickoff,
      new Date("2025-09-06T20:00:00Z"),
    )).toThrow("must be before the modeled kickoff");
    expect(() => assertPregameEvidenceCutoff(
      kickoff,
      kickoff,
    )).toThrow("must be before the modeled kickoff");
    expect(() => isEvidenceAvailableAsOf({
      season: 2025,
      kickoffAt: kickoff,
      capturedAt: new Date("2025-09-06T16:00:00Z"),
      modeledAsOf: new Date("2025-09-06T16:00:00Z"),
    }, new Date("2025-09-06T20:00:00Z")))
      .toThrow("must be before the modeled kickoff");
  });

  it("uses August-to-July NCAAF season boundaries", () => {
    expect(ncaafSeasonForDate("2025-08-01")).toBe(2025);
    expect(ncaafSeasonForDate("2026-01-12")).toBe(2025);
    expect(isWithinNcaafSeason("2026-07-31", 2025)).toBe(true);
    expect(isWithinNcaafSeason("2026-08-01", 2025)).toBe(false);
  });

  it("adds coverage without treating unmatched markets as matched", () => {
    expect(summarizeNcaafCoverage([
      { status: "completed", coverage: { games: 2, markets: 8, matchedMarkets: 6, unmatchedMarkets: 2 } },
      { status: "partial", coverage: { games: 1, markets: 1, matchedMarkets: 0, unmatchedMarkets: 1 } },
    ])).toMatchObject({ runs: 2, completed: 1, partial: 1, games: 3, markets: 9, matchedMarkets: 6, unmatchedMarkets: 3 });
  });
});