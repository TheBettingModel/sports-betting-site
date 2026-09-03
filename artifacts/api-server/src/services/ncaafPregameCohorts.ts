/**
 * Cohort assignment is intentionally isolated from forecasting and publication.
 * Callers supply a persistence adapter so this module cannot alter either path.
 */
import { and, eq } from "drizzle-orm";
import {
  db,
  ncaafFeatureSnapshotsTable,
  ncaafPregameCohortAssignmentsTable,
} from "@workspace/db";

export const NCAAF_PREGAME_COHORT_VERSION = "ncaaf-pregame-cohort-v1";
export const NCAAF_CURRENT_COLLECTION_VERSION = "ncaaf-evidence-v1";

/**
 * Fixed activation boundary. Keeping this constant across restarts prevents a
 * future process from moving the prospective-only boundary.
 */
export const NCAAF_LIVE_SHADOW_ACTIVATION = Object.freeze({
  version: "ncaaf-live-shadow-v1",
  activatedAt: new Date("2026-09-03T19:30:00.000Z"),
});

export type NcaafCohortType = "FINAL_PREGAME" | "LIVE_SHADOW";

export interface NcaafFeatureSnapshotReference {
  id: number;
  schemaVersion: string;
  targetProvider: string;
  targetEventId: string;
  season: number;
  dataCutoffAt: Date;
  evidenceMaxModeledAsOf: Date | null;
  features: unknown;
  quality: unknown;
  forecast: unknown;
}

export interface NcaafPregameCohortAssignment {
  id?: number;
  schemaVersion: string;
  cohortType: NcaafCohortType;
  targetProvider: string;
  targetEventId: string;
  featureSnapshotId: number;
  footballIntelligenceSnapshotId: number | null;
  season: number;
  week: number | null;
  kickoffAt: Date;
  cutoffAt: Date;
  featureSchemaVersion: string;
  collectionVersion: string;
  assignmentAt: Date;
  activationAt: Date | null;
  activationVersion: string | null;
  provenance: Record<string, unknown>;
  completeness: unknown;
  quality: unknown;
  missingReasons: unknown;
}

export interface NcaafPregameCohortStore {
  getFeatureSnapshot(id: number): Promise<NcaafFeatureSnapshotReference | undefined>;
  getAssignment(
    cohortType: NcaafCohortType, provider: string, eventId: string,
  ): Promise<NcaafPregameCohortAssignment | undefined>;
  insertAssignment(assignment: NcaafPregameCohortAssignment): Promise<NcaafPregameCohortAssignment>;
}

export interface AssignNcaafPregameCohortInput {
  featureSnapshotId: number;
  footballIntelligenceSnapshotId?: number | null;
  provider: string;
  eventId: string;
  season: number;
  week?: number | null;
  kickoffAt: Date;
  cutoffAt: Date;
  assignmentAt: Date;
  collectionVersion: string;
  provenance: Record<string, unknown>;
}

export const dbNcaafPregameCohortStore: NcaafPregameCohortStore = {
  async getFeatureSnapshot(id) {
    const [row] = await db.select().from(ncaafFeatureSnapshotsTable)
      .where(eq(ncaafFeatureSnapshotsTable.id, id)).limit(1);
    return row;
  },
  async getAssignment(cohortType, provider, eventId) {
    const [row] = await db.select().from(ncaafPregameCohortAssignmentsTable)
      .where(and(
        eq(ncaafPregameCohortAssignmentsTable.cohortType, cohortType),
        eq(ncaafPregameCohortAssignmentsTable.targetProvider, provider),
        eq(ncaafPregameCohortAssignmentsTable.targetEventId, eventId),
      )).limit(1);
    return row ? {
      ...row,
      cohortType: row.cohortType as NcaafCohortType,
      provenance: row.provenance as Record<string, unknown>,
    } : undefined;
  },
  async insertAssignment(assignment) {
    const [row] = await db.insert(ncaafPregameCohortAssignmentsTable)
      .values(assignment).onConflictDoNothing().returning();
    if (!row) {
      const existing = await this.getAssignment(
        assignment.cohortType, assignment.targetProvider, assignment.targetEventId,
      );
      if (!existing) throw new Error("NCAAF cohort insert conflicted without an existing assignment");
      return existing;
    }
    return {
      ...row,
      cohortType: row.cohortType as NcaafCohortType,
      provenance: row.provenance as Record<string, unknown>,
    };
  },
};

function validDate(value: Date, name: string): void {
  if (!Number.isFinite(value.getTime())) throw new Error(`NCAAF cohort ${name} must be a valid timestamp`);
}

/** Provider identifiers must be provider-native, not an old name mapping. */
export function assertNcaafCohortIdentity(provider: string, eventId: string): void {
  if (!provider.trim() || !eventId.trim()) throw new Error("NCAAF cohort requires provider and event identity");
  if (/^(legacy|unmapped|unknown)(:|$)/i.test(provider)
    || /^(legacy|unmapped|unknown)(:|$)/i.test(eventId)) {
    throw new Error("NCAAF cohort rejects legacy or unmapped provider identifiers");
  }
}

function containsMarketField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsMarketField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    /(?:market|odds|sportsbook|bookmaker|moneyline)/i.test(key) || containsMarketField(child));
}

function snapshotQuality(snapshot: NcaafFeatureSnapshotReference): {
  completeness: unknown; quality: unknown; missingReasons: unknown;
} {
  const quality = snapshot.quality as Record<string, unknown> | null;
  if (!quality || !Array.isArray(quality.gameEvidence) || !Array.isArray(quality.entityEvidence)) {
    throw new Error("NCAAF cohort feature snapshot lacks sports-evidence provenance");
  }
  // Feature snapshots may include a market-free forecast label; only persisted
  // evidence payload fields are prohibited from carrying market inputs.
  if (containsMarketField(quality.gameEvidence) || containsMarketField(quality.entityEvidence)
    || containsMarketField(snapshot.features)) {
    throw new Error("NCAAF cohort accepts sports evidence only, not market evidence");
  }
  return {
    completeness: {
      sufficientIndependentEvidence: quality.sufficientIndependentEvidence ?? false,
      evidenceCount: quality.evidenceCount ?? 0,
    },
    quality,
    missingReasons: quality.blockedReasons ?? [],
  };
}

function assertSnapshotMatches(
  snapshot: NcaafFeatureSnapshotReference, input: AssignNcaafPregameCohortInput,
): void {
  if (snapshot.targetProvider !== input.provider || snapshot.targetEventId !== input.eventId
    || snapshot.season !== input.season) {
    throw new Error("NCAAF cohort feature snapshot identity does not match assignment");
  }
  if (snapshot.dataCutoffAt.getTime() !== input.cutoffAt.getTime()) {
    throw new Error("NCAAF cohort cutoff must equal the immutable feature snapshot cutoff");
  }
  if (snapshot.dataCutoffAt >= input.kickoffAt
    || (snapshot.evidenceMaxModeledAsOf && snapshot.evidenceMaxModeledAsOf >= input.kickoffAt)) {
    throw new Error("NCAAF cohort requires feature and evidence cutoffs strictly before kickoff");
  }
  snapshotQuality(snapshot);
}

async function assign(
  store: NcaafPregameCohortStore,
  cohortType: NcaafCohortType,
  input: AssignNcaafPregameCohortInput,
): Promise<NcaafPregameCohortAssignment> {
  assertNcaafCohortIdentity(input.provider, input.eventId);
  for (const [name, value] of Object.entries({
    kickoffAt: input.kickoffAt, cutoffAt: input.cutoffAt, assignmentAt: input.assignmentAt,
  })) validDate(value, name);
  if (input.cutoffAt >= input.kickoffAt) {
    throw new Error("NCAAF cohort cutoff must be strictly before kickoff");
  }
  if (!input.provenance || Object.keys(input.provenance).length === 0) {
    throw new Error("NCAAF cohort requires assignment provenance");
  }
  const existing = await store.getAssignment(cohortType, input.provider, input.eventId);
  if (existing) throw new Error(`NCAAF ${cohortType} cohort assignment already exists and is immutable`);
  const snapshot = await store.getFeatureSnapshot(input.featureSnapshotId);
  if (!snapshot) throw new Error("NCAAF cohort requires an existing immutable feature snapshot");
  assertSnapshotMatches(snapshot, input);
  const evidence = snapshotQuality(snapshot);
  return store.insertAssignment({
    schemaVersion: NCAAF_PREGAME_COHORT_VERSION,
    cohortType,
    targetProvider: input.provider,
    targetEventId: input.eventId,
    featureSnapshotId: snapshot.id,
    footballIntelligenceSnapshotId: input.footballIntelligenceSnapshotId ?? null,
    season: input.season,
    week: input.week ?? null,
    kickoffAt: input.kickoffAt,
    cutoffAt: input.cutoffAt,
    featureSchemaVersion: snapshot.schemaVersion,
    collectionVersion: input.collectionVersion,
    assignmentAt: input.assignmentAt,
    activationAt: cohortType === "LIVE_SHADOW" ? NCAAF_LIVE_SHADOW_ACTIVATION.activatedAt : null,
    activationVersion: cohortType === "LIVE_SHADOW" ? NCAAF_LIVE_SHADOW_ACTIVATION.version : null,
    provenance: input.provenance,
    ...evidence,
  });
}

export async function assignNcaafFinalPregameCohort(
  store: NcaafPregameCohortStore, input: AssignNcaafPregameCohortInput,
): Promise<NcaafPregameCohortAssignment> {
  return assign(store, "FINAL_PREGAME", input);
}

export async function assignNcaafLiveShadowCohort(
  store: NcaafPregameCohortStore, input: AssignNcaafPregameCohortInput,
): Promise<NcaafPregameCohortAssignment> {
  if (input.collectionVersion !== NCAAF_CURRENT_COLLECTION_VERSION) {
    throw new Error("NCAAF LIVE_SHADOW requires the current collection version");
  }
  if (input.assignmentAt < NCAAF_LIVE_SHADOW_ACTIVATION.activatedAt) {
    throw new Error("NCAAF LIVE_SHADOW cannot be backfilled before its activation boundary");
  }
  if (input.assignmentAt >= input.kickoffAt) {
    throw new Error("NCAAF LIVE_SHADOW assignment must be captured before kickoff");
  }
  return assign(store, "LIVE_SHADOW", input);
}

/** Returns the one, immutable FINAL_PREGAME feature reference for an event. */
export async function getNcaafFinalPregameIntelligence(
  store: NcaafPregameCohortStore, game: { provider: string; eventId: string },
): Promise<NcaafFeatureSnapshotReference> {
  assertNcaafCohortIdentity(game.provider, game.eventId);
  const assignment = await store.getAssignment("FINAL_PREGAME", game.provider, game.eventId);
  if (!assignment) throw new Error("No authoritative NCAAF FINAL_PREGAME cohort assignment exists");
  const snapshot = await store.getFeatureSnapshot(assignment.featureSnapshotId);
  if (!snapshot) throw new Error("NCAAF FINAL_PREGAME assignment references a missing feature snapshot");
  if (snapshot.schemaVersion !== assignment.featureSchemaVersion) {
    throw new Error("NCAAF FINAL_PREGAME feature schema reference is inconsistent");
  }
  return snapshot;
}