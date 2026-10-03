import { describe, expect, it } from "vitest";
import { ACTIVE_PRODUCT_SPORTS } from "./sportScope";
import {
  buildMarketAnalyticsHistories,
  retainComparableHistory,
  type MarketAnalyticsHistoryPoint,
  type MarketAnalyticsSnapshotRow,
} from "./marketAnalyticsHistory";

const now = new Date("2026-09-16T12:00:00.000Z");

function point(
  sportsbook: string,
  selection: "home" | "away",
  minute: number,
): MarketAnalyticsHistoryPoint {
  return {
    sportsbook,
    selection,
    price: -100 - minute,
    capturedAt: `2026-09-16T12:${String(minute).padStart(2, "0")}:00.000Z`,
  };
}

function snapshot(
  overrides: Partial<MarketAnalyticsSnapshotRow> = {},
): MarketAnalyticsSnapshotRow {
  return {
    gameId: "game-1",
    selection: "home",
    price: -110,
    capturedAt: new Date("2026-09-16T11:00:00.000Z"),
    sportsbook: "Pinnacle",
    sportsbookKey: "pinnacle",
    isSharp: true,
    source: "odds-api",
    providerEventId: "provider-event-1",
    marketStatus: "open",
    isAvailable: true,
    isStale: false,
    isActive: true,
    startsAt: new Date("2026-09-16T13:00:00.000Z"),
    ...overrides,
  };
}

describe("retainComparableHistory", () => {
  it("preserves comparable history per sportsbook and selection on a broad market", () => {
    const rows: MarketAnalyticsHistoryPoint[] = [];
    for (let book = 0; book < 32; book += 1) {
      rows.push(point(`Book ${book}`, "home", 1));
      rows.push(point(`Book ${book}`, "away", 2));
      rows.push(point(`Book ${book}`, "home", 3));
      rows.push(point(`Book ${book}`, "away", 4));
    }

    const retained = retainComparableHistory(rows);

    expect(retained).toHaveLength(128);
    expect(retained.filter((row) => row.sportsbook === "Book 17" && row.selection === "home"))
      .toHaveLength(2);
    expect(retained.filter((row) => row.sportsbook === "Book 17" && row.selection === "away"))
      .toHaveLength(2);
  });

  it("keeps the first observation plus the newest two in each comparable group", () => {
    const retained = retainComparableHistory([
      point("Pinnacle", "home", 1),
      point("Pinnacle", "home", 2),
      point("Pinnacle", "home", 3),
      point("Pinnacle", "home", 4),
    ]);

    expect(retained.map((row) => row.capturedAt)).toEqual([
      "2026-09-16T12:01:00.000Z",
      "2026-09-16T12:03:00.000Z",
      "2026-09-16T12:04:00.000Z",
    ]);
  });

  it("does not duplicate the first observation when a group has only three rows", () => {
    const retained = retainComparableHistory([
      point("Pinnacle", "home", 1),
      point("Pinnacle", "home", 2),
      point("Pinnacle", "home", 3),
    ]);

    expect(retained.map((row) => row.capturedAt)).toEqual([
      "2026-09-16T12:01:00.000Z",
      "2026-09-16T12:02:00.000Z",
      "2026-09-16T12:03:00.000Z",
    ]);
  });

  it("drops anonymous quotes because they cannot form same-book evidence", () => {
    expect(retainComparableHistory([
      { ...point("ignored", "home", 1), sportsbook: null },
      { ...point("ignored", "home", 2), sportsbook: null },
    ])).toEqual([]);
  });
});

describe("buildMarketAnalyticsHistories", () => {
  it.each([...ACTIVE_PRODUCT_SPORTS])("preserves real, chronological public/sharp pairs for %s", sport => {
    const rows = [false, true].flatMap(isSharp => [30, 0].map(minute => snapshot({
      gameId: `${sport}-1`, isSharp, sportsbook: isSharp ? "Pinnacle" : "DraftKings",
      sportsbookKey: isSharp ? "pinnacle" : "draftkings", price: -110 - minute,
      capturedAt: new Date(`2026-09-16T11:${String(minute).padStart(2, "0")}:00.000Z`),
    })));
    const history = buildMarketAnalyticsHistories(rows, now).get(`${sport}-1`)!;
    for (const points of [history.marketHistory, history.sharpMoneyHistory]) {
      expect(points).toHaveLength(2);
      expect(points[0]!.capturedAt < points[1]!.capturedAt).toBe(true);
      expect(new Set(points.map(point => point.sportsbook)).size).toBe(1);
      expect(points[1]!.price).toBe(-140);
    }
  });
  it("does not count repeated captures of one provider update as two observations", () => {
    expect(buildMarketAnalyticsHistories([snapshot(), snapshot()], now).get("game-1")?.sharpMoneyHistory).toHaveLength(1);
  });
  it("rejects contradictory prices at the same book/selection/timestamp", () => {
    expect(buildMarketAnalyticsHistories([snapshot(), snapshot({ price: -125 })], now)
      .get("game-1")?.sharpMoneyHistory).toHaveLength(0);
  });
  it("never exposes two different canonical books as a same-display-name movement pair", () => {
    const history = buildMarketAnalyticsHistories([
      snapshot({ sportsbook: "Same", sportsbookKey: "book-a" }),
      snapshot({ sportsbook: "Same", sportsbookKey: "book-b" }),
    ], now).get("game-1")!.sharpMoneyHistory;
    expect(new Set(history.map(point => point.sportsbook)).size).toBe(2);
    expect(history.map(point => point.sportsbook)).toEqual(["Same (book-a)", "Same (book-b)"]);
  });
  it("excludes ESPN consensus and keeps named Odds API public and sharp books separate", () => {
    const histories = buildMarketAnalyticsHistories([
      snapshot({
        sportsbook: "DraftKings",
        sportsbookKey: "draftkings",
        isSharp: false,
        capturedAt: new Date("2026-09-16T10:00:00.000Z"),
      }),
      snapshot({
        sportsbook: "DraftKings",
        sportsbookKey: "draftkings",
        isSharp: false,
        capturedAt: new Date("2026-09-16T11:00:00.000Z"),
      }),
      snapshot({
        source: "espn",
        sportsbook: "ESPN (Consensus)",
        sportsbookKey: "espn",
        isSharp: false,
      }),
      snapshot({ source: "odds-api", sportsbookKey: null }),
      snapshot({
        gameId: "game-2",
        sportsbook: "Pinnacle",
        sportsbookKey: "pinnacle",
        isSharp: true,
        capturedAt: new Date("2026-09-16T10:00:00.000Z"),
      }),
      snapshot({
        gameId: "game-2",
        sportsbook: "Pinnacle",
        sportsbookKey: "pinnacle",
        isSharp: true,
        capturedAt: new Date("2026-09-16T11:00:00.000Z"),
      }),
    ], now);

    expect(histories.get("game-1")).toEqual({
      marketHistory: [
        expect.objectContaining({ sportsbook: "DraftKings", selection: "home" }),
        expect.objectContaining({ sportsbook: "DraftKings", selection: "home" }),
      ],
      sharpMoneyHistory: [],
    });
    expect(histories.get("game-2")).toEqual({
      marketHistory: [],
      sharpMoneyHistory: [
        expect.objectContaining({ sportsbook: "Pinnacle", selection: "home" }),
        expect.objectContaining({ sportsbook: "Pinnacle", selection: "home" }),
      ],
    });
    expect(JSON.stringify([...histories.values()])).not.toContain("ESPN");
  });

  it("retains observations per canonical book key and selection", () => {
    const histories = buildMarketAnalyticsHistories([
      ...[1, 2, 3, 4].map((minute) => snapshot({
        sportsbook: "Shared display name",
        sportsbookKey: "book-a",
        isSharp: false,
        capturedAt: new Date(`2026-09-16T11:${String(minute).padStart(2, "0")}:00.000Z`),
      })),
      ...[5, 6, 7, 8].map((minute) => snapshot({
        sportsbook: "Shared display name",
        sportsbookKey: "book-b",
        isSharp: false,
        capturedAt: new Date(`2026-09-16T11:${String(minute).padStart(2, "0")}:00.000Z`),
      })),
    ], now);

    expect(histories.get("game-1")?.marketHistory).toHaveLength(6);
    expect(histories.get("game-1")?.marketHistory[0]?.capturedAt)
      .toBe("2026-09-16T11:01:00.000Z");
    expect(histories.get("game-1")?.marketHistory[3]?.capturedAt)
      .toBe("2026-09-16T11:05:00.000Z");
  });

  it("fails closed for consensus, invalid, stale, inactive, unavailable, or post-kickoff evidence", () => {
    const invalidRows: Partial<MarketAnalyticsSnapshotRow>[] = [
      { source: "espn" },
      { providerEventId: null },
      { sportsbook: null },
      { sportsbookKey: null },
      { isSharp: null },
      { isActive: false },
      { isAvailable: false },
      { isStale: true },
      { marketStatus: "suspended" },
      { price: -99 },
      { price: 2001 },
      { startsAt: null },
      { startsAt: new Date("2026-09-16T10:00:00.000Z") },
      { capturedAt: new Date("2026-09-16T12:01:00.000Z") },
      { capturedAt: new Date("2026-09-16T13:00:00.000Z") },
    ];

    for (const invalid of invalidRows) {
      expect(buildMarketAnalyticsHistories([snapshot(invalid)], now).size).toBe(0);
    }
  });
});