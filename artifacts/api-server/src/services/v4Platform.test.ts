import { describe, expect, it } from "vitest";
import {
  V4EngineRegistry,
  routeV4Forecast,
  validateV4Evidence,
  type CanonicalV4Forecast,
  type SportEngineV4,
  type V4EvidenceEnvelope,
} from "./v4Platform";

const input = (): V4EvidenceEnvelope<{ offense: number }> => ({
  gameId: "g1",
  eventStart: "2026-09-07T20:00:00.000Z",
  dataCutoff: "2026-09-07T19:00:00.000Z",
  predictionTimestamp: "2026-09-07T19:01:00.000Z",
  sourceEvidenceTimes: ["2026-09-07T18:59:00.000Z"],
  featureSnapshotId: "s1",
  featureHash: "f".repeat(64),
  input: { offense: 1 },
});
const identity = {
  sport: "MLB" as const,
  modelFamily: "test",
  modelId: "tbm-mlb-v4",
  modelVersion: "v4.0.0",
  artifactId: "test-artifact",
  artifactHash: "a".repeat(64),
  inputContractVersion: "mlb-v4-input",
  configurationHash: "b".repeat(64),
  parameterHash: "d".repeat(64),
  contractId: "mlb-v4",
  contractHash: "c".repeat(64),
};
const output = (): CanonicalV4Forecast => ({
  predictionId: "p1", gameId: "g1", ...identity,
  featureSnapshotId: "s1", featureHash: "f".repeat(64),
  inputHash: "f".repeat(64),
  dataCutoff: "2026-09-07T19:00:00.000Z",
  predictionTimestamp: "2026-09-07T19:01:00.000Z",
  approvalState: "SHADOW", maturity: "DEVELOPING",
  homeWinProbability: .55, awayWinProbability: .45,
  evidenceTier: "BASELINE_CORE", qualityFlags: [],
});
const engine = (): SportEngineV4<{ offense: number }> => ({
  identity, approvalState: "SHADOW", maturity: "DEVELOPING",
  async collectEvidence() { return {}; },
  async materializeInput() { return input(); },
  validateInput() {},
  async predict() { return output(); },
  validateOutput() {},
});

describe("canonical V4 platform", () => {
  it("returns NO_FORECAST and never falls back when no V4 exists", async () => {
    await expect(routeV4Forecast(new V4EngineRegistry(), "NFL", "n1"))
      .resolves.toEqual({
        disposition: "NO_FORECAST", sport: "NFL", gameId: "n1",
        reason: "NO_REGISTERED_V4_ENGINE",
      });
  });
  it("rejects legacy model registration", () => {
    expect(() => new V4EngineRegistry().register({
      ...engine(), identity: { ...identity, modelId: "tbm-mlb-moneyline-v1" },
    })).toThrow("LEGACY_MODEL_REGISTRATION_REJECTED");
  });
  it("executes a deterministic V4 engine", async () => {
    const registry = new V4EngineRegistry();
    registry.register(engine());
    expect((await routeV4Forecast(registry, "MLB", "g1")).disposition).toBe("FORECAST");
  });
  it("fails closed on nondeterminism", async () => {
    const registry = new V4EngineRegistry();
    let call = 0;
    registry.register({ ...engine(), async predict() {
      return { ...output(), predictionId: `p${++call}` };
    } });
    const result = await routeV4Forecast(registry, "MLB", "g1");
    expect(result.disposition).toBe("NO_FORECAST");
    if (result.disposition === "NO_FORECAST") {
      expect(result.reason).toBe("NONDETERMINISTIC_V4_OUTPUT");
    }
  });
  it.each(["moneyline", "closing_line", "final_score"])(
    "rejects forbidden input key %s",
    (key) => {
      expect(() => validateV4Evidence({
        ...input(), input: { nested: { [key]: 1 } },
      })).toThrow(/LEAKAGE/);
    },
  );
  it("rejects post-start and post-cutoff evidence", () => {
    expect(() => validateV4Evidence({
      ...input(), sourceEvidenceTimes: ["2026-09-07T19:00:01.000Z"],
    })).toThrow("PIT_CHRONOLOGY_INVALID");
  });
});