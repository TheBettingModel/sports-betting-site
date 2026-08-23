import { describe, expect, it } from "vitest";
import {
  DEFAULT_MLB_MONEYLINE_POLICY,
  evaluateMlbMoneylinePolicy,
} from "./mlbPolicyRevisions";

describe("MLB policy revisions", () => {
  const validInput = {
    edge: 8,
    selection: "home",
    odds: -145,
    confidence: "Medium",
    missingSignals: [],
  };

  it("widens the approved MLB buy band without weakening hard evidence blocks", () => {
    expect(evaluateMlbMoneylinePolicy(validInput, DEFAULT_MLB_MONEYLINE_POLICY))
      .toMatchObject({ recommendation: "Buy", blockedReason: null });
    expect(evaluateMlbMoneylinePolicy(
      { ...validInput, missingSignals: ["probable_pitchers"] },
      DEFAULT_MLB_MONEYLINE_POLICY,
    )).toMatchObject({ recommendation: "Neutral", blockedReason: "probable_pitchers" });
    expect(evaluateMlbMoneylinePolicy(
      { ...validInput, odds: -225 },
      DEFAULT_MLB_MONEYLINE_POLICY,
    )).toMatchObject({ recommendation: "Neutral", blockedReason: "favorite_price_cap" });
  });

  it("keeps the stricter away-side threshold and strong-buy confidence gate", () => {
    expect(evaluateMlbMoneylinePolicy(
      { ...validInput, selection: "away", edge: -8 },
      DEFAULT_MLB_MONEYLINE_POLICY,
    ).recommendation).toBe("Neutral");
    expect(evaluateMlbMoneylinePolicy(
      { ...validInput, edge: 14, confidence: "Medium" },
      DEFAULT_MLB_MONEYLINE_POLICY,
    ).recommendation).toBe("Buy");
  });
});