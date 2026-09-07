import { describe, expect, it } from "vitest";
import { canonicalizeHistoricalEvent, deduplicateHistoricalEvents, freezeHistoricalCohort } from "./v4HistoricalWarehouse";

const event = {
  sport: "NFL" as const,
  provider: "official",
  providerEventId: "1",
  season: "2025",
  eventStart: "2025-09-01T17:00:00.000Z",
  completionTime: "2025-09-01T21:00:00.000Z",
  completionTimeKind: "SOURCE_REPORTED" as const,
  homeParticipantId: "h",
  awayParticipantId: "a",
  homeScore: 24,
  awayScore: 17,
  targetAvailableAt: "2025-09-01T21:00:00.000Z",
  rawEventHash: "a".repeat(64),
};

describe("V4 historical warehouse", () => {
  it("canonicalizes and hashes valid exact identities deterministically", () => {
    const first = canonicalizeHistoricalEvent(event);
    const second = canonicalizeHistoricalEvent(event);
    expect(first).toEqual(second);
    expect(first.eligibility).toBe("ELIGIBLE");
    expect(first.canonicalEventHash).toHaveLength(64);
  });

  it("quarantines unresolved, invalid, and conflicting evidence", () => {
    expect(canonicalizeHistoricalEvent({ ...event, homeParticipantId: null }).quarantineReason)
      .toBe("UNRESOLVED_IDENTITY");
    expect(canonicalizeHistoricalEvent({ ...event, completionTime: null, completionTimeKind: "UNAVAILABLE" }).quarantineReason)
      .toBe("COMPLETION_TIME_UNAVAILABLE");
    const duplicate = deduplicateHistoricalEvents([event, { ...event, homeScore: 99 }]);
    expect(duplicate).toHaveLength(2);
    expect(duplicate.some((row) => row.quarantineReason === "CONFLICTING_DUPLICATE_EVENT")).toBe(true);
  });

  it("freezes reproducible cohort hashes", () => {
    const events = deduplicateHistoricalEvents([event]);
    const input = {
      sport: "NFL" as const, cohortId: "nfl-core", cohortVersion: "1",
      contractId: "core", contractHash: "b".repeat(64), sourceManifest: [],
      events, featureCount: 4, trainingRows: 1, validationRows: 0,
      frozenAt: "2026-09-07T00:00:00.000Z",
    };
    expect(freezeHistoricalCohort(input)).toEqual(freezeHistoricalCohort(input));
  });
});