import { describe, expect, it, vi } from "vitest";
import { createNcaafV4SharedAdapter } from "./ncaafV4SharedAdapter";
import type { MaterializedNcaafCandidateInput } from "./guardedServing/ncaafCandidateExecutor";
import { routeV4Forecast, V4EngineRegistry } from "./v4Platform";
import { ncaafV42026InputChecksum } from "./ncaafV42026FeatureBridge";

const now = new Date("2026-09-06T14:00:00.000Z");
const featureCutoff = "2026-09-06T13:45:00.000Z";
const replayRowChecksum = "replay-checksum";
const input: MaterializedNcaafCandidateInput = Object.freeze({
  snapshotId: "77",
  materializedAt: now.toISOString(),
  input: Object.freeze({
    stableGameId: "espn:401752601",
    season: 2026,
    week: 2,
    kickoffAt: "2026-09-06T20:00:00.000Z",
    featureCutoff,
    checksum: ncaafV42026InputChecksum(replayRowChecksum, featureCutoff),
    features: Object.freeze({}) as MaterializedNcaafCandidateInput["input"]["features"],
    sourceAudit: Object.freeze({
      featureFreeze: "replayNcaafChronologically_before_targets",
      targetResultUsed: false,
      replayRowChecksum,
      snapshotId: 77,
      targetProvider: "espn",
      targetEventId: "401752601",
      snapshotKickoffAt: "2026-09-06T20:00:00.000Z",
      snapshotDataCutoffAt: "2026-09-06T13:45:00.000Z",
      evidenceMaxCapturedAt: "2026-09-06T13:30:00.000Z",
      evidenceMaxModeledAt: "2026-09-06T13:30:00.000Z",
    }),
  }),
});

const output = Object.freeze({
  predictionId: "prediction",
  gameId: "espn:401752601",
  modelVersion: "D-simple-expected-score-linear",
  datasetVersion: "ncaaf-v4-training-foundation-v2",
  featureSchemaVersion: "ncaaf-chronological-team-game-v2",
  featureCutoff: input.input.featureCutoff,
  expectedHomePoints: 31,
  expectedAwayPoints: 24,
  expectedMargin: 7,
  expectedTotal: 55,
  homeWinProbability: .66,
  awayWinProbability: .34,
  marginUncertainty: 17,
  totalUncertainty: 16,
  dataQuality: "MEDIUM" as const,
  configurationHash: "configuration",
  parameterHash: "parameter",
});

function adapter(materialized: MaterializedNcaafCandidateInput = input) {
  return createNcaafV4SharedAdapter({
    materialize: vi.fn(async () => materialized),
    execute: vi.fn(async () => ({
      output,
      outputHash: "output-hash",
      executedAt: now.toISOString(),
    })),
  });
}

describe("NCAAF shared V4 adapter", () => {
  it("maps the exact frozen ESPN execution into a deterministic canonical forecast", async () => {
    const engine = adapter();
    const evidence = await engine.collectEvidence("NCAAF-401752601", now);
    const envelope = await engine.materializeInput(evidence, now);
    const first = await engine.predict(envelope);
    const second = await engine.predict(envelope);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      gameId: "NCAAF-401752601",
      expectedHomeScore: 31,
      expectedAwayScore: 24,
      expectedMargin: 7,
      expectedTotal: 55,
      homeWinProbability: .66,
      awayWinProbability: .34,
      approvalState: "UNVALIDATED",
      qualityFlags: ["V4_VALIDATING", "NO_OFFICIAL_PLAY", "PREVIEW_ONLY", "EXECUTION_HASH:output-hash"],
    });
    engine.validateInput(envelope);
    engine.validateOutput(first, envelope);
  });

  it("routes through the shared registry without enabling publication", async () => {
    const registry = new V4EngineRegistry();
    registry.register(adapter());
    const result = await routeV4Forecast(registry, "NCAAF", "NCAAF-401752601", now);
    expect(result.disposition).toBe("FORECAST");
    if (result.disposition === "FORECAST") {
      expect(result.forecast.approvalState).toBe("UNVALIDATED");
      expect(result.forecast.qualityFlags).toContain("NO_OFFICIAL_PLAY");
    }
  });

  it("rejects a tomorrow slate before shared execution", async () => {
    const tomorrow = Object.freeze({
      ...input,
      input: Object.freeze({ ...input.input, kickoffAt: "2026-09-07T20:00:00.000Z" }),
    });
    await expect(adapter(tomorrow).collectEvidence("NCAAF-401752601", now))
      .rejects.toThrow("CURRENT_EASTERN_DATE_ONLY");
  });

  it("rejects non-ESPN or ambiguous event identity", async () => {
    const mismatched = Object.freeze({
      ...input,
      input: Object.freeze({
        ...input.input,
        stableGameId: "college_football_data:401752601",
        sourceAudit: Object.freeze({
          ...input.input.sourceAudit,
          targetProvider: "college_football_data",
        }),
      }),
    });
    await expect(adapter(mismatched).collectEvidence("NCAAF-401752601", now))
      .rejects.toThrow("EVENT_IDENTITY_MISMATCH");
  });

  it("rejects post-start requests", async () => {
    const afterKickoff = new Date("2026-09-06T20:00:01.000Z");
    await expect(adapter().collectEvidence("NCAAF-401752601", afterKickoff))
      .rejects.toThrow("GAME_ALREADY_STARTED");
  });

  it("rejects a raw ESPN id instead of accepting ambiguous suffix matching", async () => {
    await expect(adapter().collectEvidence("401752601", now))
      .rejects.toThrow("EVENT_IDENTITY_MISMATCH");
  });
});