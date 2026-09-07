import { describe, expect, it } from "vitest";
import {
  americanImpliedProbability,
  assertLeakageSafe,
  binaryLogLoss,
  brierScore,
  buildImmutableEvaluationScore,
  calibrationBuckets,
  comparableClv,
  deriveNcaafPromotionMetrics,
  evaluatePromotionGates,
  evaluationGroups,
  fairAmericanPrice,
  flatUnitProfit,
  maximumDrawdown,
  ncaafValidationHealthSignals,
  ncaafValidationHash,
  NCAAF_VALIDATION_ALLOWED_SOURCES,
  ncaafPromotionDecisionKey,
  ncaafWalkForwardRunKey,
  NCAAF_VALIDATION_CONFIG,
  priceNcaafSnapshot,
  planCanonicalEvaluation,
  selectCanonicalFinalEvidence,
  selectDecisionMarketObservation,
  selectLatestEligibleClosing,
  settleMarket,
  type PromotionMetrics,
  type ScoredEvaluation,
} from "./ncaafValidation";

const snapshot = (forecast: Record<string, unknown> = {}, quality: Record<string, unknown> = {}) => ({
  modelVersion: "ncaaf-market-free-v1",
  configHash: "feature-config",
  dataCutoffAt: new Date("2025-09-01T12:00:00Z"),
  inputHash: "immutable-input",
  quality: { sufficientIndependentEvidence: true, evidenceCount: 10, ...quality },
  forecast: {
    status: "ready", homeWinProbability: 0.6, projectedMargin: 4,
    projectedTotal: null, uncertainty: 0.25,
    projectedTotalMissingReason: "v1 total evidence unsupported",
    blockedReasons: [], ...forecast,
  },
});

describe("NCAAF immutable validation math", () => {
  it("bounds fair prices and makes opposite moneyline prices reciprocal", () => {
    expect(fairAmericanPrice(-2)).toBe(9900);
    expect(fairAmericanPrice(2)).toBe(-9900);
    expect(fairAmericanPrice(0.6)).toBe(-150);
    expect(fairAmericanPrice(0.4)).toBe(150);
    expect(americanImpliedProbability(-150)).toBeCloseTo(0.6);
  });

  it("orders uncertainty intervals and blocks totals explicitly", () => {
    const prices = priceNcaafSnapshot(snapshot());
    const home = prices.find((p) => p.market === "moneyline" && p.selection === "home")!;
    expect(home.probability!.lower).toBeLessThanOrEqual(home.probability!.point);
    expect(home.probability!.point).toBeLessThanOrEqual(home.probability!.upper);
    const totals = prices.filter((p) => p.market === "total");
    expect(totals).toHaveLength(2);
    expect(totals.every((p) => p.status === "blocked" && p.probability == null)).toBe(true);
    expect(totals[0]!.missingReasons).toContain("v1 total evidence unsupported");
  });

  it("derives spread prices only when feature quality permits", () => {
    const ready = priceNcaafSnapshot(snapshot(), [-3.5]).filter((p) => p.market === "spread");
    expect(ready).toHaveLength(4);
    expect(ready.every((p) => p.status === "available")).toBe(true);
    const blocked = priceNcaafSnapshot(snapshot({}, {
      sufficientIndependentEvidence: false,
    }), [-3.5]).filter((p) => p.market === "spread");
    expect(blocked.every((p) => p.status === "blocked")).toBe(true);
  });

  it("preserves spread and total pushes", () => {
    expect(settleMarket("spread", "home", 24, 21, -3)).toBe("push");
    expect(settleMarket("spread", "away", 24, 21, 3)).toBe("push");
    expect(settleMarket("total", "over", 24, 21, 45)).toBe("push");
    expect(settleMarket("total", "under", 24, 21, 44.5)).toBe("loss");
  });

  it("rejects every leakage path", () => {
    const kickoffAt = new Date("2025-09-06T20:00:00Z");
    expect(() => assertLeakageSafe({
      predictionAt: kickoffAt, featureCutoff: new Date("2025-09-06T19:00:00Z"), kickoffAt,
    })).toThrow("prediction_not_before_kickoff");
    expect(() => assertLeakageSafe({
      predictionAt: new Date("2025-09-06T19:00:00Z"),
      featureCutoff: new Date("2025-09-06T19:30:00Z"), kickoffAt,
    })).toThrow("feature_cutoff_leakage");
    expect(() => assertLeakageSafe({
      predictionAt: new Date("2025-09-06T19:00:00Z"),
      featureCutoff: new Date("2025-09-06T18:00:00Z"), kickoffAt,
      labelAvailableAt: new Date("2025-09-06T18:30:00Z"),
    })).toThrow("label_available_before_prediction");
    expect(() => assertLeakageSafe({
      predictionAt: new Date("2025-09-06T19:00:00Z"),
      featureCutoff: new Date("2025-09-06T18:00:00Z"), kickoffAt,
      trainingSeasons: [2023, 2025], evaluationSeason: 2025,
    })).toThrow("walk_forward_training_season_leakage");
  });

  it("selects the latest eligible close and reports unavailable/unmatched/stale", () => {
    const kickoff = new Date("2025-09-06T20:00:00Z");
    const base = {
      provider: "odds_api", providerEventId: "event", bookmakerProviderId: "book",
      marketKey: "h2h", selection: "home", price: -110, line: null,
      isMatchedToGame: true, modeledAsOf: new Date("2025-09-06T19:00:00Z"),
    };
    const rows = [
      { ...base, id: 1, capturedAt: new Date("2025-09-06T18:00:00Z") },
      { ...base, id: 2, capturedAt: new Date("2025-09-06T19:00:00Z") },
      { ...base, id: 3, capturedAt: new Date("2025-09-06T21:00:00Z") },
    ];
    expect(selectLatestEligibleClosing(rows, kickoff, {
      provider: "odds_api", eventId: "event", market: "h2h", selection: "home",
    }).closing?.id).toBe(2);
    expect(selectLatestEligibleClosing([], kickoff, {
      provider: "odds_api", eventId: "event", market: "h2h", selection: "home",
    }).exclusionReason).toBe("closing_market_unavailable");
    expect(selectLatestEligibleClosing([{ ...rows[0]!, isMatchedToGame: false }], kickoff, {
      provider: "odds_api", eventId: "event", market: "h2h", selection: "home",
    }).exclusionReason).toBe("closing_market_unmatched");
    expect(selectLatestEligibleClosing([{ ...rows[0]!, capturedAt: new Date("2025-09-04T18:00:00Z") }], kickoff, {
      provider: "odds_api", eventId: "event", market: "h2h", selection: "home",
    }).exclusionReason).toBe("closing_market_stale");
  });

  it("strictly maps ESPN to one Odds event and rejects ambiguity, reschedules, and future rows", () => {
    const predictionTimestamp = new Date("2025-09-06T18:00:00Z");
    const kickoffAt = new Date("2025-09-06T20:00:00Z");
    const evidence = [{
      id: 7, provider: "espn", providerEventId: "espn-1", payloadHash: "espn-hash",
      homeTeamName: "Ohio State Buckeyes", awayTeamName: "Texas Longhorns",
      kickoffAt, neutralSite: true, capturedAt: new Date("2025-09-06T17:00:00Z"),
      modeledAsOf: new Date("2025-09-06T17:00:00Z"),
    }];
    const observation = {
      id: 10, provider: "odds_api", providerEventId: "odds-1", gameEvidenceId: 7,
      bookmakerProviderId: "book-a", marketKey: "h2h", selection: "Ohio State Buckeyes",
      price: -110, line: null, isMatchedToGame: true, payloadHash: "odds-hash",
      capturedAt: new Date("2025-09-06T17:30:00Z"), modeledAsOf: new Date("2025-09-06T17:30:00Z"),
      payload: { event: {
        home_team: "Ohio State Buckeyes", away_team: "Texas Longhorns",
        commence_time: kickoffAt.toISOString(),
      } },
    };
    const select = (observations: typeof observation[]) => selectDecisionMarketObservation({
      espnEventId: "espn-1", predictionTimestamp, kickoffAt,
      market: "moneyline", selection: "home", espnEvidence: evidence, observations,
    });
    expect(select([observation])).toEqual(expect.objectContaining({
      exclusionReason: null, observation: expect.objectContaining({ id: 10 }),
      provenance: expect.objectContaining({
        espnEventId: "espn-1", oddsEventId: "odds-1",
        espnEvidenceId: 7, oddsObservationHash: "odds-hash",
      }),
    }));
    expect(select([
      observation,
      { ...observation, id: 11, providerEventId: "odds-2", payloadHash: "other" },
    ]).exclusionReason).toBe("decision_event_mapping_ambiguous");
    expect(select([{ ...observation, payload: { event: {
      home_team: "Ohio State Buckeyes", away_team: "Texas Longhorns",
      commence_time: "2025-09-07T03:00:00Z",
    } } }]).exclusionReason).toBe("decision_event_identity_or_reschedule_mismatch");
    expect(select([{ ...observation, id: 12, capturedAt: new Date("2025-09-06T18:01:00Z") }])
      .exclusionReason).toBe("decision_market_unavailable");
    expect(select([{ ...observation, payload: { event: {
      home_team: "Texas Longhorns", away_team: "Ohio State Buckeyes",
      commence_time: kickoffAt.toISOString(),
    } } }]).exclusionReason).toBe("decision_event_identity_or_reschedule_mismatch");
  });

  it("uses odds-null Task 186 predictions but separate decision prices for ROI and CLV", () => {
    const score = buildImmutableEvaluationScore({
      prediction: {
        market: "moneyline", selection: "home", modelProbability: 0.613,
        odds: null, units: 0,
      },
      decision: { providerSelection: "Home Team", offeredLine: null, offeredPrice: 120 },
      final: { homeScore: 28, awayScore: 21 },
      closing: { selection: "Home Team", line: null, price: 105 },
    });
    expect(score.probability).toBe(0.613);
    expect(score.profitUnits).toBe(1.2);
    expect(score.clv).not.toBeNull();
    expect(score.exclusionReason).toBeNull();
    expect(buildImmutableEvaluationScore({
      prediction: { market: "moneyline", selection: "home", modelProbability: 0.7, odds: -110, units: 0 },
      decision: { providerSelection: "Home Team", offeredLine: null, offeredPrice: 120 },
      final: { homeScore: 28, awayScore: 21 }, closing: null,
    }).exclusionReason).toBe("challenger_prediction_must_keep_odds_null");
  });

  it("keeps pending games unevaluated and freezes one canonical first-final identity", () => {
    const expected = { provider: "espn", eventId: "espn-final" };
    const base = {
      provider: "espn", providerEventId: "espn-final",
      homeTeamName: "Home", awayTeamName: "Away", neutralSite: false,
      kickoffAt: new Date("2025-09-06T20:00:00Z"),
      modeledAsOf: new Date("2025-09-06T23:30:00Z"),
      gameStatus: "final", homeScore: 28, awayScore: 21, payloadHash: "first",
    };
    const before = planCanonicalEvaluation({
      predictionId: 4, decisionMarketId: 8, finalRows: [], expected,
      existingEvaluationIdentities: new Set(),
    });
    expect(before).toEqual(expect.objectContaining({
      status: "pending_final", final: null,
      coverage: { eligibleFinal: false, evaluationNeeded: false },
    }));
    const first = {
      ...base, id: 20, capturedAt: new Date("2025-09-06T23:30:00Z"),
    };
    const after = planCanonicalEvaluation({
      predictionId: 4, decisionMarketId: 8, finalRows: [first], expected,
      existingEvaluationIdentities: new Set(),
    });
    expect(after.status).toBe("ready");
    expect(after.final?.id).toBe(20);
    expect(after.coverage).toEqual({ eligibleFinal: true, evaluationNeeded: true });
    const revised = {
      ...base, id: 21, homeScore: 27, payloadHash: "revision",
      capturedAt: new Date("2025-09-07T00:00:00Z"),
      modeledAsOf: new Date("2025-09-07T00:00:00Z"),
    };
    expect(selectCanonicalFinalEvidence([revised, first], expected)?.id).toBe(20);
    const rerun = planCanonicalEvaluation({
      predictionId: 4, decisionMarketId: 8, finalRows: [revised, first], expected,
      existingEvaluationIdentities: new Set([after.identity]),
    });
    expect(rerun).toEqual(expect.objectContaining({
      status: "already_evaluated", final: null,
      coverage: { eligibleFinal: true, evaluationNeeded: false },
    }));
  });

  it("requires same-book, no-future, same-line closing observations", () => {
    const kickoff = new Date("2025-09-06T20:00:00Z");
    const decisionAt = new Date("2025-09-06T18:00:00Z");
    const rows = [
      { id: 1, provider: "odds_api", providerEventId: "odds-1", bookmakerProviderId: "book-a",
        marketKey: "spreads", selection: "Home", price: -110, line: -3, isMatchedToGame: true,
        capturedAt: decisionAt, modeledAsOf: decisionAt },
      { id: 2, provider: "odds_api", providerEventId: "odds-1", bookmakerProviderId: "book-b",
        marketKey: "spreads", selection: "Home", price: -115, line: -3, isMatchedToGame: true,
        capturedAt: new Date("2025-09-06T19:30:00Z"), modeledAsOf: new Date("2025-09-06T19:30:00Z") },
      { id: 3, provider: "odds_api", providerEventId: "odds-1", bookmakerProviderId: "book-a",
        marketKey: "spreads", selection: "Home", price: -105, line: -3.5, isMatchedToGame: true,
        capturedAt: new Date("2025-09-06T19:00:00Z"), modeledAsOf: new Date("2025-09-06T19:00:00Z") },
    ];
    const result = selectLatestEligibleClosing(rows, kickoff, {
      provider: "odds_api", eventId: "odds-1", bookmakerProviderId: "book-a",
      market: "spreads", selection: "Home", line: -3, decisionObservedAt: decisionAt,
      decisionModeledAsOf: decisionAt,
    });
    expect(result.closing?.id).toBe(1);
    expect(selectLatestEligibleClosing(rows.slice(1), kickoff, {
      provider: "odds_api", eventId: "odds-1", bookmakerProviderId: "book-a",
      market: "spreads", selection: "Home", line: -3, decisionObservedAt: decisionAt,
    }).exclusionReason).toBe("closing_line_changed_clv_unavailable");
  });

  it("computes calibration, Brier, log loss, ROI, drawdown, and comparable CLV", () => {
    expect(brierScore(0.8, true)).toBeCloseTo(0.04);
    expect(binaryLogLoss(0.8, true)).toBeCloseTo(-Math.log(0.8));
    expect(flatUnitProfit(150, "win")).toBe(1.5);
    expect(flatUnitProfit(-200, "win")).toBe(0.5);
    expect(flatUnitProfit(-110, "push")).toBe(0);
    expect(maximumDrawdown([1, -1, -1, 0.5])).toBe(2);
    expect(comparableClv(
      { selection: "home", line: null, price: -110 },
      { selection: "home", line: null, price: -120 },
    )).toBeGreaterThan(0);
    expect(comparableClv(
      { selection: "home", line: -3, price: -110 },
      { selection: "home", line: -3.5, price: -110 },
    )).toBeNull();
    const buckets = calibrationBuckets([
      { season: 2024, week: 1, market: "moneyline", price: -110, evidenceTier: "high", probability: 0.72, outcome: "win", profit: 0.91, clv: 0.01 },
      { season: 2024, week: 1, market: "moneyline", price: -110, evidenceTier: "high", probability: 0.78, outcome: "loss", profit: -1, clv: 0 },
    ]);
    expect(buckets).toEqual([expect.objectContaining({ lower: 0.7, count: 2, meanProbability: 0.75, winRate: 0.5 })]);
  });

  it("groups by every required dimension and accounts for exclusions", () => {
    const rows: ScoredEvaluation[] = [
      { season: 2024, week: 2, market: "spread", price: -110, evidenceTier: "high", probability: 0.6, outcome: "win", profit: 0.91, clv: 0.01 },
      { season: 2024, week: 2, market: "spread", price: -110, evidenceTier: "high", probability: null, outcome: null, profit: null, clv: null, excluded: true },
    ];
    const [group] = evaluationGroups(rows);
    expect(group!.dimensions).toEqual({
      season: 2024, week: 2, market: "spread", priceRange: "-119..+99", evidenceTier: "high",
    });
    expect(group).toEqual(expect.objectContaining({ samples: 1, exclusions: 1, coverage: 0.5 }));
  });

  it("produces reproducible order-independent object hashes", () => {
    expect(ncaafValidationHash({ a: 1, b: { c: 2 } }))
      .toBe(ncaafValidationHash({ b: { c: 2 }, a: 1 }));
    expect(ncaafWalkForwardRunKey("dataset")).toBe(ncaafWalkForwardRunKey("dataset"));
    const decision = {
      championModelVersion: "champ", challengerModelVersion: "challenger",
      datasetVersion: "dataset", metrics: {
        minimumMarketSeasonSamples: null, calibrationError: null, brier: null, logLoss: null,
        roi: null, clv: null, maxDrawdown: null, positiveSeasonRate: null,
        positiveWeekRate: null, coverage: null,
      }, policyReasons: ["insufficient_evaluation_seasons"],
      thresholdHash: "threshold", provenanceHash: "provenance",
    };
    expect(ncaafPromotionDecisionKey(decision)).toBe(ncaafPromotionDecisionKey(decision));
    expect(NCAAF_VALIDATION_ALLOWED_SOURCES).toEqual([
      "model_predictions", "ncaaf_feature_snapshots", "ncaaf_game_evidence",
      "ncaaf_market_observations", "ncaaf_decision_markets",
    ]);
    expect(NCAAF_VALIDATION_ALLOWED_SOURCES.every((source) => typeof source === "string")).toBe(true);
  });

  it("derives deterministic aggregates from supported moneyline and spread markets", () => {
    const rows = [
      { id: 1, provenanceHash: "a", labelAvailableAt: new Date("2024-09-01T23:00:00Z"),
        season: 2024, week: 1, market: "moneyline", price: 120, evidenceTier: "high",
        probability: 0.6, outcome: "win" as const, profit: 1.2, clv: 0.02 },
      { id: 2, provenanceHash: "b", labelAvailableAt: new Date("2025-09-01T23:00:00Z"),
        season: 2025, week: 1, market: "spread", price: -110, evidenceTier: "high",
        probability: 0.55, outcome: "loss" as const, profit: -1, clv: 0.01 },
    ];
    const aggregate = deriveNcaafPromotionMetrics(rows);
    expect(aggregate.evaluationSeasons).toEqual([2024, 2025]);
    expect(aggregate.metrics.roi).toBe(0.1);
    expect(aggregate.metrics.maxDrawdown).toBe(1);
    expect(aggregate.marketsPresent).toEqual(["moneyline", "spread"]);
    expect(aggregate.policyReasons).not.toContain("required_market_unavailable:total");
    expect(aggregate.policyReasons).not.toContain("required_market_unsupported:total_v1");
    expect(deriveNcaafPromotionMetrics(rows.slice(0, 1)).policyReasons)
      .toContain("insufficient_evaluation_seasons");
  });

  it("detects drift and material coverage changes without claiming empty-data recovery", () => {
    const empty = ncaafValidationHealthSignals({
      now: new Date("2025-09-10T00:00:00Z"), candidateCount: 0, latestEvidenceAt: null,
      exclusions: [], observedFeatureConfigHashes: [], observedValidationConfigHashes: [],
      calibrationError: null, currentCoverage: null, previousCoverage: null,
    });
    expect(empty.every((signal) => !signal.active && !signal.recoveryProven)).toBe(true);
    const unhealthy = ncaafValidationHealthSignals({
      now: new Date("2025-09-10T00:00:00Z"), candidateCount: 10,
      latestEvidenceAt: new Date("2025-09-08T00:00:00Z"),
      exclusions: ["closing_market_unmatched", "immutable_final_evidence_unavailable"],
      observedFeatureConfigHashes: ["a", "b"],
      observedValidationConfigHashes: ["unexpected"],
      calibrationError: 0.2, currentCoverage: 0.5, previousCoverage: 0.8,
    });
    expect(unhealthy.every((signal) => signal.active)).toBe(true);
    expect(unhealthy.map((signal) => signal.alertType)).toHaveLength(7);
  });
});

describe("NCAAF promotion is fail-closed", () => {
  const passing: PromotionMetrics = {
    minimumMarketSeasonSamples: NCAAF_VALIDATION_CONFIG.gates.minimumSamplesPerMarketSeason,
    calibrationError: NCAAF_VALIDATION_CONFIG.gates.maximumCalibrationError,
    brier: NCAAF_VALIDATION_CONFIG.gates.maximumBrier,
    logLoss: NCAAF_VALIDATION_CONFIG.gates.maximumLogLoss,
    roi: NCAAF_VALIDATION_CONFIG.gates.minimumRoi,
    clv: NCAAF_VALIDATION_CONFIG.gates.minimumClv,
    maxDrawdown: NCAAF_VALIDATION_CONFIG.gates.maximumDrawdownUnits,
    positiveSeasonRate: NCAAF_VALIDATION_CONFIG.gates.minimumPositiveSeasonRate,
    positiveWeekRate: NCAAF_VALIDATION_CONFIG.gates.minimumPositiveWeekRate,
    coverage: NCAAF_VALIDATION_CONFIG.gates.minimumCoverage,
  };

  it("allows eligibility only when every gate passes", () => {
    expect(evaluatePromotionGates(passing).decision).toBe("eligible");
  });

  it("rejects every missing gate independently", () => {
    for (const key of Object.keys(passing) as Array<keyof PromotionMetrics>) {
      const result = evaluatePromotionGates({ ...passing, [key]: null });
      expect(result.decision, key).toBe("rejected");
      expect(result.gates.some((gate) => !gate.passed && gate.reason === "metric_missing"), key).toBe(true);
    }
  });

  it("rejects every failed threshold independently", () => {
    const failures: PromotionMetrics = {
      minimumMarketSeasonSamples: 0, calibrationError: 1, brier: 1, logLoss: 2,
      roi: -0.01, clv: -0.01, maxDrawdown: 21,
      positiveSeasonRate: 0, positiveWeekRate: 0, coverage: 0,
    };
    for (const key of Object.keys(failures) as Array<keyof PromotionMetrics>) {
      const result = evaluatePromotionGates({ ...passing, [key]: failures[key] });
      expect(result.decision, key).toBe("rejected");
      expect(result.gates.some((gate) => !gate.passed && gate.reason === "threshold_not_met"), key).toBe(true);
    }
  });
});