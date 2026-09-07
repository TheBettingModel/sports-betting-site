import { describe, expect, it } from "vitest";
import { lockGame, unlockExactFreeMarket } from "./gameAccess";

const premiumGame = {
  id: "g", sport: "NFL", homeTeamName: "Home", awayTeamName: "Away", gameTime: "8 PM", gameDate: "2026-01-01", status: "upcoming",
  finalModelScore: 99, finalModelTier: "Elite", finalModelStars: 5, podScore: 9, units: 5, sharpScore: 99, sharpSignal: "Steam",
  confidence: "High", homeWinPct: 90, edge: 12, expectedValue: 22, valueRating: "Strong Buy", projectedSpread: 4,
  selectedPick: { market: "moneyline", selection: "home", expectedValue: 20, edge: 9 },
  spreadMarket: { market: "spread", expectedValue: 30 }, moneylineMarket: { market: "moneyline", expectedValue: 20 },
};
describe("locked game access", () => {
  it("contains no premium or derived projection fields", () => {
    const locked = lockGame(premiumGame);
    for (const field of ["finalModelScore", "finalModelTier", "finalModelStars", "podScore", "units", "sharpScore", "sharpSignal", "confidence", "homeWinPct", "edge", "expectedValue", "valueRating", "projectedSpread", "selectedPick", "spreadMarket", "moneylineMarket"]) expect(locked).not.toHaveProperty(field);
  });
  it("does not unlock a different market or selection", () => {
    const result = unlockExactFreeMarket(premiumGame, "spread", "home");
    expect(result.isLocked).toBe(true);
    expect(result).not.toHaveProperty("selectedPick");
  });
});