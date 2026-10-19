import { describe, it, expect } from "vitest";
import { canClaimGame, isPassActive, passProjection, PASS_MS } from "./projectionPassPolicy";
import { stableHash, type V4ArtifactIdentity } from "./v4Platform";

const now = new Date("2026-10-19T17:00:00.000Z");
const start = new Date("2026-10-19T22:00:00.000Z");
const identity = {
  sport: "NFL", modelId: "nfl-v4", modelVersion: "4", artifactId: "test-artifact",
  artifactHash: "a".repeat(64), inputContractVersion: "v4-input", configurationHash: "b".repeat(64),
  parameterHash: "c".repeat(64), contractId: "test", contractHash: "d".repeat(64),
} as V4ArtifactIdentity;
function row(overrides: Record<string, unknown> = {}) {
  const forecastPayload = {
    ...identity, gameId: "one", predictionTimestamp: new Date(now.getTime() - 60_000).toISOString(),
    dataCutoff: new Date(now.getTime() - 120_000).toISOString(),
    expectedHomeScore: 24, expectedAwayScore: 17, homeWinProbability: .7, awayWinProbability: .3,
    privateSignal: "must never escape", ...overrides,
  };
  return { forecastPayload, forecastHash: stableHash(forecastPayload),
    predictedAt: new Date(now.getTime() - 60_000), dataCutoff: new Date(now.getTime() - 120_000),
    eventStart: start, createdAt: now, modelId: identity.modelId, artifactHash: identity.artifactHash };
}
describe("rolling account-bound pass policy", () => {
  it("is exactly 24h, not midnight", () => expect(PASS_MS).toBe(86_400_000));
  it.each([undefined, null, { expiresAt: now }, { expiresAt: new Date(now.getTime() - 1) }])("expires strictly at boundary: %j", pass => {
    expect(isPassActive(pass, now)).toBe(false);
  });
  it("keeps the pass active a millisecond before expiry", () => expect(isPassActive({ expiresAt: new Date(now.getTime() + 1) }, now)).toBe(true));
  it("allows an upcoming game today", () => expect(canClaimGame({ status: "upcoming", startsAt: start, gameDate: "2026-10-19" }, now)).toBe(true));
  it.each(["live", "final", "postponed", "cancelled", "unknown"])("never unlocks %s", status => {
    expect(canClaimGame({ status, startsAt: start, gameDate: "2026-10-19" }, now)).toBe(false);
  });
  it.each([null, now, new Date(now.getTime() - 1), new Date("invalid")])("fails closed at unknown/started kickoff %j", startsAt => {
    expect(canClaimGame({ status: "upcoming", startsAt, gameDate: "2026-10-19" }, now)).toBe(false);
  });
  it("does not spend today's pass on tomorrow", () => expect(canClaimGame({ status: "upcoming", startsAt: start, gameDate: "2026-10-20" }, now)).toBe(false));
  it("uses ET for the slate date", () => expect(canClaimGame({ status: "upcoming", startsAt: new Date("2026-10-20T01:00:00Z"), gameDate: "2026-10-19" }, new Date("2026-10-20T00:30:00Z"))).toBe(true));
});
describe("saved pregame projection allowlist", () => {
  it("reveals only the saved projection's approved public fields", () => {
    const value = passProjection(row(), "one", start, now, identity);
    expect(value).toMatchObject({ projectedWinner: "HOME", expectedHomeScore: 24, drawProbability: null });
    expect(Object.keys(value!)).toHaveLength(7);
    expect(JSON.stringify(value)).not.toMatch(/privateSignal|artifactHash|modelId/);
  });
  it("handles away outcomes", () => expect(passProjection(row({ homeWinProbability: .2, awayWinProbability: .8 }), "one", start, now, identity)?.projectedWinner).toBe("AWAY"));
  it("preserves soccer draw probability", () => expect(passProjection(row({ homeWinProbability: .2, awayWinProbability: .3, drawProbability: .5 }), "one", start, now, identity)?.projectedWinner).toBe("DRAW"));
  it.each([
    { gameId: "different" }, { sport: "NCAAF" }, { artifactHash: "wrong" },
    { modelVersion: "wrong" }, { configurationHash: "wrong" }, { expectedHomeScore: -1 },
    { expectedAwayScore: null }, { homeWinProbability: 1.2 }, { awayWinProbability: "0.3" },
    { drawProbability: -.1 }, { homeWinProbability: .9 },
    { predictionTimestamp: start.toISOString() }, { dataCutoff: start.toISOString() },
  ])("rejects mismatched or invalid saved data %j", overrides => {
    expect(passProjection(row(overrides), "one", start, now, identity)).toBeNull();
  });
  it("detects tampered payload hashes", () => {
    const value = row(); value.forecastPayload.expectedHomeScore = 999;
    expect(passProjection(value, "one", start, now, identity)).toBeNull();
  });
  it("rejects snapshots from a different kickoff", () => expect(passProjection(row(), "one", new Date(start.getTime() + 1), now, identity)).toBeNull());
  it("rejects sources persisted in the future", () => {
    const value = row(); value.createdAt = new Date(now.getTime() + 1);
    expect(passProjection(value, "one", start, now, identity)).toBeNull();
  });
  it("permits legitimate zero score projections", () => expect(passProjection(row({ expectedAwayScore: 0 }), "one", start, now, identity)).not.toBeNull());
});
