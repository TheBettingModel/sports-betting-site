import { describe, expect, it } from "vitest";
import { getSeasonContext } from "./season";

describe("getSeasonContext", () => {
  it.each([
    ["MLB", "2027-04-01", undefined, 2027, "2027-01-01", "2027"],
    ["WNBA", "2027-07-01", undefined, 2027, "2027-03-01", "2027"],
    ["NFL", "2027-01-15", undefined, 2026, "2026-08-01", "2026"],
    ["NCAAF", "2027-09-01", undefined, 2027, "2027-08-01", "2027"],
    ["NBA", "2027-06-01", undefined, 2026, "2026-10-01", "2026"],
    ["NHL", "2027-02-01", undefined, 2026, "2026-10-01", "20262027"],
    ["NCAAB", "2027-03-15", undefined, 2026, "2026-10-01", "2026"],
    ["Soccer", "2027-04-01", "eng.1", 2026, "2026-07-01", "2026"],
    ["Soccer", "2027-08-01", "esp.1", 2027, "2027-07-01", "2027"],
    ["Soccer", "2027-04-01", "mls", 2027, "2027-01-01", "2027"],
  ])(
    "resolves %s on %s",
    (sport, date, league, startYear, startDate, seasonId) => {
      const context = getSeasonContext(sport, date, league);
      expect(context.startYear).toBe(startYear);
      expect(context.startDate).toBe(startDate);
      expect(context.seasonId).toBe(seasonId);
    },
  );

  it("uses exact boundary dates for split-year seasons", () => {
    expect(getSeasonContext("NBA", "2027-09-30").startYear).toBe(2026);
    expect(getSeasonContext("NBA", "2027-10-01").startYear).toBe(2027);
    expect(getSeasonContext("NFL", "2027-07-31").startYear).toBe(2026);
    expect(getSeasonContext("NFL", "2027-08-01").startYear).toBe(2027);
  });
});
