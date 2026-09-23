import { describe, expect, it } from "vitest";
import { buildMoneylineSnapshotRows, isSharpBookSlug } from "./marketSnapshotCapture";

const now = new Date("2026-09-16T13:30:00.000Z");

describe("market snapshot capture", () => {
  it("classifies Pinnacle and Circa as sharp books consistently", () => {
    expect(isSharpBookSlug("pinnacle")).toBe(true);
    expect(isSharpBookSlug("circasports")).toBe(true);
    expect(isSharpBookSlug("draftkings")).toBe(false);
  });

  it("captures complete two-way quotes for every supported non-soccer sport", () => {
    const rows = buildMoneylineSnapshotRows("MLB", [
      { book: "pinnacle", homeOdds: -112, awayOdds: 102, lastUpdate: "2026-09-16T13:25:00.000Z" },
      { book: "draftkings", homeOdds: -115, awayOdds: 105, lastUpdate: "2026-09-16T13:25:00.000Z" },
    ], now);

    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => row.isSharp)).toHaveLength(2);
    expect(rows.map((row) => row.selection)).toEqual(["home", "away", "home", "away"]);
    expect(rows.every((row) => row.capturedAt.toISOString() === "2026-09-16T13:25:00.000Z")).toBe(true);
  });

  it("requires the draw outcome for soccer quotes", () => {
    const rows = buildMoneylineSnapshotRows("Soccer", [
      { book: "pinnacle", homeOdds: 120, awayOdds: 220, lastUpdate: "2026-09-16T13:25:00.000Z" },
      { book: "circasports", homeOdds: 115, awayOdds: 225, drawOdds: 240, lastUpdate: "2026-09-16T13:25:00.000Z" },
    ], now);

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.sportsbook === "circasports")).toBe(true);
    expect(rows.map((row) => row.selection)).toEqual(["home", "draw", "away"]);
  });

  it("does not persist stale provider quotes as current market evidence", () => {
    const rows = buildMoneylineSnapshotRows("NBA", [
      { book: "pinnacle", homeOdds: -110, awayOdds: -110, lastUpdate: "2026-09-16T12:59:59.999Z" },
      { book: "fanduel", homeOdds: -108, awayOdds: -112 },
    ], now);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.sportsbook === "fanduel")).toBe(true);
  });
});