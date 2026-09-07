import { describe, expect, it } from "vitest";
import {
  assignNcaafFinalPregameCohort,
  assignNcaafLiveShadowCohort,
  getNcaafFinalPregameIntelligence,
  NCAAF_CURRENT_COLLECTION_VERSION,
  NCAAF_LIVE_SHADOW_ACTIVATION,
  type NcaafFeatureSnapshotReference,
  type NcaafPregameCohortAssignment,
  type NcaafPregameCohortStore,
} from "./ncaafPregameCohorts";

const kickoff = new Date("2030-09-07T20:00:00Z");
const cutoff = new Date("2030-09-07T19:00:00Z");
const snapshot: NcaafFeatureSnapshotReference = {
  id: 8, schemaVersion: "ncaaf-features-v1", targetProvider: "espn", targetEventId: "401",
  season: 2030, dataCutoffAt: cutoff, evidenceMaxModeledAsOf: cutoff,
  features: { teams: {} },
  quality: { gameEvidence: [], entityEvidence: [], sufficientIndependentEvidence: false, blockedReasons: ["thin"] },
  forecast: {},
};

function store(): NcaafPregameCohortStore {
  const assignments = new Map<string, NcaafPregameCohortAssignment>();
  const key = (type: string, provider: string, event: string) => `${type}:${provider}:${event}`;
  return {
    getFeatureSnapshot: async (id) => id === snapshot.id ? snapshot : undefined,
    getAssignment: async (type, provider, event) => assignments.get(key(type, provider, event)),
    insertAssignment: async (assignment) => {
      assignments.set(key(assignment.cohortType, assignment.targetProvider, assignment.targetEventId), assignment);
      return assignment;
    },
  };
}

const input = {
  featureSnapshotId: 8, provider: "espn", eventId: "401", season: 2030, kickoffAt: kickoff,
  cutoffAt: cutoff, assignmentAt: new Date("2030-09-07T19:01:00Z"),
  collectionVersion: NCAAF_CURRENT_COLLECTION_VERSION, provenance: { source: "ncaaf feature store" },
};

describe("NCAAF pregame cohorts", () => {
  it("assigns exactly one immutable FINAL_PREGAME snapshot and retrieves it", async () => {
    const memory = store();
    await assignNcaafFinalPregameCohort(memory, input);
    await expect(assignNcaafFinalPregameCohort(memory, input)).rejects.toThrow(/immutable/);
    await expect(getNcaafFinalPregameIntelligence(memory, { provider: "espn", eventId: "401" }))
      .resolves.toBe(snapshot);
  });

  it("rejects non-strict snapshot cutoffs and legacy identities", async () => {
    await expect(assignNcaafFinalPregameCohort(store(), { ...input, cutoffAt: kickoff }))
      .rejects.toThrow(/strictly before/);
    await expect(assignNcaafFinalPregameCohort(store(), { ...input, eventId: "legacy:401" }))
      .rejects.toThrow(/legacy/);
  });

  it("makes LIVE_SHADOW prospective and pins its activation boundary", async () => {
    const assignmentAt = new Date(Math.max(
      NCAAF_LIVE_SHADOW_ACTIVATION.activatedAt.getTime() + 1,
      Date.now() + 1,
    ));
    const futureKickoff = new Date(assignmentAt.getTime() + 60_000);
    const futureCutoff = new Date(assignmentAt.getTime() - 1);
    const liveSnapshot = { ...snapshot, dataCutoffAt: futureCutoff, evidenceMaxModeledAsOf: futureCutoff };
    const memory = store();
    memory.getFeatureSnapshot = async () => liveSnapshot;
    const assigned = await assignNcaafLiveShadowCohort(memory, {
      ...input, kickoffAt: futureKickoff, cutoffAt: futureCutoff, assignmentAt,
    });
    expect(assigned.activationVersion).toBe(NCAAF_LIVE_SHADOW_ACTIVATION.version);
    await expect(assignNcaafLiveShadowCohort(store(), {
      ...input, assignmentAt: new Date(NCAAF_LIVE_SHADOW_ACTIVATION.activatedAt.getTime() - 1),
    })).rejects.toThrow(/backfilled/);
    await expect(assignNcaafLiveShadowCohort(store(), {
      ...input, collectionVersion: "ncaaf-evidence-v0",
    })).rejects.toThrow(/current collection/);
  });
});