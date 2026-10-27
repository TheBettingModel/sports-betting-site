import { describe, expect, it } from "vitest";
import {
  decideCreditReservation, isFreshCreditCache, oddsCollectionInterval,
  ODDS_CREDIT_POLICY as policy, parseProviderUsage, utcCreditPeriod,
} from "./oddsCreditPolicy";

describe("Odds API calendar and credit policy", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const usage = { used: 0, remaining: 100_000 };
  it("uses UTC calendar resets, not invoices or Eastern DST", () => {
    expect(utcCreditPeriod(new Date("2026-10-31T23:59:59Z")))
      .toEqual({ month: "2026-10-01", day: "2026-10-31" });
    expect(utcCreditPeriod(new Date("2026-11-01T00:00:00Z")))
      .toEqual({ month: "2026-11-01", day: "2026-11-01" });
    expect(utcCreditPeriod(new Date("2026-12-31T23:59:00-05:00")))
      .toEqual({ month: "2027-01-01", day: "2027-01-01" });
    expect(() => utcCreditPeriod(new Date(NaN))).toThrow();
  });
  it("counts three markets times two regions, not one credit per HTTP request", () => {
    expect(policy.requestCredits).toBe(6);
    expect(decideCreditReservation({ used: 12, outstanding: 0, dayUsed: 12 }, usage, now))
      .toMatchObject({ allowed: true, nextUsed: 18, nextDayUsed: 18 });
  });
  it("honors provider depletion and all earlier account usage", () => {
    expect(decideCreditReservation(
      { used: 0, outstanding: 0, dayUsed: 0 }, { used: 100_000, remaining: 0 }, now,
    )).toMatchObject({ allowed: false, reason: "MONTHLY_LIMIT" });
    expect(decideCreditReservation(
      { used: 0, outstanding: 0, dayUsed: 0 }, { used: 79_998, remaining: 20_002 }, now,
    ).allowed).toBe(false);
  });
  it("keeps outstanding/unknown requests reserved and never lowers local usage", () => {
    expect(decideCreditReservation(
      { used: 79_998, outstanding: 0, dayUsed: 0 }, usage, now,
    ).allowed).toBe(false);
    expect(decideCreditReservation(
      { used: 100, outstanding: 12, dayUsed: 0 }, { used: 200, remaining: 99_800 }, now,
    ).nextUsed).toBe(218);
  });
  it("paces the allowance through the day with bounded bootstrap headroom", () => {
    expect(decideCreditReservation(
      { used: 120, outstanding: 0, dayUsed: 120 }, usage, new Date("2026-11-01T00:00:00Z"),
    )).toMatchObject({ allowed: false, reason: "DAILY_PACING", pacedAllowance: 120 });
    expect(decideCreditReservation(
      { used: 120, outstanding: 0, dayUsed: 120 }, usage, new Date("2026-11-01T01:00:00Z"),
    ).allowed).toBe(true);
  });
  it("stops at the daily limit and does not start requests across midnight", () => {
    expect(decideCreditReservation(
      { used: 2496, outstanding: 0, dayUsed: 2496 }, usage, new Date("2026-11-01T23:58:00Z"),
    )).toMatchObject({ allowed: false, reason: "DAILY_LIMIT" });
    expect(decideCreditReservation(
      { used: 0, outstanding: 0, dayUsed: 0 }, usage, new Date("2026-11-30T23:59:00Z"),
    )).toMatchObject({ allowed: false, reason: "RESET_WINDOW" });
  });
  it("cannot exhaust a 100K allowance in 28, 29, 30 or 31 days", () => {
    for (const days of [28, 29, 30, 31]) {
      let spent = 0;
      for (let day = 1; day <= days; day++) {
        let dayUsed = 0;
        const date = new Date(Date.UTC(2026, 0, day, 23, 58));
        for (let request = 0; request < 1_000; request++) {
          const result = decideCreditReservation(
            { used: spent, outstanding: 0, dayUsed }, { used: spent, remaining: 100_000 - spent }, date,
          );
          if (result.allowed) { spent = result.nextUsed; dayUsed = result.nextDayUsed; }
        }
        expect(dayUsed).toBeLessThanOrEqual(2500);
      }
      expect(spent).toBeLessThanOrEqual(77_500);
      expect(100_000 - spent).toBeGreaterThanOrEqual(22_500);
    }
  });
  it("rejects missing, invalid and unsafe accounting numbers", () => {
    for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => decideCreditReservation({ used: value, outstanding: 0, dayUsed: 0 }, usage, now)).toThrow();
    }
    for (const value of ["", "-1", "1.5", "NaN", "9007199254740992"]) {
      expect(() => parseProviderUsage(new Headers({
        "x-requests-used": value, "x-requests-remaining": "100",
      }))).toThrow();
    }
    expect(() => parseProviderUsage(new Headers())).toThrow();
    expect(parseProviderUsage(new Headers({
      "x-requests-used": "0", "x-requests-remaining": "100000",
    }))).toEqual(usage);
  });
  it("collects near starts every 15 minutes and distant/empty feeds hourly", () => {
    expect(oddsCollectionInterval([{ commence_time: "2026-11-01T14:00:00Z" }], now)).toBe(900_000);
    for (const events of [[], [{ commence_time: "2026-11-02T12:00:00Z" }],
      [{ commence_time: now.toISOString() }], [{ commence_time: "bad" }], [null]]) {
      expect(oddsCollectionInterval(events, now)).toBe(3_600_000);
    }
  });
  it("never treats a future or 30-minute-old receipt as actionable", () => {
    expect(isFreshCreditCache(new Date(now.getTime() - 29 * 60_000), now)).toBe(true);
    expect(isFreshCreditCache(new Date(now.getTime() - 30 * 60_000), now)).toBe(false);
    expect(isFreshCreditCache(new Date(now.getTime() + 1), now)).toBe(false);
    expect(isFreshCreditCache(new Date(NaN), now)).toBe(false);
  });
});
