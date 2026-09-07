import { describe, expect, it } from "vitest";
import { distinctGameCount, isLateMarketState, isTrueClosingMarketState, percentage } from "./mlbAdvancedReportHelpers";
describe("advanced report coverage helpers", () => {
  it("uses distinct game IDs for cohort denominators, including doubleheaders", () => {
    expect(distinctGameCount([{ gameId: "game-a" }, { gameId: "game-a" }, { gameId: "game-b" }])).toBe(2);
  });
  it("keeps empty denominators honest and separates late from closing", () => {
    expect(percentage(0, 0)).toBeNull(); expect(percentage(1, 4)).toBe(25);
    expect(isLateMarketState("T_MINUS_15")).toBe(true); expect(isLateMarketState("CLOSING")).toBe(false);
    expect(isTrueClosingMarketState("CLOSING")).toBe(true);
  });
});