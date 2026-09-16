import { describe, expect, it } from "vitest";
import {
  retainComparableHistory,
  type MarketAnalyticsHistoryPoint,
} from "./marketAnalyticsHistory";

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

describe("retainComparableHistory", () => {
  it("preserves a comparable pair per sportsbook and selection on a broad market", () => {
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

  it("keeps only the newest two observations in each comparable group", () => {
    const retained = retainComparableHistory([
      point("Pinnacle", "home", 1),
      point("Pinnacle", "home", 2),
      point("Pinnacle", "home", 3),
    ]);

    expect(retained.map((row) => row.capturedAt)).toEqual([
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