import { describe, expect, it } from "vitest";
import {
  DEFAULT_MLB_MONEYLINE_POLICY,
  evaluateMlbMoneylinePolicy,
  hasFutureMlbPolicyRevisionCutoff,
  isMlbFavoritePriceCapViolation,
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
      { ...validInput, odds: -160 },
      DEFAULT_MLB_MONEYLINE_POLICY,
    )).toMatchObject({ recommendation: "Neutral", blockedReason: "favorite_price_cap" });
    expect(evaluateMlbMoneylinePolicy(
      { ...validInput, odds: -159 },
      DEFAULT_MLB_MONEYLINE_POLICY,
    )).toMatchObject({ recommendation: "Buy", blockedReason: null });
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

  it("allows stricter caps but never allows a looser cap to restore expensive favorites", () => {
    expect(evaluateMlbMoneylinePolicy(
      { ...validInput, odds: -155 },
      { ...DEFAULT_MLB_MONEYLINE_POLICY, maxFavoriteOdds: -150 },
    )).toMatchObject({ recommendation: "Neutral", blockedReason: "favorite_price_cap" });
    expect(isMlbFavoritePriceCapViolation("Buy", -200)).toBe(true);
    expect(isMlbFavoritePriceCapViolation("Strong Buy", -160)).toBe(true);
    expect(isMlbFavoritePriceCapViolation("Buy", -159)).toBe(false);
    expect(isMlbFavoritePriceCapViolation("Neutral", -200)).toBe(false);
  });

  it("requires the database wall clock to remain before first pitch", async () => {
    const futureTx = { execute: async () => ({ rows: [{ id: "future-game" }] }) };
    const startedTx = { execute: async () => ({ rows: [] }) };

    await expect(hasFutureMlbPolicyRevisionCutoff(futureTx, "future-game")).resolves.toBe(true);
    await expect(hasFutureMlbPolicyRevisionCutoff(startedTx, "started-game")).resolves.toBe(false);
  });
});