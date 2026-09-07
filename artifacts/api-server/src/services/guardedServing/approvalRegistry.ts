import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, modelArtifactApprovalLedgerTable } from "@workspace/db";
import type { ApprovalState, ExactApproval, ExactArtifactIdentity } from "./types";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const STATES = new Set<ApprovalState>([
  "UNVALIDATED", "SHADOW_APPROVED", "GUARDED_APPROVED",
  "FULL_APPROVED", "PRODUCTION_APPROVED", "REVOKED",
]);

export interface GovernedApprovalDecision {
  identity: ExactArtifactIdentity;
  state: ApprovalState;
  governedActor: string;
  reason: string;
  evidenceReference: string;
  decidedAt?: Date;
  eventId?: string;
}

function approvalLockKeys(identity: ExactArtifactIdentity): readonly [number, number] {
  const digest = createHash("sha256").update([
    identity.sport, identity.market, identity.modelId,
    identity.artifactId, identity.artifactHash,
  ].join("\0")).digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)] as const;
}

/** Approval decisions and official writes share this transaction-scoped lock. */
export async function acquireExactApprovalDecisionLock(
  tx: DbTransaction,
  identity: ExactArtifactIdentity,
): Promise<void> {
  const [first, second] = approvalLockKeys(identity);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${first}, ${second})`);
}

export async function appendGovernedApprovalDecision(decision: GovernedApprovalDecision): Promise<string> {
  if (!STATES.has(decision.state)) throw new Error(`Invalid approval state: ${decision.state}`);
  if (!decision.governedActor.trim() || !decision.reason.trim() || !decision.evidenceReference.trim()) {
    throw new Error("Governed actor, reason, and evidence reference are required");
  }
  const eventId = decision.eventId ?? randomUUID();
  await db.transaction(async tx => {
    await acquireExactApprovalDecisionLock(tx, decision.identity);
    await tx.insert(modelArtifactApprovalLedgerTable).values({
      eventId,
      ...decision.identity,
      inputHash: decision.identity.inputHash ?? null,
      configurationHash: decision.identity.configurationHash ?? null,
      parameterHash: decision.identity.parameterHash ?? null,
      approvalState: decision.state,
      governedActor: decision.governedActor,
      reason: decision.reason,
      evidenceReference: decision.evidenceReference,
      decidedAt: decision.decidedAt ?? new Date(),
    });
  });
  return eventId;
}

/** Exact means market and every applicable artifact/config/parameter hash. */
export async function resolveExactApproval(
  identity: ExactArtifactIdentity,
  required: "shadow" | "guarded" | "full",
  tx?: DbTransaction,
): Promise<ExactApproval> {
  const conditions = [
    eq(modelArtifactApprovalLedgerTable.sport, identity.sport),
    eq(modelArtifactApprovalLedgerTable.market, identity.market),
    eq(modelArtifactApprovalLedgerTable.modelFamily, identity.modelFamily),
    eq(modelArtifactApprovalLedgerTable.modelId, identity.modelId),
    eq(modelArtifactApprovalLedgerTable.modelVersion, identity.modelVersion),
    eq(modelArtifactApprovalLedgerTable.artifactId, identity.artifactId),
    eq(modelArtifactApprovalLedgerTable.artifactHash, identity.artifactHash),
    eq(modelArtifactApprovalLedgerTable.inputContractVersion, identity.inputContractVersion),
  ];
  if (identity.inputHash != null) conditions.push(eq(modelArtifactApprovalLedgerTable.inputHash, identity.inputHash));
  if (identity.configurationHash != null) conditions.push(eq(modelArtifactApprovalLedgerTable.configurationHash, identity.configurationHash));
  if (identity.parameterHash != null) conditions.push(eq(modelArtifactApprovalLedgerTable.parameterHash, identity.parameterHash));
  const executor = tx ?? db;
  const [row] = await executor.select().from(modelArtifactApprovalLedgerTable)
    .where(and(...conditions))
    .orderBy(desc(modelArtifactApprovalLedgerTable.decidedAt), desc(modelArtifactApprovalLedgerTable.id))
    .limit(1);
  if (!row) return { state: "UNVALIDATED", approved: false, eventId: null, reason: "EXACT_APPROVAL_RECORD_MISSING", decidedAt: null };
  const state = STATES.has(row.approvalState as ApprovalState)
    ? row.approvalState as ApprovalState
    : "UNVALIDATED";
  const approved = state !== "REVOKED" && (
    required === "shadow"
      ? ["SHADOW_APPROVED", "GUARDED_APPROVED", "FULL_APPROVED", "PRODUCTION_APPROVED"].includes(state)
      : required === "guarded"
        ? ["GUARDED_APPROVED", "FULL_APPROVED", "PRODUCTION_APPROVED"].includes(state)
        : ["FULL_APPROVED", "PRODUCTION_APPROVED"].includes(state)
  );
  return { state, approved, eventId: row.eventId, reason: approved ? "EXACT_APPROVAL_CONFIRMED" : `APPROVAL_STATE_${state}`, decidedAt: row.decidedAt };
}