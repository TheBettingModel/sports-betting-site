import { describe, expect, it } from "vitest";
import { buildSavedNcaafCoverage, type SavedNcaafForecast } from "./ncaafSavedSlate";
import { stableHash, type CanonicalV4Forecast, type V4ArtifactIdentity } from "./v4Platform";
import type { DiscoveredV4Event } from "./v4FullSlate";

const identity: V4ArtifactIdentity = {
  sport: "NCAAF", modelFamily: "expected-score-linear", modelId: "tbm-ncaaf-v4-test",
  modelVersion: "v4-test", artifactId: "frozen-test", artifactHash: "a".repeat(64),
  inputContractVersion: "input-v4", configurationHash: "c".repeat(64),
  parameterHash: "d".repeat(64), contractId: "input-v4", contractHash: "b".repeat(64),
};
const now = new Date("2026-10-17T02:00:00Z");
function event(id = "NCAAF-401000001"): DiscoveredV4Event {
  return { gameId: id, sport: "NCAAF", eventStart: "2026-10-17T16:00:00.000Z",
    homeParticipantId: "1", awayParticipantId: "2", homeParticipantName: "Home",
    awayParticipantName: "Away", eligibility: "ELIGIBLE", failureReason: null };
}
function saved(id = event().gameId, change: Partial<CanonicalV4Forecast> = {}): SavedNcaafForecast {
  const forecast: CanonicalV4Forecast = {
    ...identity, gameId: id, predictionId: `prediction-${id}`,
    featureSnapshotId: `snapshot-${id}`, featureHash: "f".repeat(64), inputHash: "f".repeat(64),
    dataCutoff: "2026-10-17T01:30:00.000Z", predictionTimestamp: "2026-10-17T01:45:00.000Z",
    approvalState: "UNVALIDATED", maturity: "DEVELOPING", expectedHomeScore: 31,
    expectedAwayScore: 24, homeWinProbability: .65, awayWinProbability: .35,
    evidenceTier: "V4", qualityFlags: [], ...change,
  };
  return { gameId: id, predictionId: forecast.predictionId, eventStart: new Date(event().eventStart!),
    predictedAt: new Date(forecast.predictionTimestamp), dataCutoff: new Date(forecast.dataCutoff),
    featureSnapshotId: forecast.featureSnapshotId, featureHash: forecast.featureHash,
    forecastHash: stableHash(forecast), forecastPayload: forecast as unknown as Record<string, unknown> };
}
function coverage(rows = [saved()], events = [event()], active: V4ArtifactIdentity | undefined = identity, at = now) {
  return buildSavedNcaafCoverage({ events, rows, identity: active, sportDate: "2026-10-17", now: at });
}

describe("read-only NCAA saved slate", () => {
  it("preserves the exact saved V4 forecast and its original timestamp", () => {
    const row = saved();
    expect(coverage([row]).forecasts).toEqual([row.forecastPayload]);
    expect(coverage([row]).forecasts[0]).toBe(row.forecastPayload);
  });
  it("returns 49 projections and explicit gaps for all 52 Saturday fixtures", () => {
    const events = Array.from({ length: 52 }, (_, i) => event(`NCAAF-${401000000 + i}`));
    const result = coverage(events.slice(0, 49).map(e => saved(e.gameId)), events);
    expect(result).toMatchObject({ scheduledEvents: 52, eligibleEvents: 52, forecastedEvents: 49, failedEvents: 3 });
    expect(result.failures).toEqual(events.slice(49).map(e => ({
      gameId: e.gameId, reason: "NO_VALID_SAVED_PREGAME_PROJECTION",
    })));
    expect(result.forecasts.map(f => f.gameId)).toEqual(events.slice(0, 49).map(e => e.gameId));
  });
  it("handles a cold slate without generation or hiding scheduled games", () => {
    const result = coverage([], [event()]);
    expect(result).toMatchObject({ scheduledEvents: 1, forecastedEvents: 0, failedEvents: 1 });
    expect(result.failures[0]?.reason).toBe("NO_VALID_SAVED_PREGAME_PROJECTION");
  });
  it("handles an empty slate", () => {
    expect(coverage([], [])).toMatchObject({ scheduledEvents: 0, forecastCoveragePct: 100 });
  });
  it("keeps a valid immutable pregame forecast after kickoff", () => {
    expect(coverage([saved()], [event()], identity, new Date("2026-10-17T18:00:00Z")).forecastedEvents).toBe(1);
  });
  it("does not generate a forecast for a started fixture with no saved evidence", () => {
    expect(coverage([], [event()], identity, new Date("2026-10-17T18:00:00Z")).failures[0]?.reason)
      .toBe("EVENT_ALREADY_STARTED");
  });
  it("rejects a row tied to an obsolete kickoff", () => {
    const row = saved(); row.eventStart = new Date("2026-10-18T16:00:00Z");
    expect(coverage([row]).forecastedEvents).toBe(0);
  });
  it("does not cross NFL into the NCAA model", () => {
    expect(coverage([saved(event().gameId, { sport: "NFL" })]).forecastedEvents).toBe(0);
    expect(coverage([saved()], [{ ...event(), sport: "NFL" }]).forecastedEvents).toBe(0);
    expect(coverage([saved()], [event()], { ...identity, sport: "NFL" }).forecastedEvents).toBe(0);
  });
  it("fails closed without a registered active model", () => {
    expect(buildSavedNcaafCoverage({ events: [event()], rows: [saved()],
      identity: undefined, sportDate: "2026-10-17", now }).forecastedEvents).toBe(0);
  });
  it("rejects unresolved fixture identities", () => {
    expect(coverage([saved()], [{ ...event(), eligibility: "INELIGIBLE", failureReason: "UNRESOLVED_IDENTITY" }])
      .failures[0]?.reason).toBe("UNRESOLVED_IDENTITY");
  });
  it.each([
    { artifactHash: "wrong" }, { modelVersion: "old" }, { contractHash: "wrong" },
    { configurationHash: "wrong" }, { parameterHash: "wrong" }, { inputHash: "wrong" },
    { dataCutoff: "2026-10-17T01:46:00.000Z" },
    { predictionTimestamp: "2026-10-17T16:00:00.000Z" },
    { predictionTimestamp: "2026-10-17T03:00:00.000Z" },
    { predictionTimestamp: "invalid" }, { expectedHomeScore: -1 },
    { homeWinProbability: .8 }, { awayWinProbability: Number.NaN },
    { expectedAwayScore: undefined }, { approvalState: "SUSPENDED" },
  ] as Partial<CanonicalV4Forecast>[])("rejects invalid saved output %j", change => {
    expect(coverage([saved(event().gameId, change)]).forecastedEvents).toBe(0);
  });
  it("detects payload tampering and row/payload identity mismatches", () => {
    const tampered = saved(); tampered.forecastPayload["expectedHomeScore"] = 99;
    expect(coverage([tampered]).forecastedEvents).toBe(0);
    const mismatched = saved(); mismatched.predictionId = "different-row";
    expect(coverage([mismatched]).forecastedEvents).toBe(0);
    const missing = saved(); missing.gameId = "NCAAF-999999999";
    expect(coverage([missing]).forecastedEvents).toBe(0);
  });
  it("does not mutate evidence, fixture rows, or frozen artifacts", () => {
    const rows = [saved()]; const events = [event()];
    const before = stableHash({ rows, events, identity });
    coverage(rows, events);
    expect(stableHash({ rows, events, identity })).toBe(before);
  });
});
