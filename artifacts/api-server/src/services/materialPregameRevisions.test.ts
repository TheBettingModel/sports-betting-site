import { describe, expect, it } from "vitest";
import type { FetchedGame } from "./espn";
import type { ProjectionResult } from "./model";
import {
  assessMlbMaterialPregameChange,
  assessWnbaMaterialPregameChange,
  currentMlbPregameDecision,
  isMaterialPregameRevisionEligible,
  isMlbMaterialPregameRevisionEligible,
  materialMlbEvidenceFingerprint,
  type MaterialPregameDecision,
} from "./materialPregameRevisions";

const baseDecision: MaterialPregameDecision = {
  selection: "home",
  odds: -125,
  modelProbability: 0.58,
  edge: 8,
  confidence: "High",
  recommendation: "Buy",
  units: 1.5,
  podScore: 40,
  finalRating: 68,
  marketIntelligenceGrade: "Strong",
};

function featureSnapshot() {
  return {
    decision: {
      dataQuality: { missingSignals: [] },
      availability: {
        homeStarter: { playerId: 1, name: "Home Starter", seasonEra: 3.2 },
        awayStarter: { playerId: 2, name: "Away Starter", seasonEra: 4.1 },
        homeLineupConfirmed: false,
        awayLineupConfirmed: false,
        homeLineup: { batterCount: 0 },
        awayLineup: { batterCount: 0 },
        homeBullpen: { fatigueLabel: "Moderate", weightedPitches: 70, gamesLast3Days: 2 },
        awayBullpen: { fatigueLabel: "Tired", weightedPitches: 110, gamesLast3Days: 3 },
        venueWeather: { isDome: false, windSpeedMph: 8, precipitationMm: 0 },
      },
    },
  };
}

function blockedPitcherFeatureSnapshot() {
  return {
    decision: {
      dataQuality: {
        missingSignals: ["probable_pitchers"],
        evidence: {
          recommendationBlocked: true,
          qualityReasons: ["home_starter_stats_identity_mismatch"],
        },
      },
      availability: {
        homeStarter: null,
        awayStarter: { playerId: 2, name: "Away Starter", seasonEra: 4.1 },
      },
    },
  };
}

function game(commenceTimeISO: string): FetchedGame {
  return {
    espnId: "MLB-test",
    sport: "MLB",
    homeTeamAbbr: "HOM",
    homeTeamName: "Home",
    homeTeamRecord: "10-5",
    awayTeamAbbr: "AWY",
    awayTeamName: "Away",
    awayTeamRecord: "8-7",
    gameTime: "7:00 PM ET",
    gameDate: "2026-08-23",
    commenceTimeISO,
    status: "upcoming",
  };
}

describe("material MLB pregame revisions", () => {
  it("promotes a Neutral decision to Buy when validated analysis crosses the recommendation boundary", () => {
    const prior = { ...baseDecision, recommendation: "Neutral" as const, featureSnapshot: featureSnapshot() };
    const change = assessMlbMaterialPregameChange(
      prior,
      baseDecision,
      materialMlbEvidenceFingerprint(featureSnapshot()),
    );

    expect(change).toMatchObject({ changed: true });
    expect(change.reasons).toContain("recommendation_changed");
  });

  it("withdraws a Buy when current validated analysis falls back to Neutral", () => {
    const prior = { ...baseDecision, featureSnapshot: featureSnapshot() };
    const current = { ...baseDecision, recommendation: "Neutral" as const, edge: 2 };
    const change = assessMlbMaterialPregameChange(
      prior,
      current,
      materialMlbEvidenceFingerprint(featureSnapshot()),
    );

    expect(change).toMatchObject({ changed: true });
    expect(change.reasons).toContain("recommendation_changed");
  });

  it("leaves ordinary unchanged refreshes alone", () => {
    const snapshot = featureSnapshot();
    const prior = { ...baseDecision, featureSnapshot: snapshot };
    const change = assessMlbMaterialPregameChange(
      prior,
      baseDecision,
      materialMlbEvidenceFingerprint(snapshot),
    );

    expect(change).toEqual({ changed: false, reasons: [] });
  });

  it("refuses revisions after the recorded start time even if a provider still says upcoming", () => {
    const proj = { vegasHomeOdds: -125, vegasAwayOdds: 105 } as ProjectionResult;

    expect(isMlbMaterialPregameRevisionEligible(
      game(new Date(Date.now() - 60_000).toISOString()),
      proj,
      true,
    )).toBe(false);
  });

  it("allows an immutable neutral withdrawal when required pitcher evidence is rejected", () => {
    const proj = { vegasHomeOdds: -125, vegasAwayOdds: 105 } as ProjectionResult;

    expect(isMlbMaterialPregameRevisionEligible(
      game(new Date(Date.now() + 60_000).toISOString()),
      proj,
      false,
      blockedPitcherFeatureSnapshot(),
    )).toBe(true);
  });

  it("allows the required-pitcher withdrawal even when the new odds feed is unavailable", () => {
    const unavailableMarket = { vegasHomeOdds: 0, vegasAwayOdds: 0 } as ProjectionResult;

    expect(isMlbMaterialPregameRevisionEligible(
      game(new Date(Date.now() + 60_000).toISOString()),
      unavailableMarket,
      false,
      blockedPitcherFeatureSnapshot(),
    )).toBe(true);
  });

  it("does not use the withdrawal path for unrelated or unblocked missing data", () => {
    const proj = { vegasHomeOdds: -125, vegasAwayOdds: 105 } as ProjectionResult;
    const incomplete = {
      decision: {
        dataQuality: {
          missingSignals: ["market_odds"],
          evidence: { recommendationBlocked: false, qualityReasons: [] },
        },
      },
    };

    expect(isMlbMaterialPregameRevisionEligible(
      game(new Date(Date.now() + 60_000).toISOString()),
      proj,
      false,
      incomplete,
    )).toBe(false);
  });

  it("cannot reintroduce a Buy at the retired -200 MLB favorite price", () => {
    const decision = currentMlbPregameDecision({
      ...baseDecision,
      vegasHomeOdds: -200,
      vegasAwayOdds: 170,
      edge: 8,
      valueRating: "Buy",
      homeWinPct: 62,
      confidence: "High",
      units: 1.5,
      podScore: 40,
      finalModelScore: 70,
      finalModelTier: "Strong",
    } as unknown as ProjectionResult);

    expect(decision).toMatchObject({ odds: -200, recommendation: "Neutral", units: 1, podScore: 0 });
  });
});

describe("material WNBA pregame revisions", () => {
  const wnbaGame = (commenceTimeISO: string): FetchedGame => ({
    ...game(commenceTimeISO),
    espnId: "WNBA-test",
    sport: "WNBA",
  });

  it("withdraws an earlier actionable underdog when the current decision is Neutral", () => {
    const change = assessWnbaMaterialPregameChange(
      { selection: "away", recommendation: "Strong Buy" },
      { selection: "away", recommendation: "Neutral" },
    );

    expect(change).toEqual({ changed: true, reasons: ["recommendation_changed"] });
  });

  it("does not churn immutable WNBA decisions for ordinary price movement", () => {
    const change = assessWnbaMaterialPregameChange(
      { selection: "away", recommendation: "Neutral" },
      { selection: "away", recommendation: "Neutral" },
    );

    expect(change).toEqual({ changed: false, reasons: [] });
  });

  it("allows a valid WNBA revision before start but never after start", () => {
    const proj = { vegasHomeOdds: -1_895, vegasAwayOdds: 1_000 } as ProjectionResult;

    expect(isMaterialPregameRevisionEligible(
      wnbaGame(new Date(Date.now() + 60_000).toISOString()),
      proj,
      true,
    )).toBe(true);
    expect(isMaterialPregameRevisionEligible(
      wnbaGame(new Date(Date.now() - 60_000).toISOString()),
      proj,
      true,
    )).toBe(false);
  });
});