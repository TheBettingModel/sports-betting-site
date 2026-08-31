import { describe, expect, it } from "vitest";
import {
  buildProductionChampionSnapshot,
  CHAMPION_SNAPSHOT_SCHEMA_VERSION,
  productionChampionSnapshotHash,
  shouldCaptureProductionChampionSnapshot,
} from "./productionChampion";

describe("production champion snapshots", () => {
  const model = {
    id: 9,
    modelId: "tbm-nba-moneyline-v1",
    sport: "NBA",
    market: "moneyline",
    rollbackTargetId: null,
  };

  it("captures the existing production configuration without changing policy", () => {
    const snapshot = buildProductionChampionSnapshot(model, null);
    expect(snapshot).toMatchObject({
      schemaVersion: CHAMPION_SNAPSHOT_SCHEMA_VERSION,
      role: "production_champion",
      identity: {
        modelVersionId: 9,
        modelId: "tbm-nba-moneyline-v1",
        sport: "NBA",
        market: "moneyline",
      },
      formula: {
        version: "production-moneyline-formula-v1",
        confidenceMultiplier: 1,
        publicationThresholdsChanged: false,
        gradingChanged: false,
        unitsChanged: false,
      },
      evidenceState: {
        learningMode: "frozen_research_only",
      },
    });
  });

  it("hashes equivalent objects deterministically", () => {
    expect(productionChampionSnapshotHash({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(productionChampionSnapshotHash({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it("never applies moneyline snapshots to independent spread models", () => {
    expect(shouldCaptureProductionChampionSnapshot("moneyline")).toBe(true);
    expect(shouldCaptureProductionChampionSnapshot("spread")).toBe(false);
  });

  it("records the exact multiplier supplied by the runtime weights row", () => {
    expect(buildProductionChampionSnapshot({
      ...model,
      modelId: "tbm-mlb-moneyline-v1",
      sport: "MLB",
    }, {
      id: 4,
      sport: "MLB",
      accuracyRate: 0.5,
      totalPredictions: 10,
      correctPredictions: 5,
      strongBuyAccuracy: 0.5,
      buyAccuracy: 0.5,
      eliteAccuracy: 0.5,
      strongAccuracy: 0.5,
      playableAccuracy: 0.5,
      brierScore: 0.25,
      confidenceMultiplier: 0.72,
      mlbConfidenceRecoveryNormalizedAt: null,
      factorWeights: null,
      lastLearnedAt: null,
      updatedAt: new Date("2026-08-30T00:00:00Z"),
    })).toMatchObject({
      formula: { confidenceMultiplier: 0.72 },
    });
  });
});