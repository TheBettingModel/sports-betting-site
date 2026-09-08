import { describe, expect, it } from "vitest";
import { classifyDiscoveredEvent, runFullSlateV4 } from "./v4FullSlate";
import {
  TBM_V4_PUBLIC_SPORTS,
  TBM_V4_SPORTS,
  V4EngineRegistry,
  stableHash,
  type SportEngineV4,
} from "./v4Platform";

function engine(): SportEngineV4<{ rating: number }> {
  const identity = {
    sport: "NFL" as const, modelFamily: "test", modelId: "tbm-nfl-v4-test", modelVersion: "4.0.0",
    artifactId: "test-artifact", artifactHash: "a".repeat(64), inputContractVersion: "nfl-core",
    configurationHash: "c".repeat(64), parameterHash: "d".repeat(64), contractId: "nfl-core", contractHash: "b".repeat(64),
  };
  return {
    identity, approvalState: "SHADOW", maturity: "DEVELOPING",
    async collectEvidence(gameId) { return { gameId }; },
    async materializeInput(raw, now) {
      const gameId = (raw as { gameId: string }).gameId;
      return {
        gameId, eventStart: "2026-09-08T20:00:00.000Z",
        dataCutoff: "2026-09-07T20:00:00.000Z", predictionTimestamp: now.toISOString(),
        sourceEvidenceTimes: ["2026-09-07T20:00:00.000Z"],
        featureSnapshotId: `f-${gameId}`, featureHash: stableHash({ rating: 1 }), input: { rating: 1 },
      };
    },
    validateInput() {},
    async predict(input) {
      return {
        predictionId: stableHash(input), ...identity, gameId: input.gameId,
        featureSnapshotId: input.featureSnapshotId, featureHash: input.featureHash, inputHash: input.featureHash,
        dataCutoff: input.dataCutoff, predictionTimestamp: input.predictionTimestamp,
        approvalState: "SHADOW", maturity: "DEVELOPING",
        homeWinProbability: .55, awayWinProbability: .45,
        expectedHomeScore: 24.4, expectedAwayScore: 21.3,
        evidenceTier: "TEST", qualityFlags: [],
      };
    },
    validateOutput() {},
  };
}

describe("V4 full slate", () => {
  it("classifies missing identities explicitly", () => {
    const event = classifyDiscoveredEvent({
      gameId: "1", sport: "NFL", eventStart: new Date("2026-09-08T20:00:00Z"),
      homeParticipantId: null, awayParticipantId: "a",
      homeParticipantName: "H", awayParticipantName: "A",
    });
    expect(event?.failureReason).toBe("UNRESOLVED_IDENTITY");
  });

  it("routes every eligible event without edge filtering and reports coverage", async () => {
    const registry = new V4EngineRegistry();
    registry.register(engine());
    const events = ["1", "2"].map((gameId) => ({
      gameId, sport: "NFL" as const, eventStart: "2026-09-08T20:00:00.000Z",
      homeParticipantId: "h", awayParticipantId: "a",
      homeParticipantName: "H", awayParticipantName: "A",
      eligibility: "ELIGIBLE" as const, failureReason: null,
    }));
    const result = await runFullSlateV4({
      sport: "NFL", sportDate: "2026-09-08", now: new Date("2026-09-07T21:00:00Z"),
      mode: "DRY_RUN", events, registry,
    });
    expect(result).toMatchObject({ scheduledEvents: 2, eligibleEvents: 2, forecastedEvents: 2, failedEvents: 0, forecastCoveragePct: 100 });
    expect(result.forecasts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        approvalState: "SHADOW",
        maturity: "DEVELOPING",
        expectedHomeScore: 24.4,
        expectedAwayScore: 21.3,
      }),
    ]));
  });

  it("keeps UFC out of the public V4 board while retaining historical engine compatibility", () => {
    expect(TBM_V4_PUBLIC_SPORTS).not.toContain("UFC");
    expect(TBM_V4_SPORTS).toContain("UFC");
  });

  it("returns explicit no-artifact failures for all eligible events", async () => {
    const result = await runFullSlateV4({
      sport: "NHL", sportDate: "2026-09-08", now: new Date("2026-09-07T21:00:00Z"),
      mode: "DRY_RUN", events: [{
        gameId: "1", sport: "NHL", eventStart: "2026-09-08T20:00:00.000Z",
        homeParticipantId: "h", awayParticipantId: "a",
        homeParticipantName: "H", awayParticipantName: "A",
        eligibility: "ELIGIBLE", failureReason: null,
      }], registry: new V4EngineRegistry(),
    });
    expect(result.failures).toEqual([{ gameId: "1", reason: "NO_ELIGIBLE_V4_ARTIFACT" }]);
    expect(result.forecastCoveragePct).toBe(0);
  });

  it("does not invoke a forecast engine after an event has started", async () => {
    const registry = new V4EngineRegistry();
    const startedEngine = engine();
    startedEngine.collectEvidence = async () => {
      throw new Error("LIVE_ENGINE_MUST_NOT_RUN");
    };
    registry.register(startedEngine);
    const result = await runFullSlateV4({
      sport: "NFL", sportDate: "2026-09-08", now: new Date("2026-09-08T20:00:00Z"),
      mode: "DRY_RUN", registry, events: [{
        gameId: "started", sport: "NFL", eventStart: "2026-09-08T20:00:00.000Z",
        homeParticipantId: "h", awayParticipantId: "a",
        homeParticipantName: "H", awayParticipantName: "A",
        eligibility: "ELIGIBLE", failureReason: null,
      }],
    });
    expect(result.forecasts).toEqual([]);
    expect(result.failures).toEqual([{ gameId: "started", reason: "EVENT_ALREADY_STARTED" }]);
  });
});